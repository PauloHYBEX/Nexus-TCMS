
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/contexts/ProjectContext';
import { createTestCase, getTestPlansByProject, updateTestCase, getRequirementsByProject, linkCaseToRequirement, createRequirement } from '@/services/supabaseService';
import { toast } from '@/components/ui/use-toast';
import { TestCase, TestPlan, TestStep, Requirement } from '@/types';
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import SearchableCombobox from '@/components/SearchableCombobox';
import { ProjectSelectField } from '@/components/forms/ProjectSelectField';
import { StandardButton } from '@/components/StandardButton';

interface TestCaseFormProps {
  onSuccess?: (testCase: TestCase) => void;
  onCancel?: () => void;
  planId?: string;
  initialData?: TestCase | null;
}

export const TestCaseForm = ({ onSuccess, onCancel, planId, initialData }: TestCaseFormProps) => {
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [requirementId, setRequirementId] = useState<string>('');
  const [newRequirementTitle, setNewRequirementTitle] = useState<string>('');
  const [reqMode, setReqMode] = useState<'create' | 'link'>('create');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Projeto selecionado localmente no modal (padrão: projeto atual)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProject?.id || null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    preconditions: '',
    expected_result: '',
    priority: 'medium' as const,
    type: 'functional' as const,
    plan_id: planId || '',
    branches: ''
  });
  const [steps, setSteps] = useState<TestStep[]>([
    { id: '1', action: '', expected_result: '', order: 1 }
  ]);

  // Draft persistence helpers — escopo por usuário e projeto para evitar "mock" cross-projeto
  const getDraftKey = () => {
    const scope = `${user?.id || 'anon'}:${currentProject?.id || 'all'}`;
    return initialData ? `draft:testcase:edit:${initialData.id}:${scope}` : `draft:testcase:new:${scope}`;
  };

  useEffect(() => {
    if (user && !planId) loadPlans();
    if (user) loadRequirements();
  }, [user, planId, selectedProjectId]);

  // Prefill when editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        preconditions: initialData.preconditions || '',
        expected_result: initialData.expected_result || '',
        priority: (initialData.priority as any) || 'medium',
        type: (initialData.type as any) || 'functional',
        plan_id: initialData.plan_id || planId || '',
        branches: (initialData as any).branches || ''
      });
      setSteps(
        (Array.isArray(initialData.steps) && initialData.steps.length > 0)
          ? initialData.steps.map((s, idx) => ({
              id: String(idx + 1),
              action: s.action,
              expected_result: s.expected_result,
              order: s.order || idx + 1,
            }))
          : [{ id: '1', action: '', expected_result: '', order: 1 }]
      );
    }
  }, [initialData, planId]);

  // Hydrate draft from localStorage (draft takes precedence over prefill)
  useEffect(() => {
    // Cleanup drafts legados (sem escopo) para evitar preencher com dados antigos
    try { localStorage.removeItem('draft:testcase:new'); } catch {}
    try { if (initialData?.id) localStorage.removeItem(`draft:testcase:edit:${initialData.id}`); } catch {}

    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        formData?: typeof formData;
        steps?: TestStep[];
      };
      // Verifica se o rascunho possui conteúdo significativo
      const hasMeaningfulFormData = !!draft.formData && (
        (draft.formData.title?.trim()?.length ?? 0) > 0 ||
        (draft.formData.description?.trim()?.length ?? 0) > 0 ||
        (draft.formData.preconditions?.trim()?.length ?? 0) > 0 ||
        (draft.formData.expected_result?.trim()?.length ?? 0) > 0 ||
        (!!draft.formData.plan_id && String(draft.formData.plan_id).trim().length > 0)
      );
      const hasMeaningfulSteps = Array.isArray(draft.steps) && draft.steps.some(s =>
        (s?.action?.trim()?.length ?? 0) > 0 || (s?.expected_result?.trim()?.length ?? 0) > 0
      );

      if (!hasMeaningfulFormData && !hasMeaningfulSteps) {
        // Rascunho vazio: remove para não sujar futuras aberturas
        try { localStorage.removeItem(getDraftKey()); } catch (e) { /* noop */ }
        return;
      }

      if (draft.formData) {
        // Mescla campo a campo, preservando o prefill quando o rascunho estiver vazio
        setFormData(prev => ({
          ...prev,
          title: draft.formData!.title?.trim() ? draft.formData!.title : prev.title,
          description: draft.formData!.description?.trim() ? draft.formData!.description : prev.description,
          preconditions: draft.formData!.preconditions?.trim() ? draft.formData!.preconditions : prev.preconditions,
          expected_result: draft.formData!.expected_result?.trim() ? draft.formData!.expected_result : prev.expected_result,
          priority: (draft.formData as any).priority || prev.priority,
          type: (draft.formData as any).type || prev.type,
          plan_id: draft.formData!.plan_id || prev.plan_id,
        }));
      }

      if (hasMeaningfulSteps && Array.isArray(draft.steps)) {
        setSteps(draft.steps.map((s, idx) => ({
          id: s.id || String(idx + 1),
          action: s.action || '',
          expected_result: s.expected_result || '',
          order: s.order || idx + 1,
        })));
      }
    } catch (e) {
      // ignore malformed drafts
      console.warn('Falha ao carregar rascunho de caso de teste');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id, currentProject?.id, user?.id]);

  // Persist draft on changes
  useEffect(() => {
    try {
      const payload = JSON.stringify({ formData, steps });
      localStorage.setItem(getDraftKey(), payload);
    } catch (e) {
      // ignore quota errors
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, steps, initialData?.id, currentProject?.id, user?.id]);

  const loadPlans = async () => {
    try {
      const data = selectedProjectId
        ? await getTestPlansByProject(user!.id, selectedProjectId)
        : [];
      setPlans(data);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
    }
  };

  const loadRequirements = async () => {
    try {
      const data = selectedProjectId
        ? await getRequirementsByProject(user!.id, selectedProjectId)
        : [];
      setRequirements(data);
    } catch (error) {
      console.error('Erro ao carregar requisitos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Exigir seleção de Plano para garantir vínculo com projeto
      if (!formData.plan_id) {
        toast({ title: 'Selecione um plano', description: 'Para criar um Caso é necessário escolher um Plano de Teste.', variant: 'destructive' });
        setLoading(false);
        return;
      }
      // Normalize empty UUIDs to null to avoid Postgres uuid parse errors
      const cleanPlanId = formData.plan_id && formData.plan_id.trim() !== '' ? formData.plan_id : null;

      const payload = {
        ...formData,
        plan_id: cleanPlanId,
        steps: steps.filter(step => step.action.trim() !== ''),
        user_id: user.id,
        generated_by_ai: initialData?.generated_by_ai ?? false,
      } as any;

      const testCase = initialData
        ? await updateTestCase(initialData.id, payload)
        : await createTestCase(payload);

      // Requisito: criar novo OU vincular existente
      if (!initialData) {
        if (reqMode === 'create' && newRequirementTitle.trim()) {
          try {
            const newReq = await createRequirement({
              user_id: user.id,
              project_id: selectedProjectId || (plans.find(p => p.id === formData.plan_id) as any)?.project_id || '',
              title: newRequirementTitle.trim(),
              description: `Criado a partir do caso de teste: ${testCase.title}`,
              priority: 'medium',
              status: 'open',
            } as any);
            await linkCaseToRequirement(user.id, newReq.id, testCase.id);
          } catch {}
        } else if (reqMode === 'link' && requirementId) {
          try { await linkCaseToRequirement(user.id, requirementId, testCase.id); } catch {}
        }
      }

      toast({
        title: "Sucesso",
        description: initialData ? "Caso de teste atualizado com sucesso!" : "Caso de teste criado com sucesso!"
      });

      try { localStorage.removeItem(getDraftKey()); } catch (e) { /* noop */ }

      onSuccess?.(testCase);
    } catch (error) {
      console.error('Erro ao salvar caso:', error);
      toast({
        title: "Erro",
        description: initialData ? "Erro ao atualizar caso de teste" : "Erro ao criar caso de teste",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    try { localStorage.removeItem(getDraftKey()); } catch (e) { /* noop */ }
    onCancel?.();
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addStep = () => {
    const newStep: TestStep = {
      id: Date.now().toString(),
      action: '',
      expected_result: '',
      order: steps.length + 1
    };
    setSteps(prev => [...prev, newStep]);
  };

  const removeStep = (stepId: string) => {
    setSteps(prev => prev.filter(step => step.id !== stepId));
  };

  const updateStep = (stepId: string, field: keyof TestStep, value: string) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, [field]: value } : step
    ));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Projeto (só quando não vem de planId) */}
      {!initialData && !planId && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projeto</Label>
          <ProjectSelectField
            value={selectedProjectId || ''}
            onValueChange={(value) => {
              setSelectedProjectId(value || null);
              setFormData(prev => ({ ...prev, plan_id: '' }));
            }}
            placeholder="Selecione um projeto"
          />
        </div>
      )}

      {/* Título + Plano */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tc-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Título *</Label>
          <Input
            id="tc-title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Título do caso de teste"
            required
            className="h-9 bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0"
          />
        </div>
        {!planId && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plano de Teste *</Label>
            <SearchableCombobox
              items={plans.map((p) => ({ value: p.id, label: p.title }))}
              value={formData.plan_id}
              onChange={(value) => handleChange('plan_id', value)}
              placeholder="Selecione um plano"
              disabled={!selectedProjectId}
            />
          </div>
        )}
      </div>

      {/* Prioridade + Tipo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prioridade</Label>
          <Select value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>
            <SelectTrigger className="h-9 bg-muted/30 border-border/60 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="critical">Crítica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</Label>
          <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
            <SelectTrigger className="h-9 bg-muted/30 border-border/60 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="functional">Funcional</SelectItem>
              <SelectItem value="integration">Integração</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="security">Segurança</SelectItem>
              <SelectItem value="usability">Usabilidade</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requisito (criar novo ou vincular existente) */}
      {!initialData && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Requisito <span className="normal-case font-normal">(opcional)</span></Label>
            <div className="flex rounded-md border border-border/60 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setReqMode('create')}
                className={`px-2.5 py-1 transition-colors ${reqMode === 'create' ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >Criar novo</button>
              <button
                type="button"
                onClick={() => setReqMode('link')}
                className={`px-2.5 py-1 transition-colors border-l border-border/60 ${reqMode === 'link' ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >Vincular existente</button>
            </div>
          </div>
          {reqMode === 'create' ? (
            <Input
              value={newRequirementTitle}
              onChange={e => setNewRequirementTitle(e.target.value)}
              placeholder="Título do novo requisito (deixe vazio para ignorar)"
              className="h-9 bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0"
            />
          ) : (
            <SearchableCombobox
              items={requirements.map(r => ({ value: r.id, label: `${r.sequence ? `REQ-${String(r.sequence).padStart(3,'0')} — ` : ''}${r.title}` }))}
              value={requirementId}
              onChange={(value) => setRequirementId(value || '')}
              placeholder="Selecione um requisito existente"
              disabled={!selectedProjectId}
            />
          )}
        </div>
      )}

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label htmlFor="tc-desc" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</Label>
        <Textarea
          id="tc-desc"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Contexto e objetivo do caso..."
          rows={2}
          className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
        />
      </div>

      {/* Campos avançados */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showAdvanced ? 'Ocultar campos avançados' : 'Campos avançados (pré-condições, passos, resultado esperado)'}
      </button>

      {showAdvanced && (
        <div className="space-y-4 pt-1 border-t border-border/40">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Branch(es)</Label>
            <Textarea
              value={formData.branches}
              onChange={(e) => handleChange('branches', e.target.value)}
              rows={1}
              placeholder="Ex: sprint_16_06_login ou feature/checkout (separe por espaço)"
              className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pré-condições</Label>
            <Textarea
              value={formData.preconditions}
              onChange={(e) => handleChange('preconditions', e.target.value)}
              rows={2}
              className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Passos do Teste</Label>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex gap-2 items-start p-3 rounded-lg bg-muted/20 border border-border/40">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded shrink-0">{index + 1}</span>
                      <Textarea
                        value={step.action}
                        onChange={(e) => updateStep(step.id, 'action', e.target.value)}
                        placeholder="Ação a executar"
                        rows={1}
                        className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none text-sm"
                      />
                    </div>
                    <Textarea
                      value={step.expected_result}
                      onChange={(e) => updateStep(step.id, 'expected_result', e.target.value)}
                      placeholder="Resultado esperado"
                      rows={1}
                      className="bg-muted/40 border-border/40 focus:border-brand/50 focus:ring-0 resize-none text-xs text-muted-foreground"
                    />
                  </div>
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(step.id)} className="text-muted-foreground hover:text-destructive transition-colors mt-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar passo
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resultado Esperado Final</Label>
            <Textarea
              value={formData.expected_result}
              onChange={(e) => handleChange('expected_result', e.target.value)}
              rows={2}
              className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        {onCancel && (
          <StandardButton type="button" variant="outline" onClick={handleCancel}>Cancelar</StandardButton>
        )}
        <StandardButton type="submit" disabled={loading || !formData.plan_id} variant="brand">
          {loading ? (initialData ? 'Salvando...' : 'Criando...') : (initialData ? 'Salvar Caso' : 'Criar Caso')}
        </StandardButton>
      </div>
    </form>
  );
};
