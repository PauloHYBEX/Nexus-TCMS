import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Requirement } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  getRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement
} from '@/services/supabaseService';
import { getRequirementsByProject } from '@/services/supabaseService';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { StandardButton } from '@/components/StandardButton';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { 
  priorityBadgeClass, 
  priorityLabel, 
  requirementStatusBadgeClass, 
  requirementStatusLabel 
} from '@/lib/labels';
import { PriorityTag } from '@/components/ui/PriorityTag';
import { StatusDot } from '@/components/ui/StatusDot';
import { UserAvatar } from '@/components/ui/UserAvatar';
import SearchableCombobox from '@/components/SearchableCombobox';
import { Input } from '@/components/ui/input';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { DetailModal } from '@/components/DetailModal';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';

export const Requirements = ({ embedded = false, preferredViewMode, onPreferredViewModeChange }: { embedded?: boolean; preferredViewMode?: 'cards' | 'list'; onPreferredViewModeChange?: (m: 'cards'|'list') => void; }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const BASE_PATH = '/requirements';

  // Constrói um conjunto seguro de query params permitido pela tela
  const buildSafeSearchParams = (sourceSearch: string) => {
    const source = new URLSearchParams(sourceSearch);
    const params = new URLSearchParams();
    const allowedKeys = ['id', 'modal', 'openCreate'];
    for (const key of allowedKeys) {
      const value = source.get(key);
      if (value !== null) params.set(key, value);
    }
    return params;
  };
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (preferredViewMode) return preferredViewMode;
    const saved = localStorage.getItem('requirements_viewMode');
    return (saved as 'cards' | 'list') || 'list';
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Requirement['priority']>('medium');
  const [status, setStatus] = useState<Requirement['status']>('open');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, currentProject?.id, projects]);

  useEffect(() => {
    localStorage.setItem('requirements_viewMode', viewMode);
    onPreferredViewModeChange?.(viewMode);
  }, [viewMode]);

  // sincroniza quando controle da aba mudar externamente
  useEffect(() => {
    if (preferredViewMode && preferredViewMode !== viewMode) {
      setViewMode(preferredViewMode);
    }
  }, [preferredViewMode]);

  // Deep-link: abre modal de visualização por padrão, ou edição quando modal=req:edit
  useEffect(() => {
    const params = buildSafeSearchParams(location.search);
    const id = params.get('id');
    const modal = params.get('modal');
    const openCreateFlag = params.get('openCreate');
    if (id && requirements.length > 0) {
      const req = requirements.find(r => r.id === id);
      if (req) {
        if (modal === 'req:edit') openEdit(req);
        else { setSelectedReq(req); setShowDetailModal(true); }
      }
    }
    if (openCreateFlag === '1') {
      openCreate();
      // limpar flag para evitar abrir repetidamente
      params.delete('openCreate');
      navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, requirements]);

  const clearIdParam = () => {
    const params = buildSafeSearchParams(location.search);
    if (params.has('id')) {
      params.delete('id');
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
    clearIdParam();
  };

  const loadData = async () => {
    try {
      setLoading(true);
      if (currentProject?.id) {
        const data = await getRequirementsByProject(user!.id, currentProject.id);
        setRequirements(data);
      } else {
        // Agregar SOMENTE projetos ATIVOS quando "Todos"
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length === 0) {
          setRequirements([]);
        } else {
          const lists = await Promise.all(active.map(p => getRequirementsByProject(user!.id, p.id)));
          setRequirements(lists.flat());
        }
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao carregar requisitos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setStatus('open');
    setShowForm(true);
    // Garantir que o parâmetro id não persista ao criar
    clearIdParam();
  };

  const openEdit = (req: Requirement) => {
    setEditing(req);
    setTitle(req.title);
    setDescription(req.description);
    setPriority(req.priority);
    setStatus(req.status);
    setShowForm(true);
    // Quando embedded, manter no pathname atual (gestão); standalone vai para BASE_PATH
    const params = buildSafeSearchParams(location.search);
    params.set('id', req.id);
    params.set('modal', 'req:edit');
    navigate({ pathname: embedded ? location.pathname : BASE_PATH, search: params.toString() }, { replace: false });
  };

  const handleViewDetails = (req: Requirement) => {
    setSelectedReq(req);
    setShowDetailModal(true);
    const params = buildSafeSearchParams(location.search);
    params.set('id', req.id);
    params.set('modal', 'req:view');
    navigate({ pathname: BASE_PATH, search: params.toString() }, { replace: false });
  };

  const submit = async () => {
    try {
      if (!user) return;
      if (editing) {
        const updated = await updateRequirement(editing.id, { title, description, priority, status });
        setRequirements(prev => prev.map(r => r.id === updated.id ? updated : r));
        toast({ title: 'Atualizado', description: 'Requisito atualizado com sucesso.' });
      } else {
        if (!currentProject?.id) {
          toast({ title: 'Selecione um projeto', description: 'É necessário selecionar um projeto para criar requisitos.', variant: 'destructive' });
          return;
        }
        const created = await createRequirement({ user_id: user.id, project_id: currentProject.id, title, description, priority, status } as any);
        setRequirements(prev => [created, ...prev]);
        toast({ title: 'Criado', description: 'Requisito criado com sucesso.' });
      }
      closeForm();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao salvar requisito', variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteRequirement(id);
      setRequirements(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Excluído', description: 'Requisito excluído.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return requirements;
    return requirements.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.id || '').toLowerCase().includes(q)
    );
  }, [requirements, searchTerm]);

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
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Requisitos</h2>
            <p className="text-gray-600 dark:text-gray-400">Gerencie seus requisitos e vínculos com casos</p>
          </div>
          <Dialog open={showForm} onOpenChange={(open) => {
            setShowForm(open);
            if (!open) {
              closeForm();
            }
          }}>
            {hasPermission('can_manage_cases') && (
              <DialogTrigger asChild>
                <StandardButton 
                  variant="brand" 
                  icon={Plus} 
                  onClick={openCreate}
                  className="rounded-full px-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                >
                  Novo Requisito
                </StandardButton>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar Requisito' : 'Novo Requisito'}</DialogTitle>
                <DialogDescription>Preencha os campos obrigatórios.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label htmlFor="req-title-standalone" className="block text-sm mb-1">Título</label>
                  <input id="req-title-standalone" name="req-title" className="w-full rounded-md border p-2 bg-background" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="req-desc-standalone" className="block text-sm mb-1">Descrição</label>
                  <textarea id="req-desc-standalone" name="req-description" className="w-full rounded-md border p-2 bg-background" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1">Prioridade</label>
                    <SearchableCombobox
                      items={[
                        { value: 'low', label: 'Baixa' },
                        { value: 'medium', label: 'Média' },
                        { value: 'high', label: 'Alta' },
                        { value: 'critical', label: 'Crítica' },
                      ]}
                      value={priority}
                      onChange={(value) => { if (value) setPriority(value as Requirement['priority']); }}
                      placeholder="Selecione a prioridade"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Status</label>
                    <SearchableCombobox
                      items={[
                        { value: 'open', label: 'Aberto' },
                        { value: 'in_progress', label: 'Em andamento' },
                        { value: 'approved', label: 'Aprovado' },
                        { value: 'deprecated', label: 'Obsoleto' },
                      ]}
                      value={status}
                      onChange={(value) => { if (value) setStatus(value as Requirement['status']); }}
                      placeholder="Selecione o status"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <StandardButton variant="outline" onClick={closeForm}>Cancelar</StandardButton>
                  <StandardButton 
                    variant="brand"
                    onClick={submit}
                  >
                    {editing ? 'Salvar' : 'Criar'}
                  </StandardButton>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {embedded && (
        <>
          <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) closeForm(); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? 'Editar Requisito' : 'Novo Requisito'}</DialogTitle>
                <DialogDescription>Preencha os campos obrigatórios.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
              <div>
                <label htmlFor="req-title-embedded" className="block text-sm mb-1">Título</label>
                <input id="req-title-embedded" name="req-title" className="w-full rounded-md border p-2 bg-background" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label htmlFor="req-desc-embedded" className="block text-sm mb-1">Descrição</label>
                <textarea id="req-desc-embedded" name="req-description" className="w-full rounded-md border p-2 bg-background" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Prioridade</label>
                  <SearchableCombobox
                    items={[
                      { value: 'low', label: 'Baixa' },
                      { value: 'medium', label: 'Média' },
                      { value: 'high', label: 'Alta' },
                      { value: 'critical', label: 'Crítica' },
                    ]}
                    value={priority}
                    onChange={(value) => { if (value) setPriority(value as Requirement['priority']); }}
                    placeholder="Selecione a prioridade"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Status</label>
                  <SearchableCombobox
                    items={[
                      { value: 'open', label: 'Aberto' },
                      { value: 'in_progress', label: 'Em andamento' },
                      { value: 'approved', label: 'Aprovado' },
                      { value: 'deprecated', label: 'Obsoleto' },
                    ]}
                    value={status}
                    onChange={(value) => { if (value) setStatus(value as Requirement['status']); }}
                    placeholder="Selecione o status"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <StandardButton variant="outline" onClick={closeForm}>Cancelar</StandardButton>
                <StandardButton 
                  variant="brand"
                  onClick={submit}
                  disabled={!hasPermission('can_manage_cases') || !currentProject || isProjectInactive}
                  title={!currentProject ? 'Selecione um projeto ativo para criar' : (isProjectInactive ? 'Projeto não ativo — criação/edição desabilitada' : undefined)}
                >
                  {editing ? 'Salvar' : 'Criar'}
                </StandardButton>
              </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
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
        {!embedded && (
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhum requisito cadastrado.</div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((req) => (
                <Card key={req.id} className="border border-border/50 flex flex-col cursor-pointer card-hover" onClick={() => handleViewDetails(req)}>
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                          {req.sequence ? `REQ-${String(req.sequence).padStart(3, '0')}` : `REQ-${(req.id || '').slice(0, 4)}`}
                        </span>
                        <CardTitle className="text-sm font-semibold line-clamp-2 leading-snug min-w-0">{req.title}</CardTitle>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <StatusDot status={req.status} label={requirementStatusLabel(req.status)} />
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-col flex-1">
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{req.description}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <PriorityTag priority={req.priority} />
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={req.user_id} />
                        {hasPermission('can_manage_cases') && (
                          <StandardButton variant="ghost" size="sm" compact iconOnly ariaLabel="Editar" icon={Pencil}
                            onClick={(e) => { e.stopPropagation(); openEdit(req); }} className="h-8 w-8" />
                        )}
                        {hasPermission('can_manage_cases') && (
                          <StandardButton variant="ghost" size="sm" compact iconOnly ariaLabel="Excluir" icon={Trash2}
                            onClick={(e) => { e.stopPropagation(); remove(req.id); }} className="h-8 w-8" />
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
                <div>Prioridade</div>
                <div className="text-center">Criado por</div>
                <div>Criado em</div>
                <div className="flex justify-end">Ações</div>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border">
                {filtered.map((req) => (
                  <div key={req.id} className="grid grid-cols-[80px_4fr_2fr_2fr_80px_100px_72px] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => handleViewDetails(req)}>
                    {/* ID */}
                    <div>
                      <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-0.5 rounded">
                        {req.sequence ? `REQ-${String(req.sequence).padStart(3, '0')}` : `REQ-${(req.id || '').slice(0, 4)}`}
                      </span>
                    </div>
                    {/* Título + desc */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate leading-tight">{req.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{req.description}</div>
                    </div>
                    {/* Status */}
                    <div>
                      <StatusDot status={req.status} label={requirementStatusLabel(req.status)} />
                    </div>
                    {/* Prioridade */}
                    <div>
                      <PriorityTag priority={req.priority} />
                    </div>
                    {/* Avatar */}
                    <div className="flex justify-center">
                      <UserAvatar userId={req.user_id} />
                    </div>
                    {/* Data */}
                    <div className="text-xs text-muted-foreground">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('pt-BR') : '—'}
                    </div>
                    {/* Ações */}
                    <div className="flex items-center justify-end gap-0.5">
                      {hasPermission('can_manage_cases') && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(req); }}
                          className="h-8 w-8 p-0" title="Editar" aria-label="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {hasPermission('can_manage_cases') && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remove(req.id); }}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Excluir" aria-label="Excluir">
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

      {/* Detail Modal (visualização de Requisito) */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedReq(null);
          const params = buildSafeSearchParams(location.search);
          params.delete('id');
          if (params.get('modal') === 'req:view') params.delete('modal');
          navigate({ pathname: BASE_PATH, search: params.toString() }, { replace: true });
        }}
        item={selectedReq}
        type="requirement"
        onEdit={openEdit}
        onDelete={(id) => remove(id)}
      />
    </div>
  );
};

export default Requirements;
