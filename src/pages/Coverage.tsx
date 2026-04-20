import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/hooks/use-toast';
import {
  getRequirementsByProject,
  getTestCasesByProject,
  getDefectsByProject,
  getCasesByRequirement,
  getTestExecutionsByProject,
} from '@/services/supabaseService';
import { Requirement, TestCase, Defect } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Bug as BugIcon, CheckCircle2, Circle, AlertTriangle, TrendingUp, Link as LinkIcon, FileText } from 'lucide-react';
import { requirementStatusBadgeClass, requirementStatusLabel, severityBadgeClass, severityLabel, defectStatusLabel } from '@/lib/labels';
import { useNavigate } from 'react-router-dom';

interface ReqCoverage {
  req: Requirement;
  linkedCaseIds: string[];
  executedCount: number;
  passedCount: number;
  openDefects: number;
  maxSeverity: string | null;
}

const progressColor = (pct: number) =>
  pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-brand' : pct > 0 ? 'bg-amber-500' : 'bg-muted-foreground/30';

export const Coverage = ({ embedded = false }: { embedded?: boolean }) => {
  const { user } = useAuth();
  const { currentProject, projects } = useProject();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<ReqCoverage[]>([]);
  const [uncoveredCases, setUncoveredCases] = useState<TestCase[]>([]);
  const [openDefectsTotal, setOpenDefectsTotal] = useState(0);
  const [criticalDefects, setCriticalDefects] = useState(0);
  const [totalCases, setTotalCases] = useState(0);
  const [totalReqs, setTotalReqs] = useState(0);

  useEffect(() => {
    if (user) load();
  }, [user, currentProject?.id]);

  const load = async () => {
    try {
      setLoading(true);
      const pid = currentProject?.id;
      if (!pid) {
        const active = (projects || []).filter(p => p.status === 'active');
        if (!active.length) { setCoverage([]); setLoading(false); return; }
      }

      const [reqs, cases, defects, executions] = await Promise.all([
        pid ? getRequirementsByProject(user!.id, pid) : Promise.resolve([] as Requirement[]),
        pid ? getTestCasesByProject(user!.id, pid) : Promise.resolve([] as TestCase[]),
        pid ? getDefectsByProject(user!.id, pid) : Promise.resolve([] as Defect[]),
        pid ? getTestExecutionsByProject(user!.id, pid) : Promise.resolve([] as any[]),
      ]);

      setTotalReqs(reqs.length);
      setTotalCases(cases.length);

      // Mapear execuções por caso
      const execByCaseId: Record<string, { status: string }[]> = {};
      for (const ex of executions as any[]) {
        if (!ex.case_id) continue;
        if (!execByCaseId[ex.case_id]) execByCaseId[ex.case_id] = [];
        execByCaseId[ex.case_id].push({ status: ex.status });
      }

      // Defeitos abertos por case_id
      const openDefByCaseId: Record<string, { severity: string }[]> = {};
      let totalOpen = 0;
      let critCount = 0;
      for (const d of defects as Defect[]) {
        if (d.status === 'closed') continue;
        totalOpen++;
        if (d.severity === 'critical') critCount++;
        if (!d.case_id) continue;
        if (!openDefByCaseId[d.case_id]) openDefByCaseId[d.case_id] = [];
        openDefByCaseId[d.case_id].push({ severity: d.severity });
      }
      setOpenDefectsTotal(totalOpen);
      setCriticalDefects(critCount);

      // Cobertura por requisito
      const rank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      const covList: ReqCoverage[] = await Promise.all(reqs.map(async (req) => {
        const linked = await getCasesByRequirement(user!.id, req.id);
        const linkedIds = linked.map(c => c.id);
        let executedCount = 0;
        let passedCount = 0;
        let openDefects = 0;
        let maxSev: string | null = null;
        for (const cid of linkedIds) {
          const execs = execByCaseId[cid] || [];
          if (execs.length > 0) executedCount++;
          if (execs.some(e => e.status === 'passed')) passedCount++;
          const defs = openDefByCaseId[cid] || [];
          openDefects += defs.length;
          for (const d of defs) {
            if (!maxSev || (rank[d.severity] || 0) > (rank[maxSev] || 0)) maxSev = d.severity;
          }
        }
        return { req, linkedCaseIds: linkedIds, executedCount, passedCount, openDefects, maxSeverity: maxSev };
      }));
      setCoverage(covList);

      // Casos sem requisito
      const allLinkedIds = new Set(covList.flatMap(c => c.linkedCaseIds));
      setUncoveredCases(cases.filter(c => !allLinkedIds.has(c.id)));
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao carregar cobertura', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!currentProject?.id) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Selecione um projeto para visualizar a cobertura de requisitos.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const coveredReqs = coverage.filter(c => c.linkedCaseIds.length > 0).length;
  const covPct = totalReqs > 0 ? Math.round((coveredReqs / totalReqs) * 100) : 0;
  const execPct = totalCases > 0 ? Math.round(((totalCases - uncoveredCases.length) / totalCases) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <FileText className="h-3.5 w-3.5" /> Cobertura Req.
          </div>
          <div className="text-2xl font-bold text-foreground">{covPct}%</div>
          <div className="text-xs text-muted-foreground">{coveredReqs} de {totalReqs} requisitos cobertos</div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${progressColor(covPct)}`} style={{ width: `${covPct}%` }} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Casos Vinculados
          </div>
          <div className="text-2xl font-bold text-foreground">{execPct}%</div>
          <div className="text-xs text-muted-foreground">{totalCases - uncoveredCases.length} de {totalCases} casos com requisito</div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${progressColor(execPct)}`} style={{ width: `${execPct}%` }} />
          </div>
        </div>

        <div
          className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => navigate('/management?tab=defects')}
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <BugIcon className="h-3.5 w-3.5" /> Defeitos Abertos
          </div>
          <div className={`text-2xl font-bold ${openDefectsTotal > 0 ? 'text-destructive' : 'text-foreground'}`}>{openDefectsTotal}</div>
          <div className="text-xs text-muted-foreground">{criticalDefects} crítico{criticalDefects !== 1 ? 's' : ''}</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Sem Requisito
          </div>
          <div className={`text-2xl font-bold ${uncoveredCases.length > 0 ? 'text-amber-500' : 'text-foreground'}`}>{uncoveredCases.length}</div>
          <div className="text-xs text-muted-foreground">casos sem requisito vinculado</div>
        </div>
      </div>

      {/* Tabela de cobertura por requisito */}
      {coverage.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-brand" />
              Cobertura por Requisito
            </h3>
          </div>
          <div className="grid grid-cols-[80px_1fr_100px_80px_80px_80px_100px] items-center gap-3 px-4 py-2 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div>ID</div>
            <div>Requisito</div>
            <div className="text-center">Status</div>
            <div className="text-center">Casos</div>
            <div className="text-center">Exec.</div>
            <div className="text-center">Aprovados</div>
            <div className="text-center">Defeitos</div>
          </div>
          <div className="divide-y divide-border">
            {coverage.map(({ req, linkedCaseIds, executedCount, passedCount, openDefects, maxSeverity }) => {
              const covered = linkedCaseIds.length > 0;
              const allPassed = covered && passedCount === linkedCaseIds.length;
              return (
                <div
                  key={req.id}
                  className="grid grid-cols-[80px_1fr_100px_80px_80px_80px_100px] items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => navigate(`/management?tab=traceability`)}
                >
                  <div>
                    <span className="text-xs font-mono bg-brand/10 text-brand px-2 py-0.5 rounded">
                      {req.sequence ? `REQ-${String(req.sequence).padStart(3, '0')}` : `REQ-${req.id.slice(0, 4)}`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{req.title}</div>
                    {req.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{req.description}</div>}
                  </div>
                  <div className="flex justify-center">
                    <Badge className={requirementStatusBadgeClass(req.status)}>{requirementStatusLabel(req.status)}</Badge>
                  </div>
                  <div className="flex justify-center">
                    {covered ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />{linkedCaseIds.length}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Circle className="h-3.5 w-3.5" />0
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center text-xs text-muted-foreground">{executedCount}/{linkedCaseIds.length || '—'}</div>
                  <div className="flex justify-center">
                    {allPassed ? (
                      <span className="text-xs font-medium text-emerald-500">{passedCount}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{passedCount}</span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {openDefects > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-destructive cursor-pointer hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/management?tab=defects`); }}
                        title={`Severidade máx: ${severityLabel(maxSeverity as any)}`}
                      >
                        <BugIcon className="h-3.5 w-3.5" />{openDefects}
                        {maxSeverity && <Badge className={`${severityBadgeClass(maxSeverity as any)} text-[10px] px-1 py-0`}>{severityLabel(maxSeverity as any)}</Badge>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Casos sem requisito */}
      {uncoveredCases.length > 0 && (
        <div className="bg-card border border-amber-500/20 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-amber-500/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Casos sem Requisito ({uncoveredCases.length})
            </h3>
            <button
              className="text-xs text-brand hover:underline"
              onClick={() => navigate('/management?tab=traceability')}
            >
              Vincular na Matriz →
            </button>
          </div>
          <div className="divide-y divide-border">
            {uncoveredCases.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded shrink-0">
                  {c.sequence ? `CT-${String(c.sequence).padStart(3, '0')}` : c.id.slice(0, 8)}
                </span>
                <span className="text-sm text-foreground truncate flex-1">{c.title}</span>
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </div>
            ))}
            {uncoveredCases.length > 8 && (
              <div className="px-4 py-2 text-xs text-muted-foreground">
                + {uncoveredCases.length - 8} mais — <button className="text-brand hover:underline" onClick={() => navigate('/management?tab=traceability')}>ver na Matriz</button>
              </div>
            )}
          </div>
        </div>
      )}

      {coverage.length === 0 && uncoveredCases.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum dado de cobertura disponível. Crie requisitos e vincule-os a casos de teste.
        </div>
      )}
    </div>
  );
};

export default Coverage;
