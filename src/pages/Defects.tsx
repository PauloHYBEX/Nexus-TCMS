import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Defect } from '@/types';
import type { TestCase, TestExecution } from '@/types';

import { useLocation, useNavigate } from 'react-router-dom';
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
import { Plus, Pencil, Trash2, Bug as BugIcon, Search } from 'lucide-react';
import { 
  severityLabel, 
  severityBadgeClass, 
  defectStatusLabel, 
  defectStatusBadgeClass 
} from '@/lib/labels';
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Defect | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (preferredViewMode) return preferredViewMode;
    const saved = localStorage.getItem('defects_viewMode');
    return (saved as 'cards' | 'list') || 'list';
  });
  const [searchTerm, setSearchTerm] = useState('');
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
  const clearCaseFilter = () => {
    setFilterCaseIds([]);
    const params = new URLSearchParams(location.search);
    params.delete('cases');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
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
    const params = new URLSearchParams(location.search);
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
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, defects]);

  const clearIdParam = () => {
    const params = new URLSearchParams(location.search);
    if (params.has('id')) {
      params.delete('id');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
    if (params.has('modal')) {
      params.delete('modal');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
    if (params.has('openCreate')) {
      params.delete('openCreate');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
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

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setStatus('open');
    setCaseId('');
    setExecutionId('');
    setCaseExecutions([]);
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
    setShowForm(true);
    const params = new URLSearchParams(location.search);
    params.set('id', d.id);
    params.set('modal', 'defect:edit');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: false });
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
    const params = new URLSearchParams(location.search);
    params.set('id', d.id);
    params.set('modal', 'defect:view');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: false });
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
        toast({ title: 'Criado', description: 'Defeito criado com sucesso.' });
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
    if (!q) return base;
    return base.filter(d =>
      (d.title || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.id || '').toLowerCase().includes(q)
    );
  }, [defects, searchTerm, filterCaseIds, executionCaseMap]);

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

      {/* Toolbar comum */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID ou Título"
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          {filterCaseIds.length > 0 && (
            <div className="flex items-center gap-2 border rounded px-2 py-1 text-xs text-muted-foreground">
              <span>{filterCaseIds.length} caso(s) filtrado(s)</span>
              <Button variant="outline" size="sm" onClick={clearCaseFilter} className="h-7 px-2 text-xs">Limpar</Button>
            </div>
          )}
          {!embedded && (
            <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          )}
          {/* Quando embedded, o botão '+ Novo' fica no cabeçalho de Gestão. */}
        </div>
      </div>

      {/* Dialog único para criar/editar */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) closeForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Defeito' : 'Novo Defeito'}</DialogTitle>
            <DialogDescription>Preencha os campos obrigatórios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Título</label>
              <input className="w-full rounded-md border p-2 bg-background" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Descrição</label>
              <textarea className="w-full rounded-md border p-2 bg-background" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Severidade</label>
                <SearchableCombobox
                  items={[
                    { value: 'low', label: 'Baixa' },
                    { value: 'medium', label: 'Média' },
                    { value: 'high', label: 'Alta' },
                    { value: 'critical', label: 'Crítica' },
                  ]}
                  value={severity}
                  onChange={(value) => { if (value) setSeverity(value as Defect['severity']); }}
                  placeholder="Selecione a severidade"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Status</label>
                <SearchableCombobox
                  items={[
                    { value: 'open', label: 'Aberto' },
                    { value: 'in_analysis', label: 'Em análise' },
                    { value: 'fixed', label: 'Corrigido' },
                    { value: 'validated', label: 'Validado' },
                    { value: 'closed', label: 'Fechado' },
                  ]}
                  value={status}
                  onChange={(value) => { if (value) setStatus(value as Defect['status']); }}
                  placeholder="Selecione o status"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Caso relacionado (opcional)</label>
                <SearchableCombobox
                  items={projectCases.map(c => ({ value: c.id, label: `${c.sequence ? `#${c.sequence} ` : ''}${c.title}` }))}
                  value={caseId}
                  onChange={(value) => { setCaseId(value || ''); }}
                  placeholder="Selecione um caso (opcional)"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Execução (opcional)</label>
                <SearchableCombobox
                  items={caseExecutions.map(e => ({ value: e.id, label: `${new Date(e.executed_at).toLocaleString()} • ${e.status}` }))}
                  value={executionId}
                  onChange={(value) => { setExecutionId(value || ''); }}
                  placeholder={caseId ? 'Selecione uma execução (opcional)' : 'Selecione um caso primeiro'}
                  disabled={!caseId}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <StandardButton variant="outline" onClick={closeForm}>Cancelar</StandardButton>
              <StandardButton 
                onClick={submit}
                disabled={!hasPermission('can_manage_executions')}
                className={!editing ? 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0' : ''}
              >
                {editing ? 'Salvar' : 'Criar'}
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
                  className="h-full flex flex-col border border-border/50 overflow-hidden cursor-pointer card-hover"
                  onClick={() => handleViewDetails(d)}
                >
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
                          {`DEF-${(d.id || '').slice(0,4)}`}
                        </span>
                        <CardTitle className="text-base line-clamp-2 leading-tight min-w-0">{d.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-2">
                        <Badge className={severityBadgeClass(d.severity)}>{severityLabel(d.severity)}</Badge>
                        <Badge className={defectStatusBadgeClass(d.status)}>{defectStatusLabel(d.status)}</Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{d.description}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">#{d.id.slice(0, 8)}</div>
                      <div className="flex gap-1">
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
              <div className="grid grid-cols-[80px_1fr_120px_120px_100px] items-center gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <div className="pt-px">ID</div>
                <div className="text-center pt-px">Título</div>
                <div className="text-center pt-px">Severidade</div>
                <div className="text-center pt-px">Status</div>
                <div className="flex justify-end">Ações</div>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border">
                {filtered.map((d) => (
                  <div 
                    key={d.id}
                    className="grid grid-cols-[80px_1fr_120px_120px_100px] items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(d)}
                  >
                    {/* ID */}
                    <div className="flex items-center">
                      <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-1 rounded">{`DEF-${(d.id || '').slice(0,4)}`}</span>
                    </div>
                    {/* Título */}
                    <div className="text-sm font-medium leading-tight text-center flex items-center justify-center min-w-0">
                      <span className="truncate">{d.title}</span>
                    </div>
                    {/* Severidade */}
                    <div className="flex items-center justify-center"><Badge className={severityBadgeClass(d.severity)}>{severityLabel(d.severity)}</Badge></div>
                    {/* Status */}
                    <div className="flex items-center justify-center"><Badge className={defectStatusBadgeClass(d.status)}>{defectStatusLabel(d.status)}</Badge></div>
                    {/* Ações */}
                    <div className="flex items-center justify-end gap-1">
                      {hasPermission('can_manage_executions') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                          className="h-8 w-8 p-0"
                          title="Editar"
                          aria-label="Editar"
                          disabled={!currentProject || isProjectInactive}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {hasPermission('can_manage_executions') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); remove(d.id); }}
                          className="h-8 w-8 p-0"
                          title="Excluir"
                          aria-label="Excluir"
                          disabled={!currentProject || isProjectInactive}
                        >
                          <Trash2 className="h-4 w-4" />
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
