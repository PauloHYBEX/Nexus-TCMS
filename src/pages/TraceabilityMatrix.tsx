import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Requirement, TestCase, TestExecution } from '@/types';

import {
  getRequirements,
  getRequirementsByProject,
  getTestCases,
  getTestCasesByProject,
  getCasesByRequirement,
  linkRequirementToCase,
  unlinkRequirementFromCase,
  getDefects,
  getDefectsByProject,
  getTestExecutions,
  getTestExecutionsByProject,
  deleteRequirement,
} from '@/services/supabaseService';

import { DetailModal } from '@/components/DetailModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StandardButton } from '@/components/StandardButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Link as LinkIcon, Bug as BugIcon, ExternalLink, Cog, Check, X, Search, Lock } from 'lucide-react';
import { 
  priorityLabel, 
  priorityBadgeClass, 
  requirementStatusLabel, 
  requirementStatusBadgeClass,
  severityBadgeClass,
  severityLabel,
} from '@/lib/labels';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { InfoPill } from '@/components/InfoPill';

export const TraceabilityMatrix = ({ embedded = false, preferredViewMode, onPreferredViewModeChange }: { embedded?: boolean; preferredViewMode?: 'cards'|'list'; onPreferredViewModeChange?: (m: 'cards'|'list') => void; }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentProject, projects } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [allCases, setAllCases] = useState<TestCase[]>([]);
  const [linkedByReq, setLinkedByReq] = useState<Record<string, string[]>>({});
  const [defectsByReq, setDefectsByReq] = useState<Record<string, { openCount: number; maxSeverity: 'low'|'medium'|'high'|'critical'|null }>>({});
  const [unassignedSummary, setUnassignedSummary] = useState<{ caseIds: string[]; openCount: number; maxSeverity: 'low'|'medium'|'high'|'critical'|null }>({ caseIds: [], openCount: 0, maxSeverity: null });
  const [loading, setLoading] = useState(true);
  const [manageReqId, setManageReqId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [availableQuery, setAvailableQuery] = useState('');
  const [linkedQuery, setLinkedQuery] = useState('');
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (preferredViewMode) return preferredViewMode;
    const saved = localStorage.getItem('traceability_viewMode');
    return (saved as 'cards' | 'list') || 'list';
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user) {
      bootstrap();
    }
  }, [user, currentProject?.id, projects]);

  useEffect(() => {
    localStorage.setItem('traceability_viewMode', viewMode);
    onPreferredViewModeChange?.(viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (preferredViewMode && preferredViewMode !== viewMode) {
      setViewMode(preferredViewMode);
    }
  }, [preferredViewMode]);

  const bootstrap = async () => {
    try {
      setLoading(true);
      let reqs: Requirement[] = [];
      let cases: TestCase[] = [];
      let defects: any[] = [];
      let executions: any[] = [];

      if (currentProject?.id) {
        const [r, c, d, e] = await Promise.all([
          getRequirementsByProject(user!.id, currentProject.id),
          getTestCasesByProject(user!.id, currentProject.id),
          getDefectsByProject(user!.id, currentProject.id),
          getTestExecutionsByProject(user!.id, currentProject.id),
        ]);
        reqs = r; cases = c; defects = d as any[]; executions = e as any[];
      } else {
        const active = (projects || []).filter(p => p.status === 'active');
        if (active.length > 0) {
          const [rLists, cLists, dLists, eLists] = await Promise.all([
            Promise.all(active.map(p => getRequirementsByProject(user!.id, p.id))),
            Promise.all(active.map(p => getTestCasesByProject(user!.id, p.id))),
            Promise.all(active.map(p => getDefectsByProject(user!.id, p.id))),
            Promise.all(active.map(p => getTestExecutionsByProject(user!.id, p.id))),
          ]);
          reqs = rLists.flat();
          cases = cLists.flat();
          defects = dLists.flat() as any[];
          executions = eLists.flat() as any[];
        } else {
          reqs = []; cases = []; defects = []; executions = [];
        }
      }

      setRequirements(reqs);
      setAllCases(cases);

      // Carrega vínculos por requisito em paralelo
      const results = await Promise.all(
        reqs.map(r =>
          getCasesByRequirement(user!.id, r.id).then(rCases => ({
            reqId: r.id,
            caseIds: rCases.map(c => c.id)
          }))
        )
      );
      const map: Record<string, string[]> = {};
      for (const res of results) {
        map[res.reqId] = res.caseIds;
      }
      setLinkedByReq(map);

      // Mapear execucao -> case para suportar defeitos criados apenas com execution_id
      const execToCase = new Map<string, string | null>();
      (executions as TestExecution[]).forEach(ex => {
        execToCase.set((ex as any).id, (ex as any).case_id || null);
      });

      // Calcular defeitos abertos por requisito (baseado nos cases vinculados ou derivados da execução)
      const rank: Record<'low'|'medium'|'high'|'critical', number> = { low: 1, medium: 2, high: 3, critical: 4 };
      const dMap: Record<string, { openCount: number; maxSeverity: 'low'|'medium'|'high'|'critical'|null }> = {};
      for (const r of reqs) {
        const caseSet = new Set(map[r.id] || []);
        let openCount = 0;
        let maxSeverity: 'low'|'medium'|'high'|'critical'|null = null;
        for (const d of defects as any[]) {
          const derivedCaseId = d.case_id || (d.execution_id ? execToCase.get(d.execution_id) || undefined : undefined);
          if (derivedCaseId && caseSet.has(derivedCaseId) && d.status !== 'closed') {
            openCount += 1;
            if (!maxSeverity || rank[d.severity as 'low'|'medium'|'high'|'critical'] > rank[maxSeverity]) {
              maxSeverity = d.severity as 'low'|'medium'|'high'|'critical';
            }
          }
        }
        dMap[r.id] = { openCount, maxSeverity };
      }
      setDefectsByReq(dMap);

      // Resumo "Sem Requisito": casos sem vínculo e defeitos associados
      const linkedCaseIds = new Set<string>();
      Object.values(map).forEach(arr => arr.forEach(id => linkedCaseIds.add(id)));
      const unassignedIds = (cases || []).map(c => c.id).filter(id => !linkedCaseIds.has(id));

      let unOpen = 0;
      let unMax: 'low'|'medium'|'high'|'critical'|null = null;
      for (const d of defects) {
        const derivedCaseId = d.case_id || (d.execution_id ? execToCase.get(d.execution_id) || undefined : undefined);
        if (derivedCaseId && unassignedIds.includes(derivedCaseId) && d.status !== 'closed') {
          unOpen += 1;
          if (!unMax || rank[d.severity as 'low'|'medium'|'high'|'critical'] > rank[unMax]) {
            unMax = d.severity as 'low'|'medium'|'high'|'critical';
          }
        }
      }
      setUnassignedSummary({ caseIds: unassignedIds, openCount: unOpen, maxSeverity: unMax });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao carregar matriz', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openManage = (reqId: string) => {
    setManageReqId(reqId);
  };

  const closeManage = () => {
    setManageReqId(null);
  };

  const isLinked = (reqId: string, caseId: string) => {
    return (linkedByReq[reqId] || []).includes(caseId);
  };

  const toggleLink = async (reqId: string, caseId: string) => {
    if (!user) return;
    if (isProjectInactive) { toast({ title: 'Projeto não ativo', description: 'Edição de vínculos desabilitada.', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      if (isLinked(reqId, caseId)) {
        await unlinkRequirementFromCase(reqId, caseId);
        setLinkedByReq(prev => ({
          ...prev,
          [reqId]: (prev[reqId] || []).filter(id => id !== caseId)
        }));
        toast({ title: 'Desvinculado', description: 'Requisito desvinculado do caso.' });
      } else {
        await linkRequirementToCase(reqId, caseId, user.id);
        setLinkedByReq(prev => ({
          ...prev,
          [reqId]: [...(prev[reqId] || []), caseId]
        }));
        toast({ title: 'Vinculado', description: 'Requisito vinculado ao caso.' });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao atualizar vínculo', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const managedRequirement = useMemo(
    () => requirements.find(r => r.id === manageReqId) || null,
    [manageReqId, requirements]
  );

  const filteredRequirements = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return requirements;
    return requirements.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.id || '').toLowerCase().includes(q)
    );
  }, [requirements, searchTerm]);

  const filteredAllCases = useMemo(() => {
    const q = availableQuery.trim().toLowerCase();
    if (!q) return allCases;
    return allCases.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      String(c.sequence ?? '').toLowerCase().includes(q)
    );
  }, [allCases, availableQuery]);

  const filteredLinkedCases = useMemo(() => {
    if (!managedRequirement) return [] as TestCase[];
    const base = allCases.filter(c => isLinked(managedRequirement.id, c.id));
    const q = linkedQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      String(c.sequence ?? '').toLowerCase().includes(q)
    );
  }, [allCases, linkedQuery, managedRequirement, linkedByReq]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        {/* Detail Modal (visualização de requisito) */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedReq(null); }}
        item={selectedReq}
        type="requirement"
        onEdit={(item) => { if (item?.id) { openManage(item.id); setShowDetailModal(false); } }}
        onDelete={async (id) => {
          try {
            await deleteRequirement(id);
            setRequirements(prev => prev.filter(r => r.id !== id));
            setShowDetailModal(false);
            toast({ title: 'Excluído', description: 'Requisito excluído.' });
          } catch (e: any) {
            toast({ title: 'Erro', description: e?.message || 'Falha ao excluir requisito', variant: 'destructive' });
          }
        }}
      />
    </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <LinkIcon className="h-6 w-6" /> Matriz de Rastreabilidade
            </h2>
            <p className="text-gray-600 dark:text-gray-400">Vincule requisitos a casos de teste</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID ou Título"
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {!embedded && (
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
      </div>

      {filteredRequirements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Nenhum requisito disponível para rastreabilidade.</div>
      ) : (
        <>
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequirements.map(req => {
                const linkedCount = (linkedByReq[req.id] || []).filter(id => allCases.some(c => c.id === id)).length;
                const dInfo = defectsByReq[req.id] || { openCount: 0, maxSeverity: null };
                return (
                  <Card
                    key={req.id}
                    className="h-full flex flex-col border border-border/50 cursor-pointer card-hover overflow-hidden"
                    onClick={() => { setSelectedReq(req); setShowDetailModal(true); }}
                  >
                    <CardHeader className="p-4 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">{`REQ-${(req.id || '').slice(0,4)}`}</span>
                          <CardTitle className="text-base line-clamp-2 leading-tight min-w-0">{req.title}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-2">
                          <Badge className={priorityBadgeClass(req.priority)}>{priorityLabel(req.priority)}</Badge>
                          <Badge className={requirementStatusBadgeClass(req.status)}>{requirementStatusLabel(req.status)}</Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2 line-clamp-2">{req.description}</div>
                      <div className="mt-auto flex items-center justify-end gap-2">
                        <span
                          onClick={(e) => { e.stopPropagation(); if (hasPermission('can_manage_cases')) openManage(req.id); else toast({ title: 'Sem permissão', description: 'Você não pode gerenciar vínculos.', variant: 'destructive' }); }}
                          className="inline-flex"
                        >
                          <InfoPill
                            icon={LinkIcon}
                            value={linkedCount}
                            title={isProjectInactive ? 'Projeto não ativo — gerenciar desabilitado' : (hasPermission('can_manage_cases') ? 'Gerenciar vínculos' : 'Sem permissão para gerenciar')}
                            className="h-5 w-[40px] px-1.5 text-[11px]"
                            ariaLabel="Gerenciar vínculos"
                          />
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const caseIds = linkedByReq[req.id] || [];
                            if (dInfo.openCount > 0 && caseIds.length) {
                              navigate(`/management?tab=defects&cases=${caseIds.join(',')}`);
                            } else {
                              toast({ title: 'Sem defeitos', description: 'Nenhum defeito aberto para este requisito. Abrindo a tela de Defeitos.', variant: 'default' });
                              navigate('/management?tab=defects');
                            }
                          }}
                          className="inline-flex"
                        >
                          <InfoPill
                            icon={BugIcon}
                            value={dInfo.openCount}
                            title={dInfo.openCount > 0 ? `Ver defeitos • severidade: ${severityLabel(dInfo.maxSeverity!)}` : 'Nenhum defeito aberto'}
                            variant={dInfo.openCount > 0 ? 'attention' : 'default'}
                            className="h-5 w-[40px] px-1.5 text-[11px]"
                            ariaLabel="Ver defeitos do requisito"
                          />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[80px_1fr_120px_120px_100px] items-center gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <div className="pt-px">ID</div>
                <div className="text-center pt-px">Título</div>
                <div className="text-center pt-px">Prioridade</div>
                <div className="text-center pt-px">Status</div>
                <div className="flex justify-center">Vínculos / Ações</div>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border">
              {filteredRequirements.map((req) => {
                const linkedCount = (linkedByReq[req.id] || []).length;
                const dInfo = defectsByReq[req.id] || { openCount: 0, maxSeverity: null };
                return (
                  <div
                    key={req.id}
                    className="grid grid-cols-[80px_1fr_120px_120px_100px] items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors min-h-[56px] cursor-pointer"
                    onClick={() => { setSelectedReq(req); setShowDetailModal(true); }}
                  >
                    <div className="flex items-center"><span className="text-xs font-mono bg-brand/10 text-brand px-2 py-1 rounded">{`REQ-${(req.id || '').slice(0,4)}`}</span></div>
                    <div className="text-sm font-medium leading-tight text-center flex items-center justify-center min-w-0"><span className="truncate">{req.title}</span></div>
                    <div className="flex items-center justify-center"><Badge className={priorityBadgeClass(req.priority)}>{priorityLabel(req.priority)}</Badge></div>
                    <div className="flex items-center justify-center"><Badge className={requirementStatusBadgeClass(req.status)}>{requirementStatusLabel(req.status)}</Badge></div>
                    <div className="grid grid-cols-[40px_40px] items-center justify-center justify-items-center gap-2">
                      <span
                        onClick={(e) => { e.stopPropagation(); if (isProjectInactive) { toast({ title: 'Projeto não ativo', description: 'Gerenciamento desabilitado.', variant: 'destructive' }); return; } if (hasPermission('can_manage_cases')) openManage(req.id); else toast({ title: 'Sem permissão', description: 'Você não pode gerenciar vínculos.', variant: 'destructive' }); }}
                        className="inline-flex"
                      >
                        <InfoPill
                          icon={LinkIcon}
                          value={linkedCount}
                          title={hasPermission('can_manage_cases') ? 'Gerenciar vínculos' : 'Sem permissão para gerenciar'}
                          className="h-5 w-[40px] px-1.5 text-[11px]"
                          ariaLabel="Gerenciar vínculos"
                        />
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          const caseIds = linkedByReq[req.id] || [];
                          if (dInfo.openCount > 0 && caseIds.length) {
                            navigate(`/management?tab=defects&cases=${caseIds.join(',')}`);
                          } else {
                            toast({ title: 'Sem defeitos', description: 'Nenhum defeito aberto para este requisito. Abrindo a tela de Defeitos.', variant: 'default' });
                            navigate('/management?tab=defects');
                          }
                        }}
                        className="inline-flex"
                      >
                        <InfoPill
                          icon={BugIcon}
                          value={dInfo.openCount}
                          title={dInfo.openCount > 0 ? `Ver defeitos • severidade: ${severityLabel(dInfo.maxSeverity!)}` : 'Nenhum defeito aberto'}
                          variant={dInfo.openCount > 0 ? 'attention' : 'default'}
                          className="h-5 w-[40px] px-1.5 text-[11px]"
                          ariaLabel="Ver defeitos do requisito"
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Linha extra: Casos sem requisito */}
              {(unassignedSummary.caseIds.length > 0 || unassignedSummary.openCount > 0) && (
                <div className="grid grid-cols-[80px_1fr_120px_120px_100px] items-center gap-4 px-4 py-3 bg-muted/30">
                  <div className="flex items-center text-xs text-muted-foreground">—</div>
                  <div className="text-sm font-medium leading-tight text-center flex items-center justify-center min-w-0"><span className="truncate">Sem Requisito</span></div>
                  <div className="flex items-center justify-center text-xs text-muted-foreground">—</div>
                  <div className="flex items-center justify-center text-xs text-muted-foreground">—</div>
                  <div className="flex items-center justify-center gap-2">
                    <InfoPill
                      icon={LinkIcon}
                      value={unassignedSummary.caseIds.length}
                      title="Casos sem requisito"
                      className="h-5 w-[40px] px-1.5 text-[11px]"
                      onClick={() => {
                        toast({ title: 'Casos sem requisito', description: 'Abra um requisito e use Gerenciar vínculos para associar casos.', variant: 'default' });
                      }}
                      ariaLabel="Casos sem requisito"
                    />
                    <InfoPill
                      icon={BugIcon}
                      value={unassignedSummary.openCount}
                      title={unassignedSummary.openCount > 0 ? 'Ver defeitos de casos sem requisito' : 'Nenhum defeito aberto em casos sem requisito'}
                      variant={unassignedSummary.openCount > 0 ? 'attention' : 'default'}
                      className="h-5 w-[40px] px-1.5 text-[11px]"
                      onClick={() => {
                        const ids = unassignedSummary.caseIds;
                        if (ids.length && unassignedSummary.openCount > 0) {
                          navigate(`/management?tab=defects&cases=${ids.join(',')}`);
                        } else {
                          navigate('/management?tab=defects');
                        }
                      }}
                      ariaLabel="Ver defeitos de casos sem requisito"
                    />
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!manageReqId} onOpenChange={(open) => !open && closeManage()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar vínculos</DialogTitle>
            <DialogDescription>
              {managedRequirement ? `Requisito: ${managedRequirement.title}` : 'Selecione um requisito'}
            </DialogDescription>
          </DialogHeader>
          {managedRequirement && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Todos os Casos</h4>
                <div className="mb-2 relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar casos..."
                    className="pl-9"
                    value={availableQuery}
                    onChange={(e) => setAvailableQuery(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  {filteredAllCases.map(c => {
                    const linked = isLinked(managedRequirement.id, c.id);
                    return (
                      <div key={c.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div className="text-sm">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">#{c.sequence ?? c.id.slice(0, 8)}</span>
                            {c.title}
                          </div>
                          <div className="text-gray-500 text-xs line-clamp-1">{c.description}</div>
                        </div>
                        {!currentProject || currentProject.status === 'active' ? (
                          <StandardButton
                            size="sm"
                            variant={linked ? 'secondary' : 'outline'}
                            icon={linked ? X : Check}
                            disabled={saving || !hasPermission('can_manage_cases')}
                            onClick={() => toggleLink(managedRequirement.id, c.id)}
                          >
                            {linked ? 'Desvincular' : 'Vincular'}
                          </StandardButton>
                        ) : (
                          <StandardButton
                            size="sm"
                            variant="outline"
                            icon={Lock}
                            disabled
                          >
                            Projeto não ativo
                          </StandardButton>
                        )}
                      </div>
                    );
                  })}
                  {filteredAllCases.length === 0 && (
                    <div className="text-sm text-gray-500 py-2">Nenhum caso encontrado.</div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Casos Vinculados</h4>
                <div className="mb-2 relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar vinculados..."
                    className="pl-9"
                    value={linkedQuery}
                    onChange={(e) => setLinkedQuery(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  {filteredLinkedCases
                    .map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div className="text-sm">
                          <div className="font-medium flex items-center gap-2">
                            <span className="text-xs text-gray-500">#{c.sequence ?? c.id.slice(0, 8)}</span>
                            {c.title}
                          </div>
                          <div className="text-gray-500 text-xs line-clamp-1">{c.description}</div>
                        </div>
                        <StandardButton size="sm" variant="outline" icon={ExternalLink} onClick={() => {
                          window.open(`/cases?id=${c.id}`, '_blank');
                        }}>Ver Caso</StandardButton>
                      </div>
                    ))}
                  {filteredLinkedCases.length === 0 && (
                    <div className="text-sm text-gray-500 py-2">Nenhum caso vinculado encontrado.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TraceabilityMatrix;
