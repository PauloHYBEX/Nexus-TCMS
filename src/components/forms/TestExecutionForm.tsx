
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="w-full max-w-4xl mx-auto border-brand/20 shadow-2xl">
      <CardHeader className="bg-gradient-to-r from-brand/5 to-brand/10 border-b border-brand/20">
        <CardTitle className="text-brand text-xl font-semibold">
          {isEdit ? 'Editar Execução #' + (execution?.id ? execution.id.slice(0, 8) : 'N/A') : 'Registrar Execução de Teste'}
        </CardTitle>
        {isEdit && (
          <p className="text-sm text-muted-foreground mt-1">
            Atualize os campos da execução selecionada.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && !planId && (
            <div>
              <Label htmlFor="project_id">Projeto</Label>
              <ProjectSelectField
                value={selectedProjectId || ''}
                onValueChange={(value) => {
                  setSelectedProjectId(value || null);
                  // reset plano e caso ao mudar projeto
                  setFormData(prev => ({ ...prev, plan_id: '', case_id: '' }));
                  setCases([]);
                  setSelectedCase(null);
                }}
                placeholder="Selecione um projeto"
              />
            </div>
          )}
          {!planId && !isEdit && (
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

          {!caseId && !isEdit && (
            <div>
              <Label htmlFor="case_id">Caso de Teste *</Label>
              <SearchableCombobox
                items={cases.map((c) => ({ value: c.id, label: c.title, hint: c.description?.slice(0, 80) }))}
                value={formData.case_id}
                onChange={(value) => handleChange('case_id', value)}
                placeholder="Selecione um caso de teste"
                disabled={!formData.plan_id && !planId}
              />
            </div>
          )}

          {selectedCase && (
            <Card className="bg-brand/5 border-brand/20">
              <CardHeader>
                <CardTitle className="text-lg text-brand">{selectedCase.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {selectedCase.description}
                </p>
                {selectedCase.steps.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Passos:</h4>
                    <ol className="list-decimal list-inside space-y-1">
                      {selectedCase.steps.map((step) => (
                        <li key={step.id} className="text-sm">
                          <strong>Ação:</strong> {step.action}
                          <br />
                          <strong>Esperado:</strong> {step.expected_result}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div>
            <Label htmlFor="status">Status *</Label>
            <Select value={formData.status} onValueChange={(value) => handleChange('status', value)} required>
              <SelectTrigger className="focus:border-brand/50 focus:ring-brand/20">
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

          <div>
            <Label htmlFor="actual_result">Resultado Obtido</Label>
            <Textarea
              id="actual_result"
              value={formData.actual_result}
              onChange={(e) => handleChange('actual_result', e.target.value)}
              rows={4}
              placeholder="Descreva o resultado obtido durante a execução"
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              placeholder="Adicione observações sobre a execução"
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div>
            <Label htmlFor="executed_by">Executado por *</Label>
            <Textarea
              id="executed_by"
              value={formData.executed_by}
              onChange={(e) => handleChange('executed_by', e.target.value)}
              rows={1}
              required
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={() => { try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ } onCancel?.(); }}>
                Cancelar
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading || !formData.case_id || !formData.plan_id}
              variant="brand"
            >
              {loading ? (isEdit ? 'Salvando...' : 'Registrando...') : (isEdit ? 'Salvar Alterações' : 'Registrar Execução')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
