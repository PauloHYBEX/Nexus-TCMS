import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePaginationUrlSync } from '@/hooks/usePaginationUrlSync';
import { useVirtualTableHeight } from '@/hooks/useVirtualTableHeight';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, PlayCircle, Edit, Trash2, Search, ArrowUpDown, ListFilter, Download, Calendar, Sparkles, Bug as BugIcon } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { getTestExecutions, getTestExecutionsByProject, getTestPlansByIds, getTestCasesByIds, deleteTestExecution, getDefects, createDefect } from '@/services/supabaseService';
import { TestExecution } from '@/types';
import { TestExecutionForm } from '@/components/forms/TestExecutionForm';
import { DetailModal } from '@/components/DetailModal';
import { StandardButton } from '@/components/StandardButton';
import { AIGeneratorForm } from '@/components/forms/AIGeneratorForm';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { executionStatusBadgeClass, executionStatusLabel } from '@/lib/labels';
import { useProject } from '@/contexts/ProjectContext';
import { InfoPill } from '@/components/InfoPill';
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

export const TestExecutions = () => {
  const { initFromSearchParams, writeFromState } = usePaginationUrlSync();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Refs para altura virtual
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listHeaderRef = useRef<HTMLDivElement | null>(null);
  const listCardRef = useRef<HTMLDivElement | null>(null);
  const paginationRef = useRef<HTMLDivElement | null>(null);
  const [rowSize, setRowSize] = useState<number>(72);
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<TestExecution | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const saved = localStorage.getItem('testExecutions_viewMode');
    return (saved as 'cards' | 'list') || 'list';
  });
  const [showEditForm, setShowEditForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed' | 'blocked' | 'not_tested'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'executed_at' | 'sequence' | 'status'>('executed_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Paginação via hook
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(9);
  // Estados para hook de paginação
  const [q, setQ] = useState('');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'plan' | 'case' | 'execution'>('all');
  const [applied, setApplied] = useState<{ q: string; dateStart?: string; dateEnd?: string; type: 'all' | 'plan' | 'case' | 'execution' }>({ q: '', type: 'all' });
  // Projeto atual (controle global)
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  // Mapas para enriquecer colunas (plano/caso)
  const [planMap, setPlanMap] = useState<Record<string, { id: string; sequence?: number; project_id: string }>>({});
  const [caseMap, setCaseMap] = useState<Record<string, { id: string; sequence?: number }>>({});
  // Defeitos por execução/caso
  const [defectsMap, setDefectsMap] = useState<Record<string, { count: number; defects: Array<{ id: string; title: string; status: string; severity?: string }> }>>({});
  // Exclusão
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showReportBugModal, setShowReportBugModal] = useState(false);
  const [executionToReport, setExecutionToReport] = useState<TestExecution | null>(null);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugSeverity, setBugSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [deletingExecutionId, setDeletingExecutionId] = useState<string | null>(null);

  // Tipagem e guarda para status
  const allowedStatuses = ['all', 'passed', 'failed', 'blocked', 'not_tested'] as const;
  type ExecStatus = typeof allowedStatuses[number];
  const isExecStatus = (s: string): s is ExecStatus => (allowedStatuses as readonly string[]).includes(s);

  useEffect(() => {
    if (user) {
      loadExecutions();
    }
  }, [user, currentProject?.id, projects]);

  // Persistir modo de visualização
  useEffect(() => {
    localStorage.setItem('testExecutions_viewMode', viewMode);
  }, [viewMode]);

  // Listener para troca de projeto global
  useEffect(() => {
    const handler = () => loadExecutions();
    window.addEventListener('krg:project-changed', handler as EventListener);
    return () => window.removeEventListener('krg:project-changed', handler as EventListener);
  }, []);

  // Abrir modal automaticamente se houver ?id=
  useEffect(() => {
    const id = searchParams.get('id');
    const modal = searchParams.get('modal');
    if (!id) return;
    // Não abrir visualização se estiver em modo de criação/edição
    if (modal === 'exec:new' || modal === 'exec:edit') return;
    if (executions.length === 0) return;
    const found = executions.find(e => e.id === id);
    if (found) {
      setSelectedExecution(found);
      setShowDetailModal(true);
    }
  }, [executions, searchParams]);

  // Restaurar filtros via URL (?status=&q=)
  useEffect(() => {
    const status = searchParams.get('status');
    const q = searchParams.get('q');
    if (status && isExecStatus(status)) {
      setFilterStatus(status);
    }
    if (q !== null) {
      setSearchTerm(q);
    }
  }, [searchParams]);

  // Restaurar abertura de modais via URL (?modal=exec:new | exec:edit&id=...)
  useEffect(() => {
    const modal = searchParams.get('modal');
    if (modal === 'exec:new') {
      setShowForm(true);
    } else if (modal === 'exec:edit') {
      const id = searchParams.get('id');
      if (id && executions.length > 0) {
        const found = executions.find(e => e.id === id);
        if (found) {
          setSelectedExecution(found);
          setShowEditForm(true);
        }
      }
    }
  }, [searchParams, executions]);

  // Inicializar filtros via hook
  useEffect(() => {
    initFromSearchParams({ setQ, setDateStart, setDateEnd, setTypeFilter, setApplied, setPage });
    setSearchTerm(q);
  }, [initFromSearchParams, q]);

  const filteredExecutions = useMemo(() => {
    const raw = searchTerm.trim();
    const term = raw.toLowerCase();
    const numMatch = raw.match(/^#?\s*(\d+)\s*$/);
    return executions.filter((e) => {
      const statusOk = filterStatus === 'all' || e.status === filterStatus;
      if (!statusOk) return false;
      if (!term) return true;
      // Se for consulta numérica, exigir correspondência exata do número de sequência
      if (numMatch) {
        const qn = Number(numMatch[1]);
        const seqValue = e.sequence ?? null;
        return seqValue != null && Number(seqValue) === qn;
      }
      // Busca textual padrão
      const seqStr = (e.sequence ?? e.id).toString().toLowerCase();
      const idShort = e.id.slice(0, 8);
      const executedBy = e.executed_by?.toLowerCase() ?? '';
      const notes = e.notes?.toLowerCase() ?? '';
      const label = e.status;
      return (
        seqStr.includes(term) ||
        idShort.includes(term) ||
        executedBy.includes(term) ||
        notes.includes(term) ||
        label.includes(term)
      );
    });
  }, [executions, filterStatus, searchTerm]);

  const sortedExecutions = useMemo(() => {
    const list = [...filteredExecutions];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'executed_at') {
        const aTime = a.executed_at ? new Date(a.executed_at).getTime() : 0;
        const bTime = b.executed_at ? new Date(b.executed_at).getTime() : 0;
        cmp = aTime - bTime;
      } else if (sortBy === 'sequence') {
        const aSeq = a.sequence ?? 0;
        const bSeq = b.sequence ?? 0;
        cmp = aSeq - bSeq;
      } else if (sortBy === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredExecutions, sortBy, sortDir]);

  // Derived pagination data
  const totalItems = sortedExecutions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedExecutions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedExecutions.slice(start, start + pageSize);
  }, [sortedExecutions, currentPage, pageSize]);

  // Clamp page when data/pageSize changes
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Sincronizar applied com URL
  useEffect(() => {
    writeFromState(applied, page);
  }, [applied, page, writeFromState]);

  // Hook de altura virtual
  const { listHeight } = useVirtualTableHeight({
    containerRef,
    listHeaderRef,
    listCardRef,
    paginationRef,
    rowSize,
    pageSize,
    totalItems,
    currentPage,
    minHeight: 240,
  });

  // Scroll to top when page or pageSize changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, pageSize]);

  const loadExecutions = async () => {
    try {
      setLoading(true);
      let data: TestExecution[] = [];
      if (currentProject?.id) {
        data = await getTestExecutionsByProject(user!.id, currentProject.id);
      } else {
        // Agregar SOMENTE projetos ATIVOS quando "Todos"
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length > 0) {
          const lists = await Promise.all(active.map(p => getTestExecutionsByProject(user!.id, p.id)));
          data = lists.flat();
        } else {
          data = [];
        }
      }
      setExecutions(data);
      // Enriquecer com mapas de plano e caso para exibição
      const uniquePlanIds = Array.from(new Set(data.map(e => e.plan_id).filter(Boolean)));
      const uniqueCaseIds = Array.from(new Set(data.map(e => e.case_id).filter(Boolean)));
      const [plans, cases] = await Promise.all([
        getTestPlansByIds(user!.id, uniquePlanIds as string[]),
        getTestCasesByIds(user!.id, uniqueCaseIds as string[]),
      ]);
      const pMap: Record<string, { id: string; sequence?: number; project_id: string }> = {};
      plans.forEach(p => { pMap[p.id] = { id: p.id, sequence: p.sequence, project_id: p.project_id }; });
      setPlanMap(pMap);
      const cMap: Record<string, { id: string; sequence?: number }> = {};
      cases.forEach(c => { cMap[c.id] = { id: c.id, sequence: c.sequence }; });
      setCaseMap(cMap);

      // Carregar defeitos por caso para mostrar contador de bugs
      if (uniqueCaseIds.length > 0 && user) {
        try {
          const allDefects = await getDefects(user.id);
          const dMap: Record<string, { count: number; defects: Array<{ id: string; title: string; status: string; severity?: string }> }> = {};
          data.forEach(exec => {
            const caseDefects = allDefects.filter(d => d.case_id === exec.case_id && d.status !== 'closed');
            dMap[exec.id] = {
              count: caseDefects.length,
              defects: caseDefects.map(d => ({ id: d.id, title: d.title, status: d.status, severity: d.severity }))
            };
          });
          setDefectsMap(dMap);
        } catch (e) {
          console.warn('Erro ao carregar defeitos:', e);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar execuções:', error);
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSortChange = (value: string) => {
    // value format: `${by}:${dir}`
    const [by, dir] = value.split(':') as ['executed_at' | 'sequence' | 'status', 'asc' | 'desc'];
    if (by) setSortBy(by);
    if (dir) setSortDir(dir);
  };

  // Atualiza URL ao mudar filtros
  const handleFilterStatusChange = (v: ExecStatus) => {
    setFilterStatus(v);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (v === 'all') params.delete('status'); else params.set('status', v);
    setSearchParams(params);
  };

  const handleSearchTermChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (val) params.set('q', val); else params.delete('q');
    setSearchParams(params);
  };

  // Removido: filtro de projeto local — controle via Dashboard

  // Labels helpers
  const exeLabel = (e: TestExecution) => {
    const n = e.sequence ?? null;
    if (n != null) return `EXE-${String(n).padStart(3, '0')}`;
    return `EXE-${e.id.slice(0, 4)}`;
  };
  const caseLabel = (caseId: string) => {
    const c = caseMap[caseId];
    if (!c) return '—';
    return c.sequence != null ? `CT-${String(c.sequence).padStart(3, '0')}` : `CT-${c.id.slice(0, 4)}`;
  };
  const planLabel = (planId: string) => {
    const p = planMap[planId];
    if (!p) return '—';
    return p.sequence != null ? `PT-${String(p.sequence).padStart(3, '0')}` : `PT-${p.id.slice(0, 4)}`;
  };

  const requestDelete = (id: string) => {
    setDeletingExecutionId(id);
    setConfirmDeleteOpen(true);
  };

  const performDelete = async () => {
    if (!deletingExecutionId) return;
    if (isProjectInactive) { toast({ title: 'Projeto não ativo', description: 'Exclusão desabilitada.', variant: 'destructive' }); setConfirmDeleteOpen(false); setDeletingExecutionId(null); return; }
    try {
      await deleteTestExecution(deletingExecutionId);
      setExecutions(prev => prev.filter(ex => ex.id !== deletingExecutionId));
      toast({ title: 'Execução excluída', description: 'A execução foi removida com sucesso.' });
    } catch (error: unknown) {
      toast({
        title: 'Erro ao excluir',
        description: (error instanceof Error ? error.message : 'Não foi possível excluir a execução.'),
        variant: 'destructive'
      });
    } finally {
      setConfirmDeleteOpen(false);
      setDeletingExecutionId(null);
    }
  };

  const handleExecutionCreated = (execution: TestExecution) => {
    setShowForm(false);
    // Limpar modal da URL
    const params = new URLSearchParams(searchParams);
    params.delete('modal');
    setSearchParams(params);
    // Recarregar lista completa para atualizar planMap e caseMap com a nova execução
    loadExecutions();
  };

  const handleExecutionUpdated = (updated: TestExecution) => {
    setShowEditForm(false);
    setSelectedExecution(updated);
    // Limpar modal da URL
    const params = new URLSearchParams(searchParams);
    params.delete('modal');
    setSearchParams(params);
    // Recarregar lista completa para atualizar planMap e caseMap
    loadExecutions();
  };

  const handleViewDetails = (execution: TestExecution) => {
    setSelectedExecution(execution);
    setShowDetailModal(true);
    // Definir query param para deep-linking
    const params = new URLSearchParams(searchParams);
    params.set('id', execution.id);
    setSearchParams(params);
  };

  // cores/labels de status padronizados em src/lib/labels.ts

  const handleExport = async (format: 'csv' | 'excel' | 'json') => {
    try {
      if (sortedExecutions.length === 0) {
        toast({ title: 'Nada para exportar', description: 'A lista filtrada está vazia.', variant: 'destructive' });
        return;
      }
      const { exportSupabaseData } = await import('../utils/export');
      await exportSupabaseData('execucoes_teste', sortedExecutions, format, `execucoes_teste_${new Date().toISOString().split('T')[0]}`);
      toast({
        title: "Exportação realizada",
        description: `Execuções exportadas em formato ${format.toUpperCase()}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Erro ao exportar execuções em formato ${format}`;
      toast({
        title: "Erro na exportação",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = async (format: 'txt' | 'md') => {
    try {
      if (sortedExecutions.length === 0) {
        toast({ title: 'Nada para copiar', description: 'A lista filtrada está vazia.', variant: 'destructive' });
        return;
      }
      const { copyTableData } = await import('../utils/export');
      
      // Converter dados das execuções para formato de exportação
      const headers = ['Número', 'Status', 'Executado por', 'Notas', 'Data de Execução'];
      const rows = sortedExecutions.map(execution => [
        (execution.sequence ?? execution.id.slice(0, 8)),
        executionStatusLabel(execution.status as any),
        execution.executed_by,
        execution.notes || 'Sem notas',
        new Date(execution.executed_at).toLocaleDateString('pt-BR')
      ]);

      const success = await copyTableData({ headers, rows }, format, 'Execuções de Teste');
      
      if (success) {
        toast({
          title: "Conteúdo copiado",
          description: `Execuções copiadas em formato ${format.toUpperCase()} para a área de transferência`,
        });
      } else {
        throw new Error('Falha ao copiar conteúdo');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Erro ao copiar execuções em formato ${format}`;
      toast({
        title: "Erro ao copiar",
        description: message,
        variant: "destructive",
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Execuções</h1>
          <p className="text-sm text-muted-foreground">Acompanhe e gerencie as execuções de teste</p>
        </div>
        {/* Nova Execução */}
        <div className="flex items-center gap-2">
          <Button
              variant="outline"
              size="icon"
              title="Gerar Execução com IA"
              disabled={!currentProject || currentProject.status !== 'active'}
              onClick={() => setShowAIModal(true)}
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
            </Button>
        <Dialog open={showForm} onOpenChange={(open) => {
          setShowForm(open);
          const params = new URLSearchParams(searchParams);
          if (open) {
            params.set('modal', 'exec:new');
            params.delete('id');
          } else {
            params.delete('modal');
          }
          setSearchParams(params);
        }}>
          <DialogTrigger asChild>
            <StandardButton 
              onClick={() => {}}
              variant="brand"
              disabled={!currentProject || currentProject.status !== 'active'}
              title={!currentProject ? 'Selecione um projeto ativo para criar execuções' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Execução
            </StandardButton>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-auto-hide">
            <DialogHeader>
              <DialogTitle>Nova Execução</DialogTitle>
              <DialogDescription>Preencha os dados da execução de teste</DialogDescription>
            </DialogHeader>
            <TestExecutionForm 
              onSuccess={handleExecutionCreated}
              onCancel={() => setShowForm(false)}
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => handleSearchTermChange(e.target.value)}
            placeholder="Buscar por número (#12), executor ou notas"
            className="pl-9 h-9 bg-muted/20 border-border/60"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-3 border border-border/60 hover:border-border font-normal">
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline text-sm">Ordenar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSortChange('executed_at:desc')}>Mais recentes</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange('executed_at:asc')}>Mais antigas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange('sequence:desc')}>Número (maior primeiro)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange('sequence:asc')}>Número (menor primeiro)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange('status:asc')}>Status (A→Z)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSortChange('status:desc')}>Status (Z→A)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn(
                'h-9 gap-1.5 px-3 border font-normal',
                filterStatus !== 'all'
                  ? 'border-brand/50 text-brand bg-brand/5 hover:bg-brand/10'
                  : 'border-border/60 hover:border-border'
              )}>
                <ListFilter className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline text-sm">
                  {filterStatus === 'all' ? 'Todos' : executionStatusLabel(filterStatus as any)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleFilterStatusChange('all' as any)}>Todos</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleFilterStatusChange('passed' as any)}>Aprovado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterStatusChange('failed' as any)}>Reprovado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterStatusChange('blocked' as any)}>Bloqueado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterStatusChange('not_tested' as any)}>Não Testado</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {executions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-3 border border-border/60 hover:border-border font-normal">
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline text-sm">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>📁 CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>📊 Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>📄 JSON</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleCopy('txt')}>📋 Texto</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCopy('md')}>📝 Markdown</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={showEditForm} onOpenChange={(open) => {
        setShowEditForm(open);
        const params = new URLSearchParams(searchParams);
        if (open) {
          params.set('modal', 'exec:edit');
          if (selectedExecution) params.set('id', selectedExecution.id);
        } else {
          params.delete('modal');
        }
        setSearchParams(params);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-auto-hide">
          <DialogHeader>
            <DialogTitle>
              {selectedExecution ? `Editar Execução #${selectedExecution.sequence ?? selectedExecution.id.slice(0, 8)}` : 'Editar Execução'}
            </DialogTitle>
            <DialogDescription>Atualize os dados da execução de teste</DialogDescription>
          </DialogHeader>
          {selectedExecution && (
            <TestExecutionForm
              execution={selectedExecution}
              planId={selectedExecution.plan_id}
              caseId={selectedExecution.case_id}
              onSuccess={handleExecutionUpdated}
              onCancel={() => setShowEditForm(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1">
        {executions.length === 0 ? (
          <div className="text-center py-12">
            <PlayCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Nenhuma execução encontrada
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Comece executando seus primeiros testes
            </p>
            <StandardButton
              onClick={() => {
                setShowForm(true);
                const params = new URLSearchParams(searchParams);
                params.set('modal', 'exec:new');
                params.delete('id');
                setSearchParams(params);
              }}
              disabled={!currentProject || currentProject.status !== 'active'}
              title={!currentProject ? 'Selecione um projeto ativo para criar execuções' : (currentProject.status !== 'active' ? 'Projeto não ativo — criação desabilitada' : undefined)}
            >
              Criar Primeira Execução
            </StandardButton>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {sortedExecutions.length > 0 ? (
              paginatedExecutions.map((execution) => (
                <Card
                  key={execution.id}
                  className="border border-border/50 flex flex-col cursor-pointer card-hover"
                  onClick={() => handleViewDetails(execution)}
                >
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                          {exeLabel(execution)}
                        </span>
                        <span className="text-sm font-semibold truncate">
                          {caseLabel(execution.case_id)} • {planLabel(execution.plan_id)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <StatusDot status={execution.status} label={executionStatusLabel(execution.status as any)} />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col flex-1">
                    {execution.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {execution.notes}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(execution.executed_at).toLocaleDateString('pt-BR')}
                        </div>
                        {/* InfoPill de bugs no card */}
                        <InfoPill
                          icon={BugIcon}
                          value={defectsMap[execution.id]?.count || 0}
                          title={defectsMap[execution.id]?.count ? `${defectsMap[execution.id]?.count} defeito(s)` : 'Nenhum defeito'}
                          variant={defectsMap[execution.id]?.count ? 'attention' : 'default'}
                          onClick={() => {
                            setExecutionToReport(execution);
                            setShowReportBugModal(true);
                          }}
                          ariaLabel="Reportar bug"
                        />
                      </div>
                      <UserAvatar userId={execution.user_id} name={execution.executed_by} />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full text-sm text-gray-500 px-2">Nenhum resultado encontrado com os filtros atuais.</div>
            )}
          </div>
        ) : (
          // Lista em formato tabela (alinhada a Planos/Casos)
          <div className="space-y-2">
            {sortedExecutions.length > 0 ? (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Header da tabela */}
                <div className="grid grid-cols-[68px_56px_64px_110px_1fr_36px_auto_44px_64px] items-center gap-x-6 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div>ID</div>
                  <div>Caso</div>
                  <div>Plano</div>
                  <div>Status</div>
                  <div>Descrição</div>
                  <div className="text-center">Exec.</div>
                  <div>Executado em</div>
                  <div className="text-center">Report</div>
                  <div className="flex justify-end">Ações</div>
                </div>
                {/* Linhas - mais compactas */}
                <div className="divide-y divide-border">
                  {paginatedExecutions.map((execution) => (
                    <div
                      key={execution.id}
                      className="grid grid-cols-[68px_56px_64px_110px_1fr_36px_auto_44px_64px] items-center gap-x-6 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => handleViewDetails(execution)}
                    >
                      {/* ID Execução */}
                      <div>
                        <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-0.5 rounded whitespace-nowrap">
                          {exeLabel(execution)}
                        </span>
                      </div>

                      {/* ID Caso */}
                      <div>
                        <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded whitespace-nowrap">
                          {caseLabel(execution.case_id)}
                        </span>
                      </div>

                      {/* Plano */}
                      <div className="min-w-0 flex items-center">
                        <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded whitespace-nowrap inline-block max-w-full truncate">
                          {planLabel(execution.plan_id)}
                        </span>
                      </div>

                      {/* Status */}
                      <div>
                        <StatusDot status={execution.status} label={executionStatusLabel(execution.status as any)} />
                      </div>

                      {/* Descrição */}
                      <div className="min-w-0">
                        {(execution.notes || execution.actual_result) ? (
                          <span className="text-xs text-muted-foreground truncate block">
                            {execution.notes || execution.actual_result}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </div>

                      {/* Avatar executor */}
                      <div className="flex justify-center">
                        <UserAvatar userId={execution.user_id} name={execution.executed_by} />
                      </div>

                      {/* Data */}
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(execution.executed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>

                      {/* Report - InfoPill de bugs */}
                      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <InfoPill
                          icon={BugIcon}
                          value={defectsMap[execution.id]?.count || 0}
                          title={defectsMap[execution.id]?.count ? `${defectsMap[execution.id]?.count} defeito(s) aberto(s)` : 'Reportar defeito'}
                          variant={defectsMap[execution.id]?.count ? 'attention' : 'default'}
                          hasDefects={!!(defectsMap[execution.id]?.count)}
                          onClick={() => {
                            setExecutionToReport(execution);
                            setShowReportBugModal(true);
                          }}
                          ariaLabel="Reportar bug"
                        />
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-0.5 justify-end">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={(e) => { e.stopPropagation(); setSelectedExecution(execution); setShowEditForm(true); }}
                          disabled={!currentProject || currentProject.status !== 'active'}
                          title={!currentProject ? 'Selecione um projeto ativo para editar execuções' : (currentProject.status !== 'active' ? 'Projeto não ativo — edição desabilitada' : undefined)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); requestDelete(execution.id); }}
                          disabled={!currentProject || isProjectInactive}
                          title={!currentProject ? 'Selecione um projeto ativo para excluir execuções' : (isProjectInactive ? 'Projeto não ativo — exclusão desabilitada' : undefined)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground px-2 py-4">Nenhum resultado encontrado com os filtros atuais.</div>
            )}
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {sortedExecutions.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {(() => {
              const start = (currentPage - 1) * pageSize + 1;
              const end = Math.min(currentPage * pageSize, totalItems);
              return `Mostrando ${start}–${end} de ${totalItems}`;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Itens por página:</label>
            <select
              className="border rounded-md px-2 py-1 bg-background"
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
            <StandardButton
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              Anterior
            </StandardButton>
            <StandardButton
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              Próxima
            </StandardButton>
          </div>
        </div>
      )}

      <DetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedExecution(null);
          if (searchParams.get('id')) {
            const params = new URLSearchParams(searchParams);
            params.delete('id');
            setSearchParams(params);
          }
        }}
        item={selectedExecution}
        type="execution"
        onEdit={(item) => {
          // Open edit dialog with selected execution
          setSelectedExecution(item as TestExecution);
          setShowDetailModal(false);
          setShowEditForm(true);
          const params = new URLSearchParams(searchParams);
          params.set('modal', 'exec:edit');
          params.set('id', (item as TestExecution).id);
          setSearchParams(params);
        }}
        onDelete={async (id: string) => {
          try {
            await deleteTestExecution(id);
            setExecutions(prev => prev.filter(ex => ex.id !== id));
            toast({
              title: 'Execução excluída',
              description: 'A execução foi removida com sucesso.'
            });
          } catch (error: unknown) {
            toast({
              title: 'Erro ao excluir',
              description: (error instanceof Error ? error.message : 'Não foi possível excluir a execução.'),
              variant: 'destructive'
            });
          } finally {
            setShowDetailModal(false);
          }
        }}
      />

      {/* Confirm Delete Modal */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir execução?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A execução será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingExecutionId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal IA para gerar execução */}
      <Dialog open={showAIModal} onOpenChange={setShowAIModal}>
        <DialogContent className="max-w-3xl overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Gerar Execução com IA
            </DialogTitle>
            <DialogDescription className="sr-only">Gerar execução de teste com inteligência artificial</DialogDescription>
          </DialogHeader>
          <AIGeneratorForm initialType="execution" onSuccess={() => { setShowAIModal(false); loadExecutions(); }} />
        </DialogContent>
      </Dialog>

      {/* Modal de Reportar Bug */}
      <Dialog open={showReportBugModal} onOpenChange={setShowReportBugModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BugIcon className="h-5 w-5 text-destructive" />
              Reportar Defeito
            </DialogTitle>
            <DialogDescription>
              Criar um novo defeito vinculado ao caso de teste {executionToReport ? caseLabel(executionToReport.case_id) : ''}.
              <br />
              <span className="text-xs text-muted-foreground">
                Este defeito será automaticamente vinculado na Matriz de Rastreabilidade.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título do Defeito</label>
              <Input
                value={bugTitle}
                onChange={(e) => setBugTitle(e.target.value)}
                placeholder="Descreva o defeito encontrado"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição</label>
              <textarea
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Detalhes do problema, passos para reproduzir, resultado esperado..."
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Severidade</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high', 'critical'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setBugSeverity(sev)}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      bugSeverity === sev
                        ? 'bg-destructive text-destructive-foreground border-destructive'
                        : 'bg-background text-foreground border-input hover:bg-muted'
                    }`}
                  >
                    {sev === 'low' && 'Baixa'}
                    {sev === 'medium' && 'Média'}
                    {sev === 'high' && 'Alta'}
                    {sev === 'critical' && 'Crítica'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowReportBugModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!executionToReport || !user || !bugTitle.trim()) return;
                try {
                  await createDefect({
                    title: bugTitle.trim(),
                    description: bugDescription.trim(),
                    severity: bugSeverity,
                    status: 'open',
                    project_id: currentProject?.id || '',
                    plan_id: executionToReport.plan_id,
                    case_id: executionToReport.case_id,
                    execution_id: executionToReport.id,
                    user_id: user.id,
                  });
                  toast({
                    title: 'Defeito criado',
                    description: 'O defeito foi reportado com sucesso e vinculado ao caso de teste.'
                  });
                  setShowReportBugModal(false);
                  setBugTitle('');
                  setBugDescription('');
                  setBugSeverity('medium');
                  loadExecutions();
                } catch (error: any) {
                  toast({
                    title: 'Erro ao criar defeito',
                    description: error.message || 'Não foi possível reportar o defeito.',
                    variant: 'destructive'
                  });
                }
              }}
              disabled={!bugTitle.trim() || !executionToReport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reportar Defeito
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
