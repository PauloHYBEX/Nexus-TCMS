import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History as HistoryIcon, FileText, TestTube, PlayCircle, Sparkles, Calendar, Eye, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getTestPlans, getTestCases, getTestExecutions, deleteTestPlan, deleteTestCase, deleteTestExecution, getTestCasesByProject, getTestExecutionsByProject } from '@/services/supabaseService';
import { TestPlan, TestCase, TestExecution } from '@/types';
import { DetailModal } from '@/components/DetailModal';
import { useNavigate } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { toast } from '@/components/ui/use-toast';
import { priorityBadgeClass, priorityLabel, executionStatusBadgeClass, executionStatusLabel } from '@/lib/labels';

interface HistoryItem {
  id: string;
  type: 'plan' | 'case' | 'execution';
  title: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
  generated_by_ai?: boolean;
  status?: string;
  priority?: string;
  data: TestPlan | TestCase | TestExecution;
}

export const History = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadHistoryData();
    }
  }, [user, currentProject?.id, projects]);

  const loadHistoryData = async () => {
    try {
      let plans: TestPlan[] = [];
      let cases: TestCase[] = [];
      let executions: TestExecution[] = [];

      if (currentProject?.id) {
        const [p, c, e] = await Promise.all([
          getTestPlans(user!.id, currentProject.id),
          getTestCasesByProject(user!.id, currentProject.id),
          getTestExecutionsByProject(user!.id, currentProject.id)
        ]);
        plans = p; cases = c; executions = e;
      } else {
        const active = (projects || []).filter(pr => pr.status === 'active');
        if (active.length > 0) {
          const [pLists, cLists, eLists] = await Promise.all([
            Promise.all(active.map(pj => getTestPlans(user!.id, pj.id))),
            Promise.all(active.map(pj => getTestCasesByProject(user!.id, pj.id))),
            Promise.all(active.map(pj => getTestExecutionsByProject(user!.id, pj.id)))
          ]);
          plans = pLists.flat();
          cases = cLists.flat();
          executions = eLists.flat();
        } else {
          plans = []; cases = []; executions = [];
        }
      }

      const historyItems: HistoryItem[] = [
        ...plans.map(plan => ({
          id: plan.id,
          type: 'plan' as const,
          title: plan.title,
          description: plan.description,
          created_at: plan.created_at,
          updated_at: plan.updated_at,
          generated_by_ai: plan.generated_by_ai,
          data: plan
        })),
        ...cases.map(testCase => ({
          id: testCase.id,
          type: 'case' as const,
          title: testCase.title,
          description: testCase.description,
          created_at: testCase.created_at,
          updated_at: testCase.updated_at,
          generated_by_ai: testCase.generated_by_ai,
          priority: testCase.priority,
          data: testCase
        })),
        ...executions.map(execution => ({
          id: execution.id,
          type: 'execution' as const,
          title: `Execução #${execution.id.slice(0, 8)}`,
          description: execution.notes,
          created_at: execution.executed_at,
          updated_at: execution.executed_at,
          status: execution.status,
          data: execution
        }))
      ];

      // Ordenar por data mais recente
      historyItems.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
      setItems(historyItems);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar histórico",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (item: HistoryItem) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const handleEdit = (item: HistoryItem) => {
    if (!currentProject || isProjectInactive) return;
    // Redirecionar para a página apropriada com modo de edição
    if (item.type === 'plan') {
      navigate(`/plans?edit=${item.id}`);
    } else if (item.type === 'case') {
      navigate(`/cases?edit=${item.id}`);
    } else {
      navigate(`/executions?edit=${item.id}`);
    }
  };

  const handleDeleteClick = (id: string) => {
    if (!currentProject || isProjectInactive) return;
    if (confirmDeleteId === id) {
      // Confirmar exclusão
      handleDelete(id, items.find(item => item.id === id)?.type as 'plan' | 'case' | 'execution');
      setConfirmDeleteId(null);
    } else {
      // Marcar para confirmação
      setConfirmDeleteId(id);
    }
  };

  const handleDelete = async (id: string, type: 'plan' | 'case' | 'execution') => {
    try {
      if (type === 'plan') {
        await deleteTestPlan(id);
      } else if (type === 'case') {
        await deleteTestCase(id);
      } else {
        await deleteTestExecution(id);
      }

      toast({
        title: "Sucesso",
        description: `${type === 'plan' ? 'Plano' : type === 'case' ? 'Caso' : 'Execução'} excluído com sucesso!`
      });

      // Recarregar dados
      loadHistoryData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir item",
        variant: "destructive"
      });
    }
  };

  const handleCardClick = (item: HistoryItem) => {
    // Redirecionar para a página específica do item
    if (item.type === 'plan') {
      navigate('/plans');
    } else if (item.type === 'case') {
      navigate('/cases');
    } else {
      navigate('/executions');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'plan': return <FileText className="h-5 w-5 text-blue-600" />;
      case 'case': return <TestTube className="h-5 w-5 text-green-600" />;
      case 'execution': return <PlayCircle className="h-5 w-5 text-purple-600" />;
      default: return <HistoryIcon className="h-5 w-5" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'plan': return 'Plano de Teste';
      case 'case': return 'Caso de Teste';
      case 'execution': return 'Execução';
      default: return type;
    }
  };

  // Labels e classes centralizados
  const getStatusColor = (status?: string) => (status ? executionStatusBadgeClass(status as any) : '');
  const getStatusText = (status?: string) => (status ? executionStatusLabel(status as any) : '');
  const getPriorityColor = (priority?: string) => (priority ? priorityBadgeClass(priority as any) : '');
  const getPriorityText = (priority?: string) => (priority ? priorityLabel(priority as any) : '');

  // Trunca descrições longas para manter os cards compactos
  const truncateText = (txt?: string, max: number = 160) => {
    if (!txt) return '';
    const clean = txt.replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Histórico</h2>
        <p className="text-gray-600 dark:text-gray-400">Visualize todas as suas atividades recentes</p>
      </div>

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={`${item.type}-${item.id}`} className="hover:shadow-md transition-shadow h-40 overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => handleCardClick(item)}
                  >
                    {getTypeIcon(item.type)}
                    <div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <p className="text-sm text-gray-500">{getTypeLabel(item.type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.generated_by_ai && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        IA
                      </Badge>
                    )}
                    {item.status && (
                      <Badge className={getStatusColor(item.status)}>
                        {getStatusText(item.status)}
                      </Badge>
                    )}
                    {item.priority && (
                      <Badge className={getPriorityColor(item.priority)}>
                        {getPriorityText(item.priority)}
                      </Badge>
                    )}
                    
                    {/* Botões de ação */}
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDetails(item);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={!currentProject || isProjectInactive}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(item);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant={confirmDeleteId === item.id ? "destructive" : "outline"}
                        disabled={!currentProject || isProjectInactive}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(item.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 text-left">
                    {truncateText(item.description)}
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500 text-left">
                  <Calendar className="h-3 w-3" />
                  Última atualização: {item.updated_at.toLocaleDateString()} às {item.updated_at.toLocaleTimeString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <HistoryIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Nenhum histórico encontrado
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Comece criando seus primeiros planos, casos ou execuções de teste
          </p>
        </div>
      )}

      {/* Modal de detalhes */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        item={selectedItem?.data || null}
        type={selectedItem?.type || 'plan'}
        onEdit={() => {
          if (selectedItem) {
            handleEdit(selectedItem);
            setShowDetailModal(false);
          }
        }}
        onDelete={(id) => {
          if (selectedItem) {
            handleDelete(id, selectedItem.type);
            setShowDetailModal(false);
          }
        }}
      />
    </div>
  );
};
