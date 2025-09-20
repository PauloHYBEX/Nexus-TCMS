import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Search, ArrowUpDown, Filter, FileText, List, Grid, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getTestCases, getTestCasesByProject, deleteTestCase, getTestPlans, getCaseLinkedCounts } from '@/services/supabaseService';
import { TestCase } from '@/types';
import { TestCaseForm } from '@/components/forms/TestCaseForm';
import { DetailModal } from '@/components/DetailModal';
import { StandardButton } from '@/components/StandardButton';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { priorityBadgeClass, priorityLabel } from '@/lib/labels';
import { testCaseTypeBadgeClass, testCaseTypeLabel } from '@/lib/labels';
import { useProject } from '@/contexts/ProjectContext';
import { ProjectDisplayField } from '@/components/ProjectDisplayField';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export const TestCases = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  
  // Estados principais
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // UI Estados
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const savedMode = localStorage.getItem('testCases_viewMode');
    return (savedMode as 'cards' | 'list') || 'list';
  });
  const [sortBy, setSortBy] = useState<'title' | 'created_at' | 'updated_at' | 'priority'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planProjectMap, setPlanProjectMap] = useState<Record<string, string>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [caseLinkedCounts, setCaseLinkedCounts] = useState<{ executionCount: number; defectCount: number } | null>(null);

  // Carregar casos com base no filtro de projeto
  const loadCases = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      let data: TestCase[] = [];

      if (currentProject?.id) {
        data = await getTestCasesByProject(user.id, currentProject.id);
        const plans = await getTestPlans(user.id, currentProject.id);
        const map: Record<string, string> = {};
        plans.forEach((p) => { map[p.id] = p.project_id; });
        setPlanProjectMap(map);
      } else {
        // Agregar APENAS projetos ATIVOS ao usar "Todos"
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length > 0) {
          const [casesLists, plansLists] = await Promise.all([
            Promise.all(active.map(p => getTestCasesByProject(user.id, p.id))),
            Promise.all(active.map(p => getTestPlans(user.id, p.id)))
          ]);
          data = casesLists.flat();
          const plans = plansLists.flat();
          const map: Record<string, string> = {};
          plans.forEach((p) => { map[p.id] = p.project_id; });
          setPlanProjectMap(map);
        } else {
          data = [];
          setPlanProjectMap({});
        }
      }

      setCases(data);
    } catch (error) {
      console.error('Erro ao carregar casos:', error);
      toast({ 
        title: 'Erro', 
        description: 'Falha ao carregar casos de teste.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Efeito para carregar casos quando projeto muda
  useEffect(() => {
    loadCases();
  }, [user, currentProject?.id, projects]);

  // Removido filtro de projeto local: controle é global pelo Dashboard

  // Salvar modo de visualização
  useEffect(() => {
    localStorage.setItem('testCases_viewMode', viewMode);
  }, [viewMode]);

  // Listener para broadcast de troca de projeto (padronizado)
  useEffect(() => {
    const handler = () => loadCases();
    window.addEventListener('krg:project-changed', handler as EventListener);
    return () => window.removeEventListener('krg:project-changed', handler as EventListener);
  }, []);

  // Sincronizar modal de detalhes com a URL (?id=...&modal=case:view)
  useEffect(() => {
    const id = searchParams.get('id');
    const modal = searchParams.get('modal');
    if (id && (modal === 'case:view' || !modal)) {
      const found = cases.find(c => c.id === id);
      if (found) {
        setSelectedCase(found);
        setShowDetailModal(true);
      }
    }
  }, [cases, searchParams]);

  // Casos filtrados e ordenados
  const filteredCases = useMemo(() => {
    const filtered = cases.filter(testCase => {
      const matchesSearch = searchTerm === '' || 
        testCase.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        testCase.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        testCase.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || testCase.priority === filterStatus;
      
      return matchesSearch && matchesStatus;
    });

    // Ordenação
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case 'priority': {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 } as const;
          const pa = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          const pb = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          comparison = pa - pb;
          break;
        }
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [cases, searchTerm, filterStatus, sortBy, sortOrder]);

  // Paginação
  const totalItems = filteredCases.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCases.slice(start, start + pageSize);
  }, [filteredCases, currentPage, pageSize]);

  // Quando houver múltiplos projetos entre os casos filtrados, prefixar IDs para evitar ambiguidade visual
  const multipleProjects = useMemo(() => {
    const ids = new Set(filteredCases.map(tc => (planProjectMap[tc.plan_id] || '')));
    return ids.size > 1;
  }, [filteredCases, planProjectMap]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, sortBy, sortOrder]);

  // Handlers para filtros
  const handleSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Removido: manipulação de filtro de projeto local

  // Handlers
  const handleCaseCreated = (testCase: TestCase) => {
    setCases(prev => [testCase, ...prev]);
    setShowForm(false);
    setEditingCase(null);
    toast({ title: 'Sucesso', description: 'Caso de teste criado com sucesso!' });
  };

  const handleCaseUpdated = (updated: TestCase) => {
    setCases(prev => prev.map(c => c.id === updated.id ? updated : c));
    setShowForm(false);
    setEditingCase(null);
    toast({ title: 'Sucesso', description: 'Caso de teste atualizado com sucesso!' });
  };

  const handleEdit = (testCase: TestCase) => {
    setEditingCase(testCase);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingCaseId(id);
    setConfirmDeleteOpen(true);
    setCaseLinkedCounts(null);
    try {
      if (user) {
        const counts = await getCaseLinkedCounts(user.id, id);
        setCaseLinkedCounts(counts);
      }
    } catch (error) {
      console.error('Erro ao verificar vínculos do caso:', error);
      setCaseLinkedCounts({ executionCount: 0, defectCount: 0 });
    }
  };

  const performDeleteCase = async () => {
    if (!deletingCaseId) return;
    if (isProjectInactive) {
      toast({ title: 'Projeto não ativo', description: 'Exclusão desabilitada.', variant: 'destructive' });
      setConfirmDeleteOpen(false);
      setDeletingCaseId(null);
      setCaseLinkedCounts(null);
      return;
    }
    try {
      if (caseLinkedCounts && (caseLinkedCounts.executionCount > 0 || caseLinkedCounts.defectCount > 0)) {
        toast({
          title: 'Exclusão bloqueada',
          description: 'Este caso possui execuções e/ou defeitos vinculados. Remova as dependências antes de excluir.',
          variant: 'destructive'
        });
        setConfirmDeleteOpen(false);
        setDeletingCaseId(null);
        return;
      }
      await deleteTestCase(deletingCaseId);
      setCases(prev => prev.filter(c => c.id !== deletingCaseId));
      toast({ title: 'Sucesso', description: 'Caso de teste excluído com sucesso!' });
      if (selectedCase?.id === deletingCaseId) {
        setSelectedCase(null);
        setShowDetailModal(false);
        setSearchParams(prev => {
          const np = new URLSearchParams(prev);
          np.delete('id');
          np.delete('modal');
          return np;
        });
      }
    } catch (error) {
      toast({ 
        title: 'Erro', 
        description: 'Erro ao excluir caso de teste', 
        variant: 'destructive' 
      });
    } finally {
      setConfirmDeleteOpen(false);
      setDeletingCaseId(null);
      setCaseLinkedCounts(null);
    }
  };

  const handleViewDetails = (testCase: TestCase) => {
    setSelectedCase(testCase);
    setShowDetailModal(true);
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      np.set('id', testCase.id);
      np.set('modal', 'case:view');
      return np;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-pulse text-muted-foreground">Carregando casos...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="pl-24">
          <h1 className="text-2xl font-bold text-foreground">Casos de Teste</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus casos de teste</p>
        </div>
        <StandardButton 
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0"
          disabled={!currentProject || currentProject.status !== 'active'}
          title={!currentProject ? 'Selecione um projeto ativo para criar casos' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Caso de Teste
        </StandardButton>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => handleSearchTermChange(e.target.value)}
            placeholder="Buscar por título, ID ou descrição"
            className="pl-10 h-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Seletor de projeto removido — seleção global pelo Dashboard */}
          
          {/* View Mode Toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className={viewMode === 'cards' ? 'bg-brand text-brand-foreground' : ''}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-brand text-brand-foreground' : ''}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Ordenar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSortBy('updated_at'); setSortOrder('desc'); }}>
                Mais recente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('updated_at'); setSortOrder('asc'); }}>
                Mais antigo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('title'); setSortOrder('asc'); }}>
                Título (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('title'); setSortOrder('desc'); }}>
                Título (Z-A)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('priority'); setSortOrder('desc'); }}>
                Prioridade (Alta-Baixa)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                {filterStatus === 'all' ? 'Todos' : `Prioridade: ${priorityLabel(filterStatus as 'low'|'medium'|'high'|'critical')}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterStatus('all')}>
                Todos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFilterStatus('low')}>
                Prioridade Baixa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus('medium')}>
                Prioridade Média
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus('high')}>
                Prioridade Alta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus('critical')}>
                Prioridade Crítica
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                Exportar como CSV
              </DropdownMenuItem>
              <DropdownMenuItem>
                Exportar como Excel
              </DropdownMenuItem>
              <DropdownMenuItem>
                Exportar como PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Content */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.length > 0 ? paginatedCases.map((testCase) => (
            <Card
              key={testCase.id}
              className="border border-border/50 cursor-pointer card-hover"
              onClick={() => handleViewDetails(testCase)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
                      {`CT-${testCase.sequence ? String(testCase.sequence).padStart(3, '0') : (testCase.id?.slice(0, 4) || '----')}`}
                    </span>
                    <CardTitle className="text-base line-clamp-2 leading-tight min-w-0">
                      {testCase.title}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {testCase.description || 'Sem descrição'}
                </p>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    <Badge variant="outline" className={priorityBadgeClass(testCase.priority)}>
                      {priorityLabel(testCase.priority)}
                    </Badge>
                    <Badge variant="outline" className={testCaseTypeBadgeClass(testCase.type)}>
                      {testCaseTypeLabel(testCase.type)}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {testCase.created_at ? new Date(testCase.created_at).toLocaleDateString('pt-BR') : 'N/A'}
                  </div>
                  <StandardButton 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleViewDetails(testCase); }}
                  >
                    Ver Detalhes
                  </StandardButton>
                </div>
              </CardContent>
            </Card>
          )) : (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">Nenhum resultado encontrado com os filtros atuais.</p>
            </div>
          )}
        </div>
      ) : (
        // Lista em formato tabela
        <div className="space-y-2">
          {filteredCases.length > 0 ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Header da tabela */}
              <div className="grid grid-cols-[80px_1fr_120px_120px_120px_100px] items-start gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <div>ID</div>
                <div className="text-center pt-px">Título</div>
                <div className="text-center">Projeto</div>
                <div className="text-center">Prioridade</div>
                <div className="text-center">Criado em</div>
                <div className="flex justify-end">Ações</div>
              </div>
              
              {/* Linhas da tabela */}
              <div className="divide-y divide-border">
                {paginatedCases.map((testCase) => (
                  <div 
                    key={testCase.id} 
                    className="grid grid-cols-[80px_1fr_120px_120px_120px_100px] items-start gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(testCase)}
                  >
                    <div className="flex items-center">
                      <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-1 rounded">
                        {`CT-${testCase.sequence ? String(testCase.sequence).padStart(3, '0') : (testCase.id?.slice(0, 4) || '----')}`}
                      </span>
                    </div>
                    
                    <div className="flex items-start min-w-0 self-start justify-center text-center">
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight text-foreground truncate">{testCase.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{testCase.description || 'Sem descrição'}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center">
                      <ProjectDisplayField projectId={planProjectMap[testCase.plan_id] || ''} />
                    </div>
                    
                    <div className="flex items-center justify-center">
                      <Badge variant="outline" className={priorityBadgeClass(testCase.priority)}>
                        {priorityLabel(testCase.priority)}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-center text-xs text-muted-foreground">
                      {testCase.created_at ? new Date(testCase.created_at).toLocaleDateString('pt-BR') : 'N/A'}
                    </div>
                    
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(testCase);
                        }}
                        disabled={!currentProject || currentProject.status !== 'active'}
                        title={!currentProject ? 'Selecione um projeto ativo para editar casos' : (currentProject.status !== 'active' ? 'Projeto não ativo — edição desabilitada' : undefined)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(testCase.id);
                        }}
                        className="h-8 w-8 p-0"
                        disabled={!currentProject || isProjectInactive}
                        title={!currentProject ? 'Selecione um projeto ativo para excluir casos' : (isProjectInactive ? 'Projeto não ativo — exclusão desabilitada' : undefined)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum caso encontrado</h3>
              <p className="text-muted-foreground mb-4">
                Comece criando seu primeiro caso de teste
              </p>
              <StandardButton
                onClick={() => setShowForm(true)}
                className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0"
                disabled={!currentProject || currentProject.status !== 'active'}
                title={!currentProject ? 'Selecione um projeto ativo para criar casos' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Caso
              </StandardButton>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalItems)} de {totalItems}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Itens por página:</span>
            <select 
              value={pageSize} 
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-3 py-1 border border-border rounded bg-background text-foreground text-sm"
            >
              <option value={9}>9</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Criação/Edição */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCase ? 'Editar Caso de Teste' : 'Novo Caso de Teste'}
            </DialogTitle>
            <DialogDescription>
              Preencha os campos para {editingCase ? 'atualizar' : 'criar'} um caso de teste.
            </DialogDescription>
          </DialogHeader>
          <TestCaseForm 
            initialData={editingCase}
            onSuccess={editingCase ? handleCaseUpdated : handleCaseCreated}
            onCancel={() => {
              setShowForm(false);
              setEditingCase(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedCase(null);
          setSearchParams(prev => {
            const np = new URLSearchParams(prev);
            np.delete('id');
            np.delete('modal');
            return np;
          });
        }}
        item={selectedCase}
        type="case"
        onEdit={handleEdit}
        onDelete={(id) => handleDelete(id)}
      />

      {/* Confirm Delete Modal */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={(open) => {
        setConfirmDeleteOpen(open);
        if (!open) {
          setDeletingCaseId(null);
          setCaseLinkedCounts(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir caso de teste?</AlertDialogTitle>
            <AlertDialogDescription>
              {caseLinkedCounts == null && 'Verificando dependências...'}
              {caseLinkedCounts && (caseLinkedCounts.executionCount > 0 || caseLinkedCounts.defectCount > 0)
                ? (
                  <span>
                    Este caso possui {caseLinkedCounts.executionCount} execução(ões) e {caseLinkedCounts.defectCount} defeito(s) vinculados.
                    Remova essas dependências antes de excluir o caso para manter a integridade dos dados.
                  </span>
                ) : (caseLinkedCounts && 'Esta ação não pode ser desfeita. O caso será removido permanentemente.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCaseId(null)}>Cancelar</AlertDialogCancel>
            {caseLinkedCounts && caseLinkedCounts.executionCount === 0 && caseLinkedCounts.defectCount === 0 && (
              <AlertDialogAction onClick={performDeleteCase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
