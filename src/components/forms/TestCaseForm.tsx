
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/contexts/ProjectContext';
import { createTestCase, getTestPlans, getTestPlansByProject, updateTestCase } from '@/services/supabaseService';
import { toast } from '@/components/ui/use-toast';
import { TestCase, TestPlan, TestStep } from '@/types';
import { Plus, Trash2 } from 'lucide-react';
import SearchableCombobox from '@/components/SearchableCombobox';
import { ProjectSelectField } from '@/components/forms/ProjectSelectField';

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
  // Projeto selecionado localmente no modal (padrão: projeto atual)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProject?.id || null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    preconditions: '',
    expected_result: '',
    priority: 'medium' as const,
    type: 'functional' as const,
    plan_id: planId || ''
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
    if (user && !planId) {
      loadPlans();
    }
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
        plan_id: initialData.plan_id || planId || ''
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
      // Carrega somente planos do projeto selecionado localmente. Sem projeto, lista vazia.
      const data = selectedProjectId 
        ? await getTestPlansByProject(user!.id, selectedProjectId)
        : [];
      setPlans(data);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
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

      toast({
        title: "Sucesso",
        description: initialData ? "Caso de teste atualizado com sucesso!" : "Caso de teste criado com sucesso!"
      });

      // Clear draft on success
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
    <Card className="w-full max-w-4xl mx-auto border-brand/20 shadow-2xl">
      <CardHeader className="bg-gradient-to-r from-brand/5 to-brand/10 border-b border-brand/20">
        <CardTitle className="text-brand text-xl font-semibold">
          {initialData ? 'Editar Caso de Teste #' + (initialData.id ? initialData.id.slice(0, 8) : 'N/A') : 'Criar Novo Caso de Teste'}
        </CardTitle>
        {initialData && (
          <p className="text-sm text-muted-foreground mt-1">
            Atualize os campos do caso de teste selecionado.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seleção de Projeto local no modal */}
          {!initialData && !planId && (
            <div>
              <Label htmlFor="project_id">Projeto</Label>
              <ProjectSelectField
                value={selectedProjectId || ''}
                onValueChange={(value) => {
                  setSelectedProjectId(value || null);
                  // Ao trocar de projeto, resetar plano selecionado
                  setFormData(prev => ({ ...prev, plan_id: '' }));
                }}
                placeholder="Selecione um projeto"
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
            {!planId && (
              <div>
                <Label htmlFor="plan_id">Plano de Teste *</Label>
                <SearchableCombobox
                  items={plans.map((p) => ({ value: p.id, label: p.title, hint: (p as any).description?.slice(0, 80) }))}
                  value={formData.plan_id}
                  onChange={(value) => handleChange('plan_id', value)}
                  placeholder="Selecione um plano"
                  disabled={loading || !selectedProjectId}
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="priority">Prioridade</Label>
              <Select value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>
                <SelectTrigger className="focus:border-brand/50 focus:ring-brand/20">
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
            <div>
              <Label htmlFor="type">Tipo</Label>
              <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                <SelectTrigger className="focus:border-brand/50 focus:ring-brand/20">
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

          <div>
            <Label htmlFor="preconditions">Pré-condições</Label>
            <Textarea
              id="preconditions"
              value={formData.preconditions}
              onChange={(e) => handleChange('preconditions', e.target.value)}
              rows={2}
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div>
            <Label>Passos do Teste</Label>
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="border border-brand/20 rounded-lg p-4 bg-brand/5">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Passo {index + 1}</Label>
                    {steps.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <div>
                      <Label>Ação</Label>
                      <Textarea
                        value={step.action}
                        onChange={(e) => updateStep(step.id, 'action', e.target.value)}
                        rows={2}
                        className="focus:border-brand/50 focus:ring-brand/20"
                      />
                    </div>
                    <div>
                      <Label>Resultado Esperado</Label>
                      <Textarea
                        value={step.expected_result}
                        onChange={(e) => updateStep(step.id, 'expected_result', e.target.value)}
                        rows={2}
                        className="focus:border-brand/50 focus:ring-brand/20"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addStep} className="border-brand/30 text-brand hover:bg-brand/10">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Passo
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="expected_result">Resultado Esperado Final</Label>
            <Textarea
              id="expected_result"
              value={formData.expected_result}
              onChange={(e) => handleChange('expected_result', e.target.value)}
              rows={3}
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={loading || !formData.plan_id} className="bg-brand hover:bg-brand/90 text-white">
              {loading ? (initialData ? 'Salvando...' : 'Criando...') : (initialData ? 'Salvar Alterações' : 'Criar Caso')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
