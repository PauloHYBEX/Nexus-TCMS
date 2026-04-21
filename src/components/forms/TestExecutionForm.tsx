
import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/contexts/ProjectContext';
import { createTestExecution, getTestCases, getTestPlans, updateTestExecution } from '@/services/supabaseService';
import { toast } from '@/components/ui/use-toast';
import { TestExecution, TestCase, TestPlan } from '@/types';
import SearchableCombobox from '@/components/SearchableCombobox';
import { ProjectSelectField } from '@/components/forms/ProjectSelectField';
import { StandardButton } from '@/components/StandardButton';

interface TestExecutionFormProps {
  onSuccess?: (execution: TestExecution) => void;
  onCancel?: () => void;
  caseId?: string;
  planId?: string;
  execution?: TestExecution; // when provided, form works in edit mode
}

export const TestExecutionForm = ({ onSuccess, onCancel, caseId, planId, execution }: TestExecutionFormProps) => {
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  // Projeto selecionado localmente no modal (padrão: projeto atual)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProject?.id || null);
  const [formData, setFormData] = useState<{
    case_id: string;
    plan_id: string;
    status: TestExecution['status'];
    actual_result: string;
    notes: string;
    executed_by: string;
  }>({
    case_id: caseId || '',
    plan_id: planId || '',
    status: 'not_tested',
    actual_result: '',
    notes: '',
    executed_by: user?.email || ''
  });

  const isEdit = !!execution;
  const storageKey = (() => {
    const scope = `${user?.id || 'anon'}:${currentProject?.id || 'all'}`;
    return isEdit ? `draft:testexec:edit:${execution?.id}:${scope}` : `draft:testexec:new:${scope}`;
  })();

  useEffect(() => {
    if (user) {
      loadPlans();
      if (planId) {
        loadCases(planId);
      }
      // In edit mode, ensure cases for the execution's plan are loaded
      if (execution?.plan_id) {
        loadCases(execution.plan_id);
      }
    }
  }, [user, planId, execution?.plan_id, selectedProjectId]);

  // Hydrate draft from localStorage
  useEffect(() => {
    // Cleanup drafts legados (sem escopo) para evitar preencher com dados antigos
    try { localStorage.removeItem('draft:testexec:new'); } catch (_e) { void _e; }
    try { if (execution?.id) localStorage.removeItem(`draft:testexec:edit:${execution.id}`); } catch (_e) { void _e; }

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setFormData(prev => ({ ...prev, ...saved }));
      }
    } catch (e) { /* noop */ }
     
  }, [storageKey]);

  useEffect(() => {
    if (formData.plan_id && !planId) {
      loadCases(formData.plan_id);
    }
  }, [formData.plan_id, planId]);

  useEffect(() => {
    if (caseId && cases.length > 0) {
      const caseData = cases.find(c => c.id === caseId);
      setSelectedCase(caseData || null);
    }
  }, [caseId, cases]);

  // Prefill when editing
  useEffect(() => {
    if (execution) {
      setFormData({
        case_id: execution.case_id,
        plan_id: execution.plan_id,
        status: execution.status,
        actual_result: execution.actual_result || '',
        notes: execution.notes || '',
        executed_by: execution.executed_by || user?.email || ''
      });
      // Try to set selected case once cases are available
      const caseData = cases.find(c => c.id === execution.case_id);
      if (caseData) setSelectedCase(caseData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution, cases.length]);

  // Persist draft on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    } catch (e) { /* noop */ }
  }, [formData, storageKey]);

  const loadPlans = async () => {
    try {
      const data = selectedProjectId ? await getTestPlans(user!.id, selectedProjectId) : [];
      setPlans(data);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
    }
  };

  const loadCases = async (selectedPlanId: string) => {
    try {
      const data = await getTestCases(user!.id, selectedPlanId);
      setCases(data);
    } catch (error) {
      console.error('Erro ao carregar casos:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      if (isEdit && execution) {
        const updated = await updateTestExecution(execution.id, {
          status: formData.status,
          actual_result: formData.actual_result,
          notes: formData.notes,
          executed_by: formData.executed_by,
        });
        toast({
          title: 'Sucesso',
          description: 'Execução atualizada com sucesso!'
        });
        onSuccess?.(updated);
        try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ }
      } else {
        // Validação: garantir que o caso pertence ao plano selecionado
        const chosenCase = cases.find(c => c.id === formData.case_id);
        if (!formData.plan_id || !formData.case_id || !chosenCase) {
          toast({ title: 'Dados incompletos', description: 'Selecione um Plano e um Caso de Teste válidos.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        if (chosenCase.plan_id !== formData.plan_id) {
          toast({ title: 'Inconsistência nos vínculos', description: 'O Caso selecionado não pertence ao Plano escolhido.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        const created = await createTestExecution({
          ...formData,
          user_id: user.id
        });
        toast({
          title: "Sucesso",
          description: "Execução registrada com sucesso!"
        });
        onSuccess?.(created);
        try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ }
      }
    } catch (error) {
      console.error('Erro ao criar execução:', error);
      toast({
        title: "Erro",
        description: isEdit ? 'Erro ao atualizar execução' : "Erro ao registrar execução",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'case_id') {
      const caseData = cases.find(c => c.id === value);
      setSelectedCase(caseData || null);
    }
    if (field === 'plan_id') {
      // ao mudar o plano, resetar caso selecionado para evitar vínculos inconsistentes
      setSelectedCase(null);
      setFormData(prev => ({ ...prev, case_id: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Projeto */}
      {!isEdit && !planId && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projeto</Label>
          <ProjectSelectField
            value={selectedProjectId || ''}
            onValueChange={(value) => {
              setSelectedProjectId(value || null);
              setFormData(prev => ({ ...prev, plan_id: '', case_id: '' }));
              setCases([]);
              setSelectedCase(null);
            }}
            placeholder="Selecione um projeto"
          />
        </div>
      )}

      {/* Plano + Caso */}
      {!isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          {!caseId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Caso de Teste *</Label>
              <SearchableCombobox
                items={cases.map((c) => ({ value: c.id, label: `${c.sequence ? `#${c.sequence} ` : ''}${c.title}` }))}
                value={formData.case_id}
                onChange={(value) => handleChange('case_id', value)}
                placeholder="Selecione um caso"
                disabled={!formData.plan_id && !planId}
              />
            </div>
          )}
        </div>
      )}

      {/* Preview do caso selecionado */}
      {selectedCase && (
        <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-1.5">
          <p className="text-xs font-medium text-brand">{selectedCase.title}</p>
          {selectedCase.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{selectedCase.description}</p>
          )}
          {selectedCase.steps.length > 0 && (
            <ol className="text-xs text-muted-foreground space-y-0.5 pl-3 list-decimal">
              {selectedCase.steps.slice(0, 3).map(s => (
                <li key={s.id}>{s.action}</li>
              ))}
              {selectedCase.steps.length > 3 && <li className="text-brand/60">+{selectedCase.steps.length - 3} passos...</li>}
            </ol>
          )}
        </div>
      )}

      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status *</Label>
        <Select value={formData.status} onValueChange={(value) => handleChange('status', value)} required>
          <SelectTrigger className="h-9 bg-muted/30 border-border/60 focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="passed">Aprovado</SelectItem>
            <SelectItem value="failed">Reprovado</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
            <SelectItem value="not_tested">Não Testado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Executado por */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Executado por</Label>
        <input
          value={formData.executed_by}
          onChange={(e) => handleChange('executed_by', e.target.value)}
          className="w-full h-9 rounded-md bg-muted/30 border border-border/60 px-3 text-sm focus:outline-none focus:border-brand/50"
          required
        />
      </div>

      {/* Resultado obtido */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resultado Obtido</Label>
        <Textarea
          value={formData.actual_result}
          onChange={(e) => handleChange('actual_result', e.target.value)}
          placeholder="Descreva o que ocorreu durante a execução..."
          rows={3}
          className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
        />
      </div>

      {/* Observações */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observações</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Informações adicionais..."
          rows={2}
          className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        {onCancel && (
          <StandardButton type="button" variant="outline" onClick={() => { try { localStorage.removeItem(storageKey); } catch {} onCancel?.(); }}>
            Cancelar
          </StandardButton>
        )}
        <StandardButton type="submit" disabled={loading || !formData.case_id || !formData.plan_id} variant="brand">
          {loading ? (isEdit ? 'Salvando...' : 'Registrando...') : (isEdit ? 'Salvar Execução' : 'Registrar Execução')}
        </StandardButton>
      </div>
    </form>
  );
};
