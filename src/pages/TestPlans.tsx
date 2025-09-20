import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, FileText, Calendar, Sparkles, Grid, List, Download, Search, Filter, ArrowUpDown, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getTestPlans, deleteTestPlan, getPlanLinkedCounts } from '@/services/supabaseService';
import { TestPlan } from '@/types';
import { TestPlanForm } from '@/components/forms/TestPlanForm';
// Removido seletor de projeto local: o controle é feito globalmente no Dashboard
import { ProjectDisplayField } from '@/components/ProjectDisplayField';
import { StandardButton } from '@/components/StandardButton';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { DetailModal } from '@/components/DetailModal';
import { useProject } from '@/contexts/ProjectContext';
import { useStatusOptions } from '@/hooks/useStatusOptions';
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

export const TestPlans = () => {
  const { user } = useAuth();
  const { currentProject, projects, refreshProjects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const { getLabelFor, options } = useStatusOptions(currentProject?.id);
  const { toast } = useToast();
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TestPlan | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const savedMode = localStorage.getItem('testPlans_viewMode');
    return (savedMode as 'cards' | 'list') || 'list';
  });
  const [sortBy, setSortBy] = useState<'title' | 'created_at' | 'updated_at' | 'sequence'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string | 'all'>(searchParams.get('status') || 'all');
  // Removido filtro de projeto local. Vamos usar currentProject global (ou 'Todos' agregando ativos).
  const [editingPlan, setEditingPlan] = useState<TestPlan | null>(null);
  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(9);
  // Search state
  const [searchTerm, setSearchTerm] = useState<string>(searchParams.get('q') || '');
  // Delete confirmation state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<TestPlan | null>(null);
  const [linkedCounts, setLinkedCounts] = useState<{ testCaseCount: number; executionCount: number } | null>(null);

  // Listener para broadcast de troca de projeto
  useEffect(() => {
    const handler = () => loadPlans();
    window.addEventListener('krg:project-changed', handler as EventListener);
    return () => window.removeEventListener('krg:project-changed', handler as EventListener);
  }, []);
  
  // Carregar planos reais do Supabase
  const loadPlans = async () => {
    if (!user) return;
    try {
      setLoading(true);
      if (currentProject?.id) {
        const data = await getTestPlans(user.id, currentProject.id);
        setPlans(data);
      } else {
        // Agregar SOMENTE projetos ATIVOS quando "Todos"
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length === 0) setPlans([]);
        else {
          const lists = await Promise.all(active.map(p => getTestPlans(user.id, p.id)));
          setPlans(lists.flat());
        }
      }
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
      toast({ title: 'Erro', description: 'Falha ao carregar planos de teste.', variant: 'destructive' });
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadPlans();
    }
  }, [user, currentProject?.id, projects]);

  // Abrir modal de visualização automaticamente quando apropriado
  // Regras:
  // - Se houver ?modal=plan:edit ou ?modal=plan:new, NÃO abrir o DetailModal
  // - Abrir somente quando não houver ?modal, ou quando ?modal=plan:view
  useEffect(() => {
    const id = searchParams.get('id');
    const modal = searchParams.get('modal');
    if (!id) return;
    if (modal === 'plan:edit' || modal === 'plan:new') return;
    if (plans.length === 0) return;
    const found = plans.find(p => p.id === id);
    if (found) {
      setSelectedPlan(found);
      setShowDetailModal(true);
    }
  }, [plans, searchParams]);

  // Restaurar abertura de modais via URL (?modal=plan:new | plan:edit&id=...)
  useEffect(() => {
    const modal = searchParams.get('modal');
    if (modal === 'plan:new') {
      setShowForm(true);
      setEditingPlan(null);
    } else if (modal === 'plan:edit') {
      const id = searchParams.get('id');
      if (id && plans.length > 0) {
        const found = plans.find(p => p.id === id);
        if (found) {
          setEditingPlan(found);
          setShowForm(true);
        }
      }
    }
  }, [searchParams, plans]);

  // Read pagination from URL
  useEffect(() => {
    const sp = searchParams.get('page');
    const ps = searchParams.get('pageSize');
    const p = sp ? Math.max(1, parseInt(sp, 10) || 1) : 1;
    const s = ps ? Math.max(1, parseInt(ps, 10) || 9) : 9;
    if (p !== page) setPage(p);
    if (s !== pageSize) setPageSize(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Restaurar busca via URL (?q=)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

  // Restaurar filtro via URL (?status=)
  useEffect(() => {
    const s = searchParams.get('status');
    setFilterStatus((s as any) || 'all');
  }, [searchParams]);

  // Removido: filtro de projeto via URL. O controle é global.

  // Salvar preferência de visualização
  useEffect(() => {
    localStorage.setItem('testPlans_viewMode', viewMode);
  }, [viewMode]);

  // Filtro e ordenação combinados
  const filteredAndSortedPlans = useMemo(() => {
    let filtered = [...plans];
    
    // Aplicar filtros de status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => (p.status || '') === filterStatus);
    }
    
    // Aplicar busca por termo
    const raw = searchTerm.trim();
    const term = raw.toLowerCase();
    const numMatch = raw.match(/^#?\s*(\d+)\s*$/);
    
    if (term) {
      if (numMatch) {
        const qn = Number(numMatch[1]);
        filtered = filtered.filter((p) => {
          const seqValue = p.sequence ?? null;
          return seqValue != null && Number(seqValue) === qn;
        });
      } else {
        filtered = filtered.filter((p) => {
          const seqStr = (p.sequence ?? p.id).toString().toLowerCase();
          return (
            seqStr.includes(term) ||
            (p.title || '').toLowerCase().includes(term) ||
            (p.description || '').toLowerCase().includes(term)
          );
        });
      }
    }
    
    // Aplicar ordenação
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'title':
          aVal = a.title?.toLowerCase() || '';
          bVal = b.title?.toLowerCase() || '';
          break;
        case 'sequence':
          aVal = a.sequence || 0;
          bVal = b.sequence || 0;
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'updated_at':
        default:
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    return filtered;
  }, [plans, searchTerm, filterStatus, sortBy, sortOrder]);

  // IDs agora exibem apenas numeração (ex.: PT-001). Sem nomenclatura de projeto.

  // Classes de badge por status (conhecidos) com fallback
  const statusClasses = (status: string) => (
    status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
    status === 'review' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
    status === 'approved' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    status === 'archived' ? 'bg-red-50 text-red-700 border-red-200' :
    status === 'draft' ? 'bg-gray-50 text-gray-700 border-gray-200' :
    'bg-gray-50 text-gray-700 border-gray-200'
  );

  // Derived pagination data
  const totalItems = filteredAndSortedPlans.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPlans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedPlans.slice(start, start + pageSize);
  }, [filteredAndSortedPlans, currentPage, pageSize]);

  // Clamp page when data/pageSize changes
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Sync page & pageSize to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    setSearchParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  // Sync filter status to URL and reset to first page
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (filterStatus && filterStatus !== 'all') params.set('status', String(filterStatus));
    else params.delete('status');
    setSearchParams(params);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  // Scroll to top when page or pageSize changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, pageSize]);

  // Atualiza URL ao mudar busca
  const handleSearchTermChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (val) params.set('q', val); else params.delete('q');
    setSearchParams(params);
  };

  // Removido: manipulador de filtro de projeto local.

  const handlePlanCreated = (plan: TestPlan) => {
    // Garantir tipos de data e evitar duplicatas (upsert)
    const normalized: TestPlan = {
      ...plan,
      created_at: plan.created_at instanceof Date ? plan.created_at : new Date(plan.created_at),
      updated_at: plan.updated_at instanceof Date ? plan.updated_at : new Date(plan.updated_at),
    } as TestPlan;

    setPlans(prev => {
      const exists = prev.some(p => p.id === normalized.id);
      const next = exists ? prev.map(p => (p.id === normalized.id ? normalized : p)) : [normalized, ...prev];
      return next;
    });

    setShowForm(false);
    setEditingPlan(null);
    // clear modal params
    const params = new URLSearchParams(searchParams);
    params.delete('modal');
    params.delete('id');
    setSearchParams(params);
  };

  const handleViewDetails = (plan: TestPlan) => {
    setSelectedPlan(plan);
    setShowDetailModal(true);
    // Definir query param para deep-linking (usar modal=plan:view para evitar conflito com edição)
    const params = new URLSearchParams(searchParams);
    params.set('id', plan.id);
    params.set('modal', 'plan:view');
    setSearchParams(params);
  };

  const handleEdit = (plan: TestPlan) => {
    setEditingPlan(plan);
    setShowForm(true);
    setShowDetailModal(false);
    const params = new URLSearchParams(searchParams);
    params.set('modal', 'plan:edit');
    params.set('id', plan.id);
    setSearchParams(params);
  };

  const handleRequestDelete = async (plan: TestPlan) => {
    setPlanToDelete(plan);
    setConfirmDeleteOpen(true);
    setLinkedCounts(null);
    try {
      if (user) {
        const counts = await getPlanLinkedCounts(user.id, plan.id);
        setLinkedCounts(counts);
      }
    } catch (err) {
      console.error('Erro ao checar vínculos do plano:', err);
      setLinkedCounts({ testCaseCount: 0, executionCount: 0 });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (isProjectInactive) {
        toast({ title: 'Projeto não ativo', description: 'Exclusão desabilitada.', variant: 'destructive' });
        setConfirmDeleteOpen(false);
        setPlanToDelete(null);
        setLinkedCounts(null);
        return;
      }
      await deleteTestPlan(id);
      await loadPlans();
      // Se o plano deletado estava selecionado no DetailModal, fechar e limpar URL
      if (selectedPlan?.id === id) {
        setSelectedPlan(null);
        setShowDetailModal(false);
        const params = new URLSearchParams(searchParams);
        params.delete('id');
        if (params.get('modal') === 'plan:view') params.delete('modal');
        setSearchParams(params);
      }
      toast({ title: 'Sucesso', description: 'Plano excluído com sucesso!' });
    } catch (error) {
      console.error('Erro ao excluir plano:', error);
      toast({ title: 'Erro', description: 'Erro ao excluir plano', variant: 'destructive' });
    } finally {
      setConfirmDeleteOpen(false);
      setPlanToDelete(null);
      setLinkedCounts(null);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'json' | 'pdf') => {
    try {
      if (filteredAndSortedPlans.length === 0) {
        toast({ title: 'Nada para exportar', description: 'A lista filtrada está vazia.', variant: 'destructive' });
        return;
      }

      // Formatar dados no formato de tabela sempre
      const getStatusLabel = (status: string) => getLabelFor(status);

      const getProjectLabel = (projectId: string) => {
        const proj = projects.find(p => p.id === projectId);
        return proj?.name || projectId || 'Sem Projeto';
      };

      const tableData = filteredAndSortedPlans.map(plan => ({
        ID: `PT-${String(plan.sequence ?? '001').padStart(3, '0')}`,
        Título: plan.title,
        Projeto: getProjectLabel(plan.project_id),
        Status: getStatusLabel(plan.status),
        Criação: plan.created_at.toLocaleDateString('pt-BR')
      }));

      if (format === 'pdf') {
        // Criar PDF simples sem dependências externas
        const content = `Planos de Teste\nExportado em: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
          `ID\tTítulo\tProjeto\tStatus\tCriação\n` +
          tableData.map(row => `${row.ID}\t${row["Título"]}\t${row.Projeto}\t${row.Status}\t${row.Criação}`).join('\n');
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `planos_teste_${new Date().toISOString().split('T')[0]}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const { exportTableData } = await import('../utils/export');
        await exportTableData(tableData, format, `planos_teste_${new Date().toISOString().split('T')[0]}`);
      }

      toast({
        title: 'Exportação realizada',
        description: `Planos exportados em formato ${format.toUpperCase()}`,
      });
    } catch (error: any) {
      console.error('Erro na exportação:', error);
      toast({
        title: 'Erro na exportação',
        description: error.message || `Erro ao exportar planos em formato ${format}`,
        variant: 'destructive',
      });
    }
  };

  const handleCopy = async (format: 'txt' | 'md') => {
    try {
      if (filteredAndSortedPlans.length === 0) {
        toast({ title: 'Nada para copiar', description: 'A lista filtrada está vazia.', variant: 'destructive' });
        return;
      }
      const { copyTableData } = await import('../utils/export');

      // Usar labels dinâmicos
      const getStatusLabel = (status: string) => getLabelFor(status);

      const getProjectLabel = (projectId: string) => {
        const proj = projects.find(p => p.id === projectId);
        return proj?.name || projectId || 'Sem Projeto';
      };

      const tableData = {
        headers: ['ID', 'Título', 'Projeto', 'Status', 'Criação'],
        rows: filteredAndSortedPlans.map(plan => [
          `PT-${String(plan.sequence ?? '001').padStart(3, '0')}`,
          plan.title,
          getProjectLabel(plan.project_id),
          getStatusLabel(plan.status),
          plan.created_at.toLocaleDateString('pt-BR')
        ])
      };

      const success = await copyTableData(tableData, format, 'Planos de Teste');
      if (success) {
        toast({
          title: 'Copiado!',
          description: `Planos copiados para a área de transferência em formato ${format.toUpperCase()}`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao copiar',
        description: error.message || `Erro ao copiar planos em formato ${format}`,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="pl-24">
          <h1 className="text-2xl font-bold text-foreground">Planos de Teste</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus planos de teste</p>
        </div>
        <StandardButton 
          onClick={() => {
            setShowForm(true);
            setEditingPlan(null);
            const params = new URLSearchParams(searchParams);
            params.set('modal', 'plan:new');
            params.delete('id');
            setSearchParams(params);
          }}
          className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0"
          disabled={!currentProject || currentProject.status !== 'active'}
          title={!currentProject ? 'Selecione um projeto ativo para criar planos' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano de Teste
        </StandardButton>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => handleSearchTermChange(e.target.value)}
            placeholder="Buscar por número, título ou descrição"
            className="pl-10 h-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Seletor de projeto removido: seleção global pelo Dashboard */}
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
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                {filterStatus === 'all' ? 'Todos' : `Status: ${getLabelFor(filterStatus)}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterStatus('all')}>
                Todos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {options.map(opt => (
                <DropdownMenuItem key={opt.value} onClick={() => setFilterStatus(opt.value)}>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Export Dropdown */}
          {plans.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  📁 CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  📊 Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  📄 JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  📋 PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleCopy('txt')}>
                  📋 Texto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCopy('md')}>
                  📝 Markdown
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {plans.length > 0 ? (
          viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAndSortedPlans.length > 0 ? paginatedPlans.map((plan) => (
                <Card
                  key={plan.id}
                  className="border border-border/50 cursor-pointer card-hover"
                  onClick={() => handleViewDetails(plan)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
                          {`PT-${String(plan.sequence ?? '001').padStart(3, '0')}`}
                        </span>
                        <CardTitle className="text-base line-clamp-2 leading-tight min-w-0">
                          {plan.title}
                        </CardTitle>
                      </div>
                      {plan.generated_by_ai && (
                        <Badge variant="secondary" className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <Sparkles className="h-3 w-3" />
                          IA
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                      {plan.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {plan.updated_at.toLocaleDateString('pt-BR')}
                      </div>
                      <StandardButton 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleViewDetails(plan); }}
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
              {filteredAndSortedPlans.length > 0 ? (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  {/* Header da tabela */}
                  <div className="grid grid-cols-[80px_1fr_120px_120px_120px_100px] items-start gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <div>ID</div>
                    <div className="text-center pt-px">Título</div>
                    <div className="text-center">Projeto</div>
                    <div className="text-center">Status</div>
                    <div className="text-center">Criado em</div>
                    <div className="flex justify-end">Ações</div>
                  </div>
                  
                  {/* Linhas da tabela */}
                  <div className="divide-y divide-border">
                    {paginatedPlans.map((plan) => (
                      <div 
                        key={plan.id} 
                        className="grid grid-cols-[80px_1fr_120px_120px_120px_100px] items-start gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => handleViewDetails(plan)}
                      >
                        <div className="flex items-center">
                          <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-1 rounded">
                            {`PT-${String(plan.sequence ?? '001').padStart(3, '0')}`}
                          </span>
                        </div>
                        
                        <div className="flex items-start min-w-0 gap-2 self-start justify-center text-center">
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight text-foreground truncate">{plan.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{plan.description}</div>
                          </div>
                          {plan.generated_by_ai && (
                            <Badge variant="secondary" className="flex-shrink-0 mt-[1px]">
                              <Sparkles className="h-3 w-3 mr-1" />
                              IA
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-center">
                          <ProjectDisplayField projectId={plan.project_id} />
                        </div>
                        
                        <div className="flex items-center justify-center">
                          <Badge variant="outline" className={statusClasses(plan.status)}>
                            {getLabelFor(plan.status)}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center text-sm text-muted-foreground justify-center">
                          {plan.created_at.toLocaleDateString('pt-BR')}
                        </div>
                        
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(plan);
                            }}
                            disabled={!currentProject || currentProject.status !== 'active'}
                            title={!currentProject ? 'Selecione um projeto ativo para editar planos' : (currentProject.status !== 'active' ? 'Projeto não ativo — edição desabilitada' : undefined)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDelete(plan);
                            }}
                            disabled={!currentProject || isProjectInactive}
                            title={!currentProject ? 'Selecione um projeto ativo para excluir planos' : (isProjectInactive ? 'Projeto não ativo — exclusão desabilitada' : undefined)}
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
                  <p className="text-muted-foreground">Nenhum resultado encontrado com os filtros atuais.</p>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum plano encontrado
            </h3>
            <p className="text-muted-foreground mb-4">
              Comece criando seu primeiro plano de teste
            </p>
            <StandardButton 
              onClick={() => {
                setShowForm(true);
                const params = new URLSearchParams(searchParams);
                params.set('modal', 'plan:new');
                params.delete('id');
                setSearchParams(params);
              }}
              className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0"
              disabled={!currentProject || currentProject.status !== 'active'}
              title={!currentProject ? 'Selecione um projeto ativo para criar planos' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Plano
            </StandardButton>
          </div>
        )}
      </div>

      {/* Modal do Formulário */}
      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        const params = new URLSearchParams(searchParams);
        if (open) {
          if (editingPlan) {
            params.set('modal', 'plan:edit');
            params.set('id', editingPlan.id);
          } else {
            params.set('modal', 'plan:new');
            params.delete('id');
          }
        } else {
          params.delete('modal');
          params.delete('id');
          setEditingPlan(null);
        }
        setSearchParams(params);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? `Editar Plano ${editingPlan.sequence ? `#${editingPlan.sequence}` : ''}` : 'Novo Plano de Teste'}
            </DialogTitle>
            <DialogDescription>
              {editingPlan ? 'Atualize os campos do plano de teste selecionado.' : 'Preencha os campos para criar um novo plano de teste.'}
            </DialogDescription>
          </DialogHeader>
          <TestPlanForm 
            initialData={editingPlan}
            onSuccess={handlePlanCreated}
            onCancel={() => {
              setShowForm(false);
              setEditingPlan(null);
              const params = new URLSearchParams(searchParams);
              params.delete('modal');
              params.delete('id');
              setSearchParams(params);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Pagination controls */}
      {plans.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
          <div className="text-sm text-muted-foreground mb-2 sm:mb-0">
          {(() => {
            const start = (currentPage - 1) * pageSize + 1;
            const end = Math.min(currentPage * pageSize, totalItems);
            return `Mostrando ${start}–${end} de ${totalItems}`;
          })()}
        </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <label className="text-sm text-muted-foreground whitespace-nowrap">Itens por página:</label>
              <select
                className="border rounded-md px-2 py-1 bg-background w-16 sm:w-auto"
                value={pageSize}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10) || 9;
                  setPageSize(next);
                  setPage(1);
                }}
              >
                <option value={5}>5</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <StandardButton
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="flex-1 sm:flex-none"
              >
                Anterior
              </StandardButton>
              <StandardButton
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="flex-1 sm:flex-none"
              >
                Próxima
              </StandardButton>
            </div>
          </div>
        </div>
      )}

      <DetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedPlan(null);
          // Limpar parâmetros ao fechar
          const params = new URLSearchParams(searchParams);
          if (params.has('id')) params.delete('id');
          if (params.get('modal') === 'plan:view') params.delete('modal');
          setSearchParams(params);
        }}
        item={selectedPlan}
        type="plan"
        onEdit={handleEdit}
        onDelete={(id) => {
          const plan = plans.find(p => p.id === id);
          if (plan) handleRequestDelete(plan);
        }}
      />

      {/* Confirm Delete Modal */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={(open) => {
        setConfirmDeleteOpen(open);
        if (!open) {
          setPlanToDelete(null);
          setLinkedCounts(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano de teste?</AlertDialogTitle>
            <AlertDialogDescription>
              {linkedCounts == null && 'Verificando dependências...'}
              {linkedCounts && (linkedCounts.testCaseCount > 0 || linkedCounts.executionCount > 0)
                ? (
                  <span>
                    Este plano possui {linkedCounts.testCaseCount} caso(s) de teste e {linkedCounts.executionCount} execução(ões) vinculados.
                    Remova essas dependências antes de excluir o plano para manter a integridade dos dados.
                  </span>
                ) : linkedCounts && 'Esta ação não pode ser desfeita. O plano será removido permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {linkedCounts && linkedCounts.testCaseCount === 0 && linkedCounts.executionCount === 0 && planToDelete && (
              <AlertDialogAction
                onClick={() => handleDelete(planToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
