import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Defect } from '@/types';
import type { TestCase, TestExecution } from '@/types';

import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  getDefects,
  getDefectsByProject,
  createDefect,
  updateDefect,
  deleteDefect,
  getTestExecutionsByProject,
  getTestCasesByProject,
  getTestExecutions,
} from '@/services/supabaseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StandardButton } from '@/components/StandardButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Bug as BugIcon, Search, ArrowUpDown, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { severityLabel, severityBadgeClass, defectStatusBadgeClass, defectStatusLabel } from '@/lib/labels';
import { PriorityTag } from '@/components/ui/PriorityTag';
import { StatusDot } from '@/components/ui/StatusDot';
import { UserAvatar } from '@/components/ui/UserAvatar';
import SearchableCombobox from '@/components/SearchableCombobox';
import { Input } from '@/components/ui/input';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { DetailModal } from '@/components/DetailModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useProject } from '@/contexts/ProjectContext';

export const Defects = ({ embedded = false, preferredViewMode, onPreferredViewModeChange }: { embedded?: boolean; preferredViewMode?: 'cards'|'list'; onPreferredViewModeChange?: (m: 'cards'|'list') => void; }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [executionCaseMap, setExecutionCaseMap] = useState<Record<string, string>>({});
  const [projectCases, setProjectCases] = useState<TestCase[]>([]);
  const [caseExecutions, setCaseExecutions] = useState<TestExecution[]>([]);
  const [caseSearchTerm, setCaseSearchTerm] = useState<string>('');
  const [caseSearchActive, setCaseSearchActive] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Defect | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (preferredViewMode) return preferredViewMode;
    const saved = localStorage.getItem('defects_viewMode');
    return (saved as 'cards' | 'list') || 'list';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'sequence' | 'created_at'>('sequence');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCaseIds, setFilterCaseIds] = useState<string[]>([]);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Defect['severity']>('medium');
  const [status, setStatus] = useState<Defect['status']>('open');
  const [caseId, setCaseId] = useState<string>('');
  const [executionId, setExecutionId] = useState<string>('');
  const [stakeholder, setStakeholder] = useState<string>('');
  const [projectUsers, setProjectUsers] = useState<Array<{ id: string; display_name: string | null; email: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const BASE_PATH = '/defects';
  
  // Constrói um conjunto seguro de query params permitido pela tela
  const buildSafeSearchParams = (sourceSearch: string) => {
    const source = new URLSearchParams(sourceSearch);
    const params = new URLSearchParams();
    const allowedKeys = ['id', 'modal', 'openCreate', 'cases'];
    for (const key of allowedKeys) {
      const value = source.get(key);
      if (value !== null) params.set(key, value);
    }
    return params;
  };
  const clearCaseFilter = () => {
    setFilterCaseIds([]);
    const params = buildSafeSearchParams(location.search);
    params.delete('cases');
    navigate({ pathname: BASE_PATH, search: params.toString() }, { replace: true });
  };

  useEffect(() => {
    if (user) loadData();
  }, [user, currentProject?.id, projects]);

  // Quando o caso selecionado muda, carregar execuções daquele caso
  useEffect(() => {
    if (!user) return;
    if (caseId) {
      getTestExecutions(user.id, undefined, caseId)
        .then(list => setCaseExecutions(list))
        .catch(() => setCaseExecutions([]));
    } else {
      setCaseExecutions([]);
      setExecutionId('');
    }
  }, [caseId, user?.id]);

  useEffect(() => {
    localStorage.setItem('defects_viewMode', viewMode);
    onPreferredViewModeChange?.(viewMode);
  }, [viewMode]);

  // Sincroniza quando controle da aba mudar externamente
  useEffect(() => {
    if (preferredViewMode && preferredViewMode !== viewMode) {
      setViewMode(preferredViewMode);
    }
  }, [preferredViewMode]);

  // Deep-link: abrir modal ao detectar ?id=
  useEffect(() => {
    const params = buildSafeSearchParams(location.search);
    const id = params.get('id');
    const modal = params.get('modal');
    const openCreateFlag = params.get('openCreate');
    const casesParam = params.get('cases');
    if (casesParam) {
      const ids = casesParam.split(',').map(s => s.trim()).filter(Boolean);
      setFilterCaseIds(ids);
    } else {
      setFilterCaseIds([]);
    }
    if (id && defects.length > 0) {
      const d = defects.find(x => x.id === id);
      if (d) {
        if (modal === 'defect:edit') openEdit(d);
        else setSelectedDefect(d), setShowDetailModal(true);
      }
    }
    if (openCreateFlag === '1') {
      openCreate();
      // limpar flag após abrir para evitar reabertura
      params.delete('openCreate');
      navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, defects]);

  const clearIdParam = () => {
    const params = buildSafeSearchParams(location.search);
    if (params.has('id')) {
      params.delete('id');
      navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: true });
    }
    if (params.has('modal')) {
      params.delete('modal');
      navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: true });
    }
    if (params.has('openCreate')) {
      params.delete('openCreate');
      navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: true });
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setStakeholder('');
    clearIdParam();
  };

  const loadData = async () => {
    try {
      setLoading(true);
      if (currentProject?.id) {
        const [defList, execList, projCases] = await Promise.all([
          getDefectsByProject(user!.id, currentProject.id),
          getTestExecutionsByProject(user!.id, currentProject.id),
          getTestCasesByProject(user!.id, currentProject.id),
        ]);
        setDefects(defList as Defect[]);
        const map: Record<string, string> = {};
        for (const e of execList as TestExecution[]) {
          if (e.id && e.case_id) map[e.id] = e.case_id;
        }
        setExecutionCaseMap(map);
        setProjectCases(projCases as TestCase[]);
      } else {
        // Agregar SOMENTE projetos ATIVOS quando "Todos"
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length === 0) {
          setDefects([]);
          setExecutionCaseMap({});
          setProjectCases([]);
        } else {
          const lists = await Promise.all(active.map(p => getDefectsByProject(user!.id, p.id)));
          setDefects(lists.flat());
          setExecutionCaseMap({});
          setProjectCases([]);
        }
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao carregar defeitos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = () => {
    if (projectUsers.length > 0 || loadingUsers) return;
    setLoadingUsers(true);
    supabase.from('profiles' as any).select('id, display_name, email').order('display_name')
      .then(({ data }) => {
        // Incluir usuario logado primeiro na lista, depois os outros ordenados
        const users = (data || []) as Array<{ id: string; display_name: string | null; email: string }>;
        const me = users.find(u => u.id === user?.id);
        const others = users.filter(u => u.id !== user?.id);
        setProjectUsers(me ? [me, ...others] : users);
        setLoadingUsers(false);
      });
  };

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setStatus('open');
    setCaseId('');
    setExecutionId('');
    setStakeholder('');
    setCaseExecutions([]);
    loadUsers();
    setShowForm(true);
    clearIdParam();
  };

  const openEdit = (d: Defect) => {
    setEditing(d);
    setTitle(d.title);
    setDescription(d.description);
    setSeverity(d.severity);
    setStatus(d.status);
    setCaseId(d.case_id || '');
    setExecutionId(d.execution_id || '');
    setStakeholder('');
    loadUsers();
    setShowForm(true);
    const params = buildSafeSearchParams(location.search);
    params.set('id', d.id);
    params.set('modal', 'defect:edit');
    navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: false });
    // carregar execuções do caso (se houver)
    if (d.case_id && user) {
      getTestExecutions(user.id, undefined, d.case_id).then(execList => setCaseExecutions(execList)).catch(() => setCaseExecutions([]));
    } else {
      setCaseExecutions([]);
    }
  };

  const handleViewDetails = (d: Defect) => {
    setSelectedDefect(d);
    setShowDetailModal(true);
    const params = buildSafeSearchParams(location.search);
    params.set('id', d.id);
    params.set('modal', 'defect:view');
    navigate({ pathname: BASE_PATH, search: params.toString() }, { replace: false });
  };

  const submit = async () => {
    try {
      if (!user) return;
      if (isProjectInactive) { toast({ title: 'Projeto não ativo', description: 'Criação/Edição desabilitada para projeto inativo.', variant: 'destructive' }); return; }
      // Validação de integridade: se executionId e caseId foram informados,
      // a execução precisa pertencer ao mesmo caso selecionado
      if (executionId && caseId) {
        const caseOfExec = executionCaseMap[executionId] || caseExecutions.find((e) => e.id === executionId)?.case_id;
        if (caseOfExec && caseOfExec !== caseId) {
          toast({ title: 'Inconsistência', description: 'A execução selecionada não pertence ao caso escolhido.', variant: 'destructive' });
          return;
        }
      }
      if (editing) {
        const updated = await updateDefect(editing.id, { title, description, severity, status, case_id: caseId || null, execution_id: executionId || null });
        setDefects(prev => prev.map(r => r.id === updated.id ? updated : r));
        toast({ title: 'Atualizado', description: 'Defeito atualizado com sucesso.' });
      } else {
        if (!currentProject?.id) {
          toast({ title: 'Selecione um projeto', description: 'É necessário selecionar um projeto para criar defeitos.', variant: 'destructive' });
          return;
        }
        const created = await createDefect({ user_id: user.id, project_id: currentProject.id, title, description, severity, status, case_id: caseId || null, execution_id: executionId || null });
        setDefects(prev => [created, ...prev]);
        if (stakeholder) {
          const reporterName = (user as any).user_metadata?.full_name || (user as any).email || 'Alguém';
          const sevLabel = severity === 'critical' ? 'Crítica' : severity === 'high' ? 'Alta' : severity === 'medium' ? 'Média' : 'Baixa';
          await supabase.from('notifications' as any).insert({
            id: crypto.randomUUID(),
            user_id: stakeholder,
            title: 'Novo defeito reportado',
            body: `${reporterName} reportou um defeito: "${title.trim()}" (${sevLabel}).`,
          });
        }
        toast({ title: 'Criado', description: stakeholder ? 'Defeito criado e notificação enviada ao interessado.' : 'Defeito criado com sucesso.' });
      }
      closeForm();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao salvar defeito', variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    try {
      if (isProjectInactive) { toast({ title: 'Projeto não ativo', description: 'Exclusão desabilitada.', variant: 'destructive' }); return; }
      await deleteDefect(id);
      setDefects(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Excluído', description: 'Defeito excluído.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const base = defects.filter(d => {
      if (filterCaseIds.length > 0) {
        const byCase = !!d.case_id && filterCaseIds.includes(d.case_id);
        const byExec = !!d.execution_id && !!executionCaseMap[d.execution_id] && filterCaseIds.includes(executionCaseMap[d.execution_id]);
        return byCase || byExec;
      }
      return true;
    });
    const searched = !q ? base : base.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q)
    );
    return [...searched].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'sequence') {
        cmp = (a.sequence || 0) - (b.sequence || 0);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [defects, searchTerm, filterCaseIds, executionCaseMap, sortBy, sortOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BugIcon className="h-6 w-6" /> Defeitos
            </h2>
            <p className="text-gray-600 dark:text-gray-400">Gerencie seus defeitos/incidentes</p>
          </div>
          {hasPermission('can_manage_executions') && (
            <StandardButton 
              variant="brand" 
              icon={Plus} 
              onClick={openCreate}
              className="rounded-full px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
              disabled={!currentProject || isProjectInactive}
              title={!currentProject ? 'Selecione um projeto ativo para criar' : (isProjectInactive ? 'Projeto não ativo — criação desabilitada' : undefined)}
            >
              Novo Defeito
            </StandardButton>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por ID ou Título"
            className="pl-9 h-9 bg-muted/20 border-border/60"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {filterCaseIds.length > 0 && (
            <div className="flex items-center gap-2 border border-border/60 rounded-md px-2.5 py-1 text-xs text-muted-foreground h-9">
              <span>{filterCaseIds.length} caso(s)</span>
              <Button variant="ghost" size="sm" onClick={clearCaseFilter} className="h-5 px-1.5 text-xs">Limpar</Button>
            </div>
          )}
          {!embedded && (
            <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-3 border border-border/60 hover:border-border font-normal">
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline text-sm">Ordenar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSortBy('sequence'); setSortOrder('desc'); }}>ID (maior primeiro)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('sequence'); setSortOrder('asc'); }}>ID (menor primeiro)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('created_at'); setSortOrder('desc'); }}>Data (mais recente)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy('created_at'); setSortOrder('asc'); }}>Data (mais antiga)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Dialog único para criar/editar */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BugIcon className="h-5 w-5 text-destructive" />
              {editing ? 'Editar Defeito' : 'Reportar Defeito'}
            </DialogTitle>
            {!editing && (
              <DialogDescription className="text-center text-sm">
                Este defeito será automaticamente vinculado na Matriz de Rastreabilidade.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="defect-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Título *</label>
              <input id="defect-title" name="defect-title" className="w-full h-9 rounded-md border border-border/60 bg-muted/30 px-3 text-sm focus:outline-none focus:border-brand/50" placeholder="Título do defeito" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="defect-desc" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</label>
              <textarea id="defect-desc" name="defect-description" className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:border-brand/50 resize-none" rows={3} placeholder="Descreva o defeito encontrado..." value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Severidade</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high', 'critical'] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      severity === sev
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <SearchableCombobox
                items={[{ value: 'open', label: 'Aberto' },{ value: 'in_analysis', label: 'Em análise' },{ value: 'fixed', label: 'Corrigido' },{ value: 'validated', label: 'Validado' },{ value: 'closed', label: 'Fechado' }]}
                value={status}
                onChange={(value) => { if (value) setStatus(value as Defect['status']); }}
                placeholder="Selecione"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interessado <span className="normal-case font-normal">(opcional)</span></label>
              <select
                value={stakeholder}
                onChange={(e) => setStakeholder(e.target.value)}
                disabled={loadingUsers}
                className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand/50"
              >
                <option value="">Selecionar interessado (opcional)</option>
                {projectUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.id === user?.id ? '(Eu) ' : ''}{u.display_name || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Caso relacionado <span className="normal-case font-normal">(opcional)</span></label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Buscar por ID (#123) ou título..."
                    value={caseSearchTerm}
                    onChange={(e) => setCaseSearchTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setCaseSearchActive(true); }}
                    className="w-full h-9 rounded-md border border-border/60 bg-muted/30 pl-3 pr-9 text-sm focus:outline-none focus:border-brand/50"
                  />
                  <button
                    type="button"
                    onClick={() => setCaseSearchActive(!caseSearchActive)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <SearchableCombobox
                items={[...projectCases]
                  .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
                  .filter(c => {
                    if (!caseSearchActive || !caseSearchTerm.trim()) return true;
                    const term = caseSearchTerm.toLowerCase().trim();
                    const idMatch = term.startsWith('#') ? String(c.sequence || '').includes(term.slice(1)) : String(c.sequence || '').includes(term);
                    const titleMatch = c.title.toLowerCase().includes(term);
                    return idMatch || titleMatch;
                  })
                  .slice(0, 50)
                  .map(c => ({ value: c.id, label: `${c.sequence ? `#${c.sequence} ` : ''}${c.title}`, hint: c.id.slice(0, 8) }))}
                value={caseId}
                onChange={(value) => { 
                  setCaseId(value || ''); 
                  setCaseSearchActive(false);
                  setCaseSearchTerm('');
                  // Carregar execucoes do caso selecionado
                  if (value && user) {
                    getTestExecutions(user.id, undefined, value)
                      .then(execList => {
                        setCaseExecutions(execList.sort((a, b) => (b.sequence || 0) - (a.sequence || 0)));
                      })
                      .catch(() => setCaseExecutions([]));
                  } else {
                    setCaseExecutions([]);
                  }
                }}
                placeholder="Selecione um caso"
              />
              <p className="text-xs text-muted-foreground">{caseSearchActive && caseSearchTerm ? `Filtrando: "${caseSearchTerm}"` : `Mostrando ${Math.min(projectCases.length, 50)} casos (ID maior primeiro)`}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Execução <span className="normal-case font-normal">(opcional)</span></label>
              <SearchableCombobox
                items={caseExecutions.map(e => ({ 
                  value: e.id, 
                  label: `EXEC-${e.sequence || e.id.slice(0, 6)} • ${new Date(e.executed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
                  hint: `${e.status}${e.case_id ? ` • Caso #${projectCases.find(c => c.id === e.case_id)?.sequence || '?'} ${projectCases.find(c => c.id === e.case_id)?.title?.slice(0, 20) || ''}` : ''}`
                }))}
                value={executionId}
                onChange={(value) => { setExecutionId(value || ''); }}
                placeholder={caseId ? (caseExecutions.length === 0 ? 'Nenhuma execução para este caso' : `Selecione (${caseExecutions.length} disponíveis)`) : 'Selecione um caso primeiro'}
                disabled={!caseId || caseExecutions.length === 0}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <StandardButton variant="outline" onClick={closeForm}>Cancelar</StandardButton>
              <StandardButton variant="brand" onClick={submit} disabled={!hasPermission('can_manage_executions')}>
                {editing ? 'Salvar' : 'Criar Defeito'}
              </StandardButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhum defeito cadastrado.</div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(d => (
                <Card
                  key={d.id}
                  className="flex flex-col border border-border/50 cursor-pointer card-hover"
                  onClick={() => handleViewDetails(d)}
                >
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                          {d.sequence ? `DEF-${String(d.sequence).padStart(3, '0')}` : `DEF-${(d.id || '').slice(0, 4)}`}
                        </span>
                        <CardTitle className="text-sm font-semibold line-clamp-2 leading-snug min-w-0">{d.title}</CardTitle>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <StatusDot status={d.status} label={defectStatusLabel(d.status)} />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col flex-1">
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{d.description}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <PriorityTag priority={d.severity} />
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={d.user_id} />
                        {hasPermission('can_manage_executions') && (
                          <StandardButton 
                            variant="ghost" 
                            size="sm" 
                            compact 
                            iconOnly 
                            ariaLabel="Editar"
                            icon={Pencil}
                            onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                            className="h-8 w-8"
                            disabled={!currentProject || isProjectInactive}
                            title={!currentProject ? 'Selecione um projeto ativo para editar defeitos' : (isProjectInactive ? 'Projeto não ativo — edição desabilitada' : undefined)}
                          />
                        )}
                        {hasPermission('can_manage_executions') && (
                          <StandardButton 
                            variant="ghost" 
                            size="sm" 
                            compact 
                            iconOnly 
                            ariaLabel="Excluir"
                            icon={Trash2}
                            onClick={(e) => { e.stopPropagation(); remove(d.id); }}
                            className="h-8 w-8"
                            disabled={!currentProject || isProjectInactive}
                            title={!currentProject ? 'Selecione um projeto ativo para excluir defeitos' : (isProjectInactive ? 'Projeto não ativo — exclusão desabilitada' : undefined)}
                          />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[80px_4fr_2fr_2fr_80px_100px_72px] items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div>ID</div>
                <div>Título</div>
                <div>Status</div>
                <div>Severidade</div>
                <div className="text-center">Criado por</div>
                <div>Criado em</div>
                <div className="flex justify-end">Ações</div>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border/60">
                {filtered.map((d) => (
                  <div
                    key={d.id}
                    className="grid grid-cols-[80px_4fr_2fr_2fr_80px_100px_72px] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(d)}
                  >
                    {/* ID */}
                    <div>
                      <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-0.5 rounded">
                        {d.sequence ? `DEF-${String(d.sequence).padStart(3, '0')}` : `DEF-${(d.id || '').slice(0, 4)}`}
                      </span>
                    </div>
                    {/* Título + desc */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate leading-tight">{d.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{d.description}</div>
                    </div>
                    {/* Status */}
                    <div><StatusDot status={d.status} label={defectStatusLabel(d.status)} /></div>
                    {/* Severidade */}
                    <div><PriorityTag priority={d.severity} /></div>
                    {/* Avatar */}
                    <div className="flex justify-center"><UserAvatar userId={d.user_id} /></div>
                    {/* Data */}
                    <div className="text-xs text-muted-foreground">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '—'}
                    </div>
                    {/* Ações */}
                    <div className="flex items-center justify-end gap-0.5">
                      {hasPermission('can_manage_executions') && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                          className="h-8 w-8 p-0" title="Editar" aria-label="Editar" disabled={!currentProject || isProjectInactive}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {hasPermission('can_manage_executions') && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remove(d.id); }}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Excluir" aria-label="Excluir" disabled={!currentProject || isProjectInactive}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Defects;
