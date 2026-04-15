import { useEffect, useState } from 'react';
import { Sparkles, Files, FileText, TestTube, PlayCircle, Eye, Info, User, Layers } from 'lucide-react';
import { AIGeneratorForm } from '@/components/forms/AIGeneratorForm';
import { AIBatchGeneratorForm } from '@/components/forms/AIBatchGeneratorForm';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { AIBatchModal } from '@/components/AIBatchModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface GeneratedItem {
  id: string;
  title: string;
  description: string;
  objective?: string;
  scope?: string;
  approach?: string;
  criteria?: string;
  resources?: string;
  schedule?: string;
  risks?: string;
  preconditions?: string;
  expected_result?: string;
  priority?: string;
  type?: string;
  steps?: Array<{
    action: string;
    expected_result: string;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'regenerating';
}

type GenerationType = 'plan' | 'case' | 'execution';

interface GenerationOption {
  type: GenerationType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  permission: string;
}

export const AIGenerator = () => {
  const [showForm, setShowForm] = useState(false);
  const [generationType, setGenerationType] = useState<'plan' | 'case' | 'execution'>('plan');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showPlanWithCasesModal, setShowPlanWithCasesModal] = useState(false);
  const [generatedPlans, setGeneratedPlans] = useState<GeneratedItem[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<GeneratedItem | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const navigate = useNavigate();
  // Modo local da página (sem localStorage): 'individual' ou 'batch'
  const [batchMode, setBatchMode] = useState<'individual' | 'batch'>('individual');
  // Layout simplificado: geração individual ou em lote controlado pelos ícones do cabeçalho
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, loading } = usePermissions();
  const { currentProject } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';

  const canGeneratePlan = hasPermission('can_use_ai') && hasPermission('can_manage_plans') && !isProjectInactive;
  const canGenerateCase = hasPermission('can_use_ai') && hasPermission('can_manage_cases') && !isProjectInactive;
  const canGenerateExecution = hasPermission('can_use_ai') && hasPermission('can_manage_executions') && !isProjectInactive;
  const planDisabled = loading || isProjectInactive || !canGeneratePlan;
  const caseDisabled = loading || isProjectInactive || !canGenerateCase;
  const executionDisabled = loading || isProjectInactive || !canGenerateExecution;

  // Sincroniza o estado com o query param ?type=
  useEffect(() => {
    const t = searchParams.get('type');
    if (t === 'plan' || t === 'case' || t === 'execution') {
      setGenerationType(t);
      setShowForm(true);
    }
  }, [searchParams]);

  type BatchPayload = { plans?: Partial<GeneratedItem>[]; cases?: Partial<GeneratedItem>[] };
  const isBatchPayload = (v: unknown): v is BatchPayload => {
    if (typeof v !== 'object' || v === null) return false;
    const obj = v as Record<string, unknown>;
    return Array.isArray(obj.plans) || Array.isArray(obj.cases);
  };

  const handleGenerationSuccess = (data: unknown) => {
    setShowForm(false);
    if (batchMode === 'batch' && (generationType === 'plan' || generationType === 'case')) {
      // Para geração em lote, abrir o modal de revisão
      if (isBatchPayload(data)) {
        const source = (data.plans || data.cases) as Partial<GeneratedItem>[];
        const itemsWithStatus: GeneratedItem[] = source.map((item) => ({
          ...(item as GeneratedItem),
          id: (item.id as string) || Math.random().toString(36).slice(2, 11),
          status: 'pending'
        }));
        setGeneratedPlans(itemsWithStatus);
        setShowBatchModal(true);
      }
    } else {
      // Para geração individual, redirecionar normalmente
      if (generationType === 'plan') {
        navigate('/plans');
      } else if (generationType === 'case') {
        navigate('/cases');
      } else {
        navigate('/executions');
      }
    }
  };

  const handlePlanApprove = (planId: string) => {
    setGeneratedPlans(prev => 
      prev.map(plan => 
        plan.id === planId ? { ...plan, status: 'approved' as const } : plan
      )
    );
  };

  const handlePlanReject = (planId: string) => {
    setGeneratedPlans(prev => 
      prev.map(plan => 
        plan.id === planId ? { ...plan, status: 'rejected' as const } : plan
      )
    );
  };

  const handlePlanRegenerate = (planId: string, feedback: string) => {
    setGeneratedPlans(prev => 
      prev.map(plan => 
        plan.id === planId ? { ...plan, status: 'regenerating' as const } : plan
      )
    );
    // Aqui você implementaria a lógica para regenerar o plano com o feedback
    console.log(`Regenerating plan ${planId} with feedback: ${feedback}`);
  };

  const handleViewPlanDetails = (plan: GeneratedItem) => {
    setSelectedPlan(plan);
    setShowPlanDetails(true);
  };

  // Modal de criação (substitui o retorno condicional anterior)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Gerador IA</h2>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button aria-label="Como funciona" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-2 max-w-sm">
                  <div className="text-sm font-medium">Como funciona</div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                    <li>Descreva seu projeto ou forneça um documento</li>
                    <li>A IA analisa e gera planos/casos/execuções</li>
                    <li>Revise, ajuste e salve</li>
                  </ol>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={batchMode === 'individual' ? 'brand' : 'ghost'}
                  size="icon"
                  aria-label="Modo individual"
                  aria-pressed={batchMode === 'individual'}
                  onClick={() => setBatchMode('individual')}
                >
                  <User className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Individual</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={batchMode === 'batch' ? 'brand' : 'ghost'}
                  size="icon"
                  aria-label="Modo em lote"
                  aria-pressed={batchMode === 'batch'}
                  onClick={() => setBatchMode('batch')}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Em lote</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Skeleton enquanto permissões carregam */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div className="h-[120px] rounded-xl border bg-gray-200/60 dark:bg-gray-800/60 animate-pulse" />
          <div className="h-[120px] rounded-xl border bg-gray-200/60 dark:bg-gray-800/60 animate-pulse" />
          <div className="h-[120px] rounded-xl border bg-gray-200/60 dark:bg-gray-800/60 animate-pulse" />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          <Card className="overflow-hidden rounded-2xl">
            <div className="divide-y">
              {/* Plano */}
              <div
                className={`relative grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5 transition-colors ${planDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40'}`}
                role="button"
                tabIndex={planDisabled ? -1 : 0}
                aria-disabled={planDisabled}
                aria-label={batchMode === 'batch' ? 'Gerar Vários Planos' : 'Gerar Plano de Teste'}
                onKeyDown={(e) => {
                  if (planDisabled) return;
                  const active = document.activeElement as HTMLElement | null;
                  if (active && active.closest('[data-role="plan-with-cases-trigger"]')) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setGenerationType('plan');
                    setShowForm(true);
                    setSearchParams({ type: 'plan' });
                  }
                }}
                onClick={(e) => {
                  if (planDisabled) return;
                  const target = e.target as HTMLElement | null;
                  if (target && target.closest('[data-role="plan-with-cases-trigger"]')) return;
                  setGenerationType('plan');
                  setShowForm(true);
                  setSearchParams({ type: 'plan' });
                }}
              >
                <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900">
                  {batchMode === 'batch' ? (
                    <Files className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div className="text-center">
                  <div className="font-semibold flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {batchMode === 'batch' ? 'Gerar Vários Planos' : 'Gerar Plano de Teste'}
                  </div>
                </div>
                {!planDisabled && (
                  <button
                    type="button"
                    className="ml-auto h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]"
                    title="Plano Único com Casos (IA)"
                    aria-label="Plano Único com Casos (IA)"
                    data-role="plan-with-cases-trigger"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onKeyDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowPlanWithCasesModal(true); }}
                  >
                    <Files className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </button>
                )}
              </div>

              {/* Casos */}
              <div
                className={`relative grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5 transition-colors ${caseDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40'}`}
                role="button"
                tabIndex={caseDisabled ? -1 : 0}
                aria-disabled={caseDisabled}
                aria-label={batchMode === 'batch' ? 'Gerar Vários Casos' : 'Gerar Casos de Teste'}
                onKeyDown={(e) => {
                  if (caseDisabled) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setGenerationType('case');
                    setShowForm(true);
                    setSearchParams({ type: 'case' });
                  }
                }}
                onClick={() => {
                  if (!canGenerateCase || caseDisabled) return;
                  setGenerationType('case');
                  setShowForm(true);
                  setSearchParams({ type: 'case' });
                }}
              >
                <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900">
                  {batchMode === 'batch' ? (
                    <Files className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <TestTube className="h-6 w-6 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div className="text-center">
                  <div className="font-semibold flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {batchMode === 'batch' ? 'Gerar Vários Casos' : 'Gerar Casos de Teste'}
                  </div>
                </div>
                {/* Placeholder para manter a centralização igual à primeira linha */}
                <div className="h-9 w-9 opacity-0 pointer-events-none" aria-hidden />
              </div>

              {/* Execução */}
              <div
                className={`relative grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5 transition-colors ${executionDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40'}`}
                role="button"
                tabIndex={executionDisabled ? -1 : 0}
                aria-disabled={executionDisabled}
                aria-label={'Gerar Execução de Teste'}
                onKeyDown={(e) => {
                  if (executionDisabled) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setGenerationType('execution');
                    setShowForm(true);
                    setSearchParams({ type: 'execution' });
                  }
                }}
                onClick={() => {
                  if (executionDisabled) return;
                  setGenerationType('execution');
                  setShowForm(true);
                  setSearchParams({ type: 'execution' });
                }}
              >
                <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900">
                  <PlayCircle className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-center">
                  <div className="font-semibold flex items-center justify-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Gerar Execução de Teste
                  </div>
                </div>
                {/* Placeholder para manter a centralização igual à primeira linha */}
                <div className="h-9 w-9 opacity-0 pointer-events-none" aria-hidden />
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* Modal de Criação (Formulários) */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setSearchParams({}); }}>
        <DialogContent className="max-w-3xl" aria-describedby="ai-create-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {generationType === 'plan' ? <FileText className="h-5 w-5" /> : generationType === 'case' ? <TestTube className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
              {(batchMode === 'batch' && generationType === 'plan') ? 'Gerar Vários Planos de Teste com IA' :
               (batchMode === 'batch' && generationType === 'case') ? 'Gerar Vários Casos de Teste com IA' :
                `Gerar ${generationType === 'plan' ? 'Plano' : generationType === 'case' ? 'Caso' : 'Execução'} de Teste com IA`}
            </DialogTitle>
            <DialogDescription id="ai-create-desc" className="sr-only">
              Criar artefatos de teste com IA
            </DialogDescription>
          </DialogHeader>
            {(batchMode === 'batch' && (generationType === 'plan' || generationType === 'case')) ? (
              <AIBatchGeneratorForm onSuccess={handleGenerationSuccess} type={generationType} />
            ) : (
              <AIGeneratorForm onSuccess={handleGenerationSuccess} initialType={generationType} />
            )}
        </DialogContent>
      </Dialog>
      <AIBatchModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        plans={generatedPlans}
        onApprove={handlePlanApprove}
        onReject={handlePlanReject}
        onRegenerate={handlePlanRegenerate}
        onViewDetails={handleViewPlanDetails}
      />

      {/* Modal para Plano Único com Múltiplos Casos */}
      <Dialog open={showPlanWithCasesModal} onOpenChange={setShowPlanWithCasesModal}>
        <DialogContent className="max-w-3xl" aria-describedby="plan-with-cases-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Files className="h-5 w-5" />
              Plano Único com Múltiplos Casos (IA)
            </DialogTitle>
            <DialogDescription id="plan-with-cases-desc">
              Cole a tabela/descrição. A IA consolidará um plano e gerará vários casos de teste.
            </DialogDescription>
          </DialogHeader>
            <AIBatchGeneratorForm
              type="plan"
              mode="plan-with-cases"
              onSuccess={() => {
                setShowPlanWithCasesModal(false);
                navigate('/plans');
              }}
            />
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes */}
      <Dialog open={showPlanDetails} onOpenChange={setShowPlanDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="plan-details-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalhes do {generationType === 'case' ? 'Caso' : 'Plano'} Gerado
            </DialogTitle>
            <DialogDescription id="plan-details-desc">
              Visualize todos os detalhes do {generationType === 'case' ? 'caso' : 'plano'} de teste gerado pela IA
            </DialogDescription>
          </DialogHeader>
          
          {selectedPlan && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedPlan.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-1">{selectedPlan.description}</p>
              </div>
              
              {generationType === 'plan' ? (
                (() => {
                  const obj = selectedPlan.objective?.toString().trim();
                  const scope = selectedPlan.scope?.toString().trim();
                  const approach = selectedPlan.approach?.toString().trim();
                  const criteria = selectedPlan.criteria?.toString().trim();
                  const resources = selectedPlan.resources?.toString().trim();
                  const schedule = selectedPlan.schedule?.toString().trim();
                  const risks = selectedPlan.risks?.toString().trim();
                  const hasAny = Boolean(obj || scope || approach || criteria || resources || schedule || risks);
                  if (!hasAny) return null;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {obj && (
                        <div>
                          <h4 className="font-medium mb-2">Objetivo</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{obj}</p>
                        </div>
                      )}
                      {scope && (
                        <div>
                          <h4 className="font-medium mb-2">Escopo</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{scope}</p>
                        </div>
                      )}
                      {approach && (
                        <div>
                          <h4 className="font-medium mb-2">Abordagem</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{approach}</p>
                        </div>
                      )}
                      {criteria && (
                        <div>
                          <h4 className="font-medium mb-2">Critérios</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{criteria}</p>
                        </div>
                      )}
                      {resources && (
                        <div>
                          <h4 className="font-medium mb-2">Recursos</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{resources}</p>
                        </div>
                      )}
                      {schedule && (
                        <div>
                          <h4 className="font-medium mb-2">Cronograma</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{schedule}</p>
                        </div>
                      )}
                      {risks && (
                        <div className="md:col-span-2">
                          <h4 className="font-medium mb-2">Riscos</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{risks}</p>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-4">
                  {selectedPlan.preconditions && (
                    <div>
                      <h4 className="font-medium mb-2">Pré-condições</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{selectedPlan.preconditions}</p>
                    </div>
                  )}
                  
                  {selectedPlan.steps && selectedPlan.steps.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Passos do Teste</h4>
                      <div className="space-y-2">
                        {selectedPlan.steps.map((step, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="font-medium text-sm">Passo {index + 1}</div>
                            <div className="text-sm mt-1">
                              <strong>Ação:</strong> {step.action}
                            </div>
                            <div className="text-sm">
                              <strong>Resultado Esperado:</strong> {step.expected_result}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedPlan.expected_result && (
                    <div>
                      <h4 className="font-medium mb-2">Resultado Final Esperado</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{selectedPlan.expected_result}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-4">
                    {selectedPlan.priority && (
                      <div>
                        <h4 className="font-medium mb-2">Prioridade</h4>
                        <Badge className={
                          selectedPlan.priority === 'critical' ? 'bg-red-100 text-red-800' :
                          selectedPlan.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                          selectedPlan.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }>
                          {selectedPlan.priority}
                        </Badge>
                      </div>
                    )}
                    
                    {selectedPlan.type && (
                      <div>
                        <h4 className="font-medium mb-2">Tipo</h4>
                        <Badge variant="outline">{selectedPlan.type}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
