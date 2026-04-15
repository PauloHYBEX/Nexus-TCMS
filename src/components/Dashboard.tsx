
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { 
  FileText, 
  TestTube, 
  PlayCircle, 
  Bug,
  Plus,
  Sparkles,
  Calendar,
  Eye
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { 
  getTestPlans, 
  getTestCases, 
  getTestExecutions, 
  getDefects, 
  getRequirements,
  getTestCasesByProject,
  getTestExecutionsByProject,
  getDefectsByProject,
  getRequirementsByProject
} from '@/services/supabaseService';
import { TestPlan, TestCase, TestExecution, Defect, Requirement } from '@/types';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { TestPlanForm } from '@/components/forms/TestPlanForm';
import { TestCaseForm } from '@/components/forms/TestCaseForm';
import { TestExecutionForm } from '@/components/forms/TestExecutionForm';
import { DetailModal } from '@/components/DetailModal';
import { StandardButton } from '@/components/StandardButton';
import { useNavigate } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface RecentItem {
  id: string;
  type: 'plan' | 'case' | 'execution' | 'requirement' | 'defect';
  title: string;
  description?: string;
  updated_at: Date;
  generated_by_ai?: boolean;
  data: TestPlan | TestCase | TestExecution | Requirement | Defect;
}

export const Dashboard = () => {
  const SINGLE_TENANT = String((import.meta as any).env?.VITE_SINGLE_TENANT ?? 'true') === 'true';
  const { user } = useAuth();
  const { settings } = useDashboardSettings();
  const { currentProject, projects } = useProject();
  const navigate = useNavigate();
  const [welcomeName, setWelcomeName] = useState<string>('Usuário');
  const [stats, setStats] = useState({
    totalPlans: 0,
    totalCases: 0,
    totalExecutions: 0,
    totalDefects: 0,
    successRate: 0
  });
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ item: TestPlan | TestCase | TestExecution | Requirement | Defect; type: 'plan' | 'case' | 'execution' | 'requirement' | 'defect' } | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<
    { planId: string; title: string; percent: number; total: number; sequence?: number; plan: TestPlan }[]
  >([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      if (SINGLE_TENANT) {
        setWelcomeName((user.user_metadata as any)?.full_name || user.email || 'Usuário');
      } else {
        try {
          const { data } = await supabase
            .from('profiles' as any)
            .select('display_name, email')
            .eq('id', user.id)
            .maybeSingle();
          setWelcomeName((data as any)?.display_name || user.email || 'Usuário');
        } catch {
          setWelcomeName(user.email || 'Usuário');
        }
      }
      await loadDashboardData();
    };
    load();
  }, [user, currentProject?.id]);

  const loadDashboardData = async () => {
    try {
      // Buscar já filtrado por projeto quando houver currentProject
      let plans: TestPlan[] = [];
      let cases: TestCase[] = [];
      let executions: TestExecution[] = [];
      let defects: Defect[] = [];
      let requirements: Requirement[] = [];

      if (currentProject?.id) {
        const [p, c, e, d, r] = await Promise.all([
          getTestPlans(user!.id, currentProject.id),
          getTestCasesByProject(user!.id, currentProject.id),
          getTestExecutionsByProject(user!.id, currentProject.id),
          getDefectsByProject(user!.id, currentProject.id),
          getRequirementsByProject(user!.id, currentProject.id),
        ]);
        plans = p; cases = c; executions = e; defects = d; requirements = r;
      } else {
        // Agregar apenas dados de projetos ATIVOS
        const active = (projects || []).filter(pr => pr.status === 'active');
        if (active.length === 0) {
          plans = []; cases = []; executions = []; defects = []; requirements = [];
        } else {
          const [plansLists, casesLists, execLists, defectLists, reqLists] = await Promise.all([
            Promise.all(active.map(pj => getTestPlans(user!.id, pj.id))),
            Promise.all(active.map(pj => getTestCasesByProject(user!.id, pj.id))),
            Promise.all(active.map(pj => getTestExecutionsByProject(user!.id, pj.id))),
            Promise.all(active.map(pj => getDefectsByProject(user!.id, pj.id))),
            Promise.all(active.map(pj => getRequirementsByProject(user!.id, pj.id))),
          ]);
          plans = plansLists.flat();
          cases = casesLists.flat();
          executions = execLists.flat();
          defects = defectLists.flat();
          requirements = reqLists.flat();
        }
      }

      const passedExecutions = executions.filter(e => e.status === 'passed').length;
      const successRate = executions.length > 0 ? (passedExecutions / executions.length) * 100 : 0;
      const openDefects = defects.filter(d => d.status !== 'closed').length;

      setStats({
        totalPlans: plans.length,
        totalCases: cases.length,
        totalExecutions: executions.length,
        totalDefects: openDefects,
        successRate: Math.round(successRate)
      });

      // Combinar todos os itens recentes
      const allItems: RecentItem[] = [
        ...plans.map(plan => ({
          id: plan.id,
          type: 'plan' as const,
          title: plan.title,
          description: plan.description,
          updated_at: plan.updated_at,
          generated_by_ai: plan.generated_by_ai,
          data: plan
        })),
        ...cases.map(testCase => ({
          id: testCase.id,
          type: 'case' as const,
          title: testCase.title,
          description: testCase.description,
          updated_at: testCase.updated_at,
          generated_by_ai: testCase.generated_by_ai,
          data: testCase
        })),
        ...executions.map(execution => ({
          id: execution.id,
          type: 'execution' as const,
          title: `Execução #${execution.id.slice(0, 8)}`,
          description: execution.notes,
          updated_at: execution.executed_at,
          data: execution
        })),
        ...requirements.map(requirement => ({
          id: requirement.id,
          type: 'requirement' as const,
          title: requirement.title,
          description: requirement.description,
          updated_at: requirement.updated_at,
          data: requirement
        })),
        ...defects.map(defect => ({
          id: defect.id,
          type: 'defect' as const,
          title: defect.title,
          description: defect.description,
          updated_at: defect.updated_at,
          data: defect
        }))
      ];

      // Ordenar por data mais recente e pegar os 5 primeiros
      allItems.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
      setRecentItems(allItems.slice(0, 5));

      // Progresso por Plano (percentual de aprovados entre executados)
      const progressPerPlan = plans.map((plan) => {
        const exs = executions.filter((e) => e.plan_id === plan.id);
        const executed = exs.filter((e) => e.status !== 'not_tested');
        const passed = exs.filter((e) => e.status === 'passed');
        const denom = executed.length;
        const percent = denom === 0 ? 0 : Math.round((passed.length / denom) * 100);
        return { planId: plan.id, title: plan.title, percent, total: denom, sequence: plan.sequence, plan };
      })
        .sort((a, b) => b.total - a.total || b.percent - a.percent);
      
      // Garantir sempre 3 itens no progresso
      while (progressPerPlan.length < 3) {
        progressPerPlan.push({
          planId: `empty-${progressPerPlan.length}`,
          title: 'Sem dados',
          percent: 0,
          total: 0,
          sequence: undefined,
          plan: null as any
        });
      }
      
      setExecutionProgress(progressPerPlan.slice(0, 3));
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (recentItem: RecentItem) => {
    setSelectedItem({ item: recentItem.data, type: recentItem.type });
    setShowDetailModal(true);
  };

  const handleViewPlanDetails = (planData: { planId: string; title: string; percent: number; total: number; sequence?: number; plan: TestPlan }) => {
    if (planData.plan) {
      setSelectedItem({ item: planData.plan, type: 'plan' });
      setShowDetailModal(true);
    }
  };

  const getQuickActionConfig = () => {
    switch (settings.quickActionType) {
      case 'case':
        return {
          label: 'Novo Caso',
          component: TestCaseForm,
          onSuccess: loadDashboardData
        };
      case 'execution':
        return {
          label: 'Nova Execução',
          component: TestExecutionForm,
          onSuccess: loadDashboardData
        };
      default:
        return {
          label: 'Novo Plano',
          component: TestPlanForm,
          onSuccess: loadDashboardData
        };
    }
  };

  const getTypeIcon = (type: string) => {
    const base = "h-4 w-4";
    switch (type) {
      case 'plan':
        return (
          <div className="h-8 w-8 rounded-md bg-brand/15 flex items-center justify-center">
            <FileText className={`${base} text-brand`} />
          </div>
        );
      case 'case':
        return (
          <div className="h-8 w-8 rounded-md bg-info/15 flex items-center justify-center">
            <TestTube className={`${base} text-info`} />
          </div>
        );
      case 'execution':
        return (
          <div className="h-8 w-8 rounded-md bg-success/15 flex items-center justify-center">
            <PlayCircle className={`${base} text-success`} />
          </div>
        );
      case 'requirement':
        return (
          <div className="h-8 w-8 rounded-md bg-purple-500/15 flex items-center justify-center">
            <FileText className={`${base} text-purple-500`} />
          </div>
        );
      case 'defect':
        return (
          <div className="h-8 w-8 rounded-md bg-destructive/15 flex items-center justify-center">
            <Bug className={`${base} text-destructive`} />
          </div>
        );
      default:
        return (
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
            <FileText className={`${base} text-foreground`} />
          </div>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'plan': return 'Plano';
      case 'case': return 'Caso';
      case 'execution': return 'Execução';
      case 'requirement': return 'Requisito';
      case 'defect': return 'Defeito';
      default: return type;
    }
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return diffSeconds <= 1 ? 'agora' : `${diffSeconds}s atrás`;
    } else if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1min atrás' : `${diffMinutes}min atrás`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1h atrás' : `${diffHours}h atrás`;
    } else if (diffDays === 1) {
      return 'ontem';
    } else if (diffDays === 2) {
      return 'anteontem';
    } else if (diffDays < 7) {
      return `${diffDays} dias atrás`;
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };

  const quickActionConfig = getQuickActionConfig();
  const FormComponent = quickActionConfig.component;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-16">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Bem-vindo, {welcomeName}!</h2>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <Dialog open={showForm} onOpenChange={setShowForm}>
              <DialogTrigger asChild>
                <StandardButton 
                  icon={Plus}
                  variant="brand"
                  disabled={!currentProject || currentProject.status !== 'active'}
                  title={!currentProject ? 'Selecione um projeto ativo para criar' : (currentProject.status !== 'active' ? 'Projeto não ativo — ações de criação desabilitadas' : undefined)}
                >
                  {quickActionConfig.label}
                </StandardButton>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <FormComponent 
                  onSuccess={() => {
                    quickActionConfig.onSuccess();
                    setShowForm(false);
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        {/* Seletor de projeto persistente removido; usar ProjectPicker no topo */}
      </div>

      {/* Stats Cards (compact) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-hover cursor-pointer" onClick={() => navigate('/plans')}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-brand/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-brand" />
              </div>
              <CardTitle className="text-sm font-medium">Planos Ativos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-semibold">{stats.totalPlans}</div>
            <p className="text-[11px] text-muted-foreground">Total de planos ativos</p>
          </CardContent>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => navigate('/executions')}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-success/20 flex items-center justify-center">
                <PlayCircle className="h-5 w-5 text-success" />
              </div>
              <CardTitle className="text-sm font-medium">Execuções em Andamento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-semibold">{stats.totalExecutions}</div>
            <p className="text-[11px] text-muted-foreground">Em execução</p>
          </CardContent>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => navigate('/management?tab=defects')}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-destructive/20 flex items-center justify-center">
                <Bug className="h-5 w-5 text-destructive" />
              </div>
              <CardTitle className="text-sm font-medium">Defeitos Abertos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-semibold">{stats.totalDefects}</div>
            <p className="text-[11px] text-muted-foreground">Defeitos pendentes</p>
          </CardContent>
        </Card>

        <Card className="card-hover cursor-pointer" onClick={() => navigate('/cases')}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-info/20 flex items-center justify-center">
                <TestTube className="h-5 w-5 text-info" />
              </div>
              <CardTitle className="text-sm font-medium">Casos Criados</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-semibold">{stats.totalCases}</div>
            <p className="text-[11px] text-muted-foreground">Total de casos</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress + Recent grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* Progress */}
        <Card className="xl:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xl">Progresso das Execuções</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {executionProgress.length > 0 ? (
              <div className="space-y-2">
                {executionProgress.slice(0, 3).map((row) => (
                  <div 
                    key={row.planId} 
                    className="space-y-1 cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors"
                    onClick={() => handleViewPlanDetails(row)}
                  >
                    <div className="flex items-start justify-between text-sm">
                      <span className="font-medium text-sm pr-2 flex-1 text-left overflow-hidden">
                        {(() => {
                          const sequenceText = row.sequence ? ` — #${row.sequence}` : '';
                          const maxTitleLength = 40 - sequenceText.length;
                          const truncatedTitle = row.title.length > maxTitleLength ? `${row.title.substring(0, maxTitleLength)}...` : row.title;
                          return truncatedTitle + sequenceText;
                        })()}
                      </span>
                      <span className="neon-text font-medium text-sm flex-shrink-0">{row.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Sem execuções ainda.</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Items */}
        <Card className="xl:col-span-1">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {recentItems.length > 0 ? (
              <div className="space-y-3">
                {recentItems.slice(0, 3).map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/30 rounded-lg transition-colors"
                    onClick={() => handleViewDetails(item)}
                  >
                    {getTypeIcon(item.type)}
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="font-medium text-sm text-foreground leading-tight">{item.title}</h3>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getRelativeTime(item.updated_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Nenhuma atividade recente
                </h3>
                <p className="text-muted-foreground">
                  Comece criando seus primeiros planos, casos ou execuções de teste
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        item={selectedItem?.item || null}
        type={selectedItem?.type || 'plan'}
        onEdit={() => {
          // TODO: Implementar edição
          setShowDetailModal(false);
        }}
        onDelete={() => {
          // TODO: Implementar exclusão
          setShowDetailModal(false);
        }}
      />
    </div>
  );
};
