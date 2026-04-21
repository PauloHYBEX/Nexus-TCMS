import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3, TrendingUp, ClipboardCheck, Play, Bug, Link2,
  Download, Loader2, CheckCircle, XCircle, AlertCircle, Clock,
  Sparkles, FileText, Users, FolderKanban,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useProject } from '@/contexts/ProjectContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  overview: {
    totalPlans: number;
    totalCases: number;
    totalExecutions: number;
    totalRequirements: number;
    totalDefects: number;
    aiGeneratedCases: number;
    aiGeneratedPlans: number;
  };
  executions: {
    passed: number;
    failed: number;
    blocked: number;
    not_tested: number;
    passRate: number;
  };
  coverage: {
    coveredRequirements: number;
    totalRequirements: number;
    coverageRate: number;
  };
  defects: {
    open: number;
    closed: number;
    critical: number;
    high: number;
  };
  recentActivity: {
    lastExecution?: string;
    lastCase?: string;
    lastPlan?: string;
  };
}

type Period = '7' | '30' | '90' | 'all';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

const StatCard = ({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string;
}) => (
  <div className="border border-border rounded-lg p-4 bg-card flex items-start gap-3">
    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${accent ?? 'bg-brand/10'}`}>
      <Icon className={`h-4.5 w-4.5 ${accent ? 'text-white' : 'text-brand'}`} />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  </div>
);

const BarRow = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => {
  const w = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-muted-foreground truncate shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${w}%` }} />
      </div>
      <div className="text-xs font-medium w-8 text-right">{value}</div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const Reports = () => {
  const { currentProject } = useProject();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('30');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = period === 'all' ? null : (() => {
        const d = new Date();
        d.setDate(d.getDate() - Number(period));
        return d.toISOString();
      })();

      const projectId = currentProject?.id;

      const applyProject = (q: any) => projectId ? q.eq('project_id', projectId) : q;
      const applyDate = (q: any) => since ? q.gte('created_at', since) : q;
      const applyBoth = (q: any) => applyDate(applyProject(q));

      const [
        plansRes, casesRes, execRes, reqsRes, defectsRes
      ] = await Promise.all([
        applyBoth(supabase.from('test_plans').select('id, generated_by_ai, created_at')),
        applyBoth(supabase.from('test_cases').select('id, generated_by_ai, created_at')),
        applyBoth(supabase.from('test_executions').select('id, status, created_at, executed_at')),
        applyBoth(supabase.from('requirements').select('id, created_at')),
        applyBoth(supabase.from('defects').select('id, status, severity, created_at')),
      ]);

      const plans = plansRes.data ?? [];
      const cases = casesRes.data ?? [];
      const execs = execRes.data ?? [];
      const reqs = reqsRes.data ?? [];
      const defects = defectsRes.data ?? [];

      // Coverage — requisitos com pelo menos 1 caso vinculado
      const reqIds = reqs.map((r: any) => r.id);
      let coveredCount = 0;
      if (reqIds.length > 0) {
        const { data: links } = await supabase
          .from('requirement_cases')
          .select('requirement_id')
          .in('requirement_id', reqIds);
        coveredCount = new Set((links ?? []).map((l: any) => l.requirement_id)).size;
      }

      const passed = execs.filter((e: any) => e.status === 'passed').length;
      const failed = execs.filter((e: any) => e.status === 'failed').length;
      const blocked = execs.filter((e: any) => e.status === 'blocked').length;
      const not_tested = execs.filter((e: any) => e.status === 'not_tested').length;

      setData({
        overview: {
          totalPlans: plans.length,
          totalCases: cases.length,
          totalExecutions: execs.length,
          totalRequirements: reqs.length,
          totalDefects: defects.length,
          aiGeneratedCases: cases.filter((c: any) => c.generated_by_ai).length,
          aiGeneratedPlans: plans.filter((p: any) => p.generated_by_ai).length,
        },
        executions: {
          passed, failed, blocked, not_tested,
          passRate: pct(passed, execs.length),
        },
        coverage: {
          coveredRequirements: coveredCount,
          totalRequirements: reqs.length,
          coverageRate: pct(coveredCount, reqs.length),
        },
        defects: {
          open: defects.filter((d: any) => d.status === 'open').length,
          closed: defects.filter((d: any) => d.status === 'closed').length,
          critical: defects.filter((d: any) => d.severity === 'critical').length,
          high: defects.filter((d: any) => d.severity === 'high').length,
        },
        recentActivity: {
          lastExecution: execs.sort((a: any, b: any) => b.created_at > a.created_at ? 1 : -1)[0]?.created_at,
          lastCase: cases.sort((a: any, b: any) => b.created_at > a.created_at ? 1 : -1)[0]?.created_at,
          lastPlan: plans.sort((a: any, b: any) => b.created_at > a.created_at ? 1 : -1)[0]?.created_at,
        },
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro ao carregar relatório', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentProject, period, toast]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    if (!data) return;
    if (!hasPermission('can_export')) {
      toast({ title: 'Sem permissão para exportar', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      const rows = [
        ['Métrica', 'Valor'],
        ['Planos de Teste', data.overview.totalPlans],
        ['Casos de Teste', data.overview.totalCases],
        ['Execuções', data.overview.totalExecutions],
        ['Requisitos', data.overview.totalRequirements],
        ['Defeitos', data.overview.totalDefects],
        ['Taxa de Aprovação (%)', data.executions.passRate],
        ['Cobertura de Requisitos (%)', data.coverage.coverageRate],
        ['Defeitos Abertos', data.defects.open],
        ['Defeitos Críticos', data.defects.critical],
        ['Casos Gerados por IA', data.overview.aiGeneratedCases],
      ];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-sm text-muted-foreground">
              {currentProject ? currentProject.name : 'Todos os projetos'} — visão consolidada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={v => setPeriod(v as Period)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>
          {hasPermission('can_export') && (
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || !data}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando dados...</span>
        </div>
      ) : !data ? null : (
        <div className="space-y-6">

          {/* ── Visão Geral ── */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Visão Geral</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Planos de Teste" value={data.overview.totalPlans} icon={FileText} />
              <StatCard label="Casos de Teste" value={data.overview.totalCases} icon={ClipboardCheck} />
              <StatCard label="Execuções" value={data.overview.totalExecutions} icon={Play} />
              <StatCard label="Requisitos" value={data.overview.totalRequirements} icon={Link2} />
              <StatCard label="Defeitos" value={data.overview.totalDefects} icon={Bug} />
              <StatCard
                label="Gerados por IA"
                value={data.overview.aiGeneratedCases + data.overview.aiGeneratedPlans}
                sub={`${data.overview.aiGeneratedPlans} planos · ${data.overview.aiGeneratedCases} casos`}
                icon={Sparkles}
              />
            </div>
          </section>

          {/* ── Execuções + Cobertura ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Execuções */}
            <div className="border border-border rounded-lg p-4 bg-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Resultado das Execuções</h2>
                <div className="flex items-center gap-1.5">
                  <span className={`text-lg font-bold ${data.executions.passRate >= 80 ? 'text-emerald-400' : data.executions.passRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {data.executions.passRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">aprovação</span>
                </div>
              </div>
              <div className="space-y-2">
                <BarRow label="Aprovado" value={data.executions.passed} max={data.overview.totalExecutions} color="bg-emerald-500" />
                <BarRow label="Falhou" value={data.executions.failed} max={data.overview.totalExecutions} color="bg-red-500" />
                <BarRow label="Bloqueado" value={data.executions.blocked} max={data.overview.totalExecutions} color="bg-amber-500" />
                <BarRow label="Não testado" value={data.executions.not_tested} max={data.overview.totalExecutions} color="bg-muted-foreground/30" />
              </div>
            </div>

            {/* Cobertura de requisitos */}
            <div className="border border-border rounded-lg p-4 bg-card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Cobertura de Requisitos</h2>
                <div className="flex items-center gap-1.5">
                  <span className={`text-lg font-bold ${data.coverage.coverageRate >= 80 ? 'text-emerald-400' : data.coverage.coverageRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {data.coverage.coverageRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">cobertos</span>
                </div>
              </div>
              <div className="flex items-end gap-4">
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${data.coverage.coverageRate >= 80 ? 'bg-emerald-500' : data.coverage.coverageRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${data.coverage.coverageRate}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Com casos vinculados</div>
                  <div className="font-semibold text-emerald-400">{data.coverage.coveredRequirements}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Sem cobertura</div>
                  <div className="font-semibold text-muted-foreground">
                    {data.coverage.totalRequirements - data.coverage.coveredRequirements}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Defeitos + Atividade Recente ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Defeitos */}
            <div className="border border-border rounded-lg p-4 bg-card space-y-3">
              <h2 className="text-sm font-semibold">Defeitos</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Abertos</div>
                  <div className="text-xl font-bold text-red-400">{data.defects.open}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Fechados</div>
                  <div className="text-xl font-bold text-emerald-400">{data.defects.closed}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Críticos</div>
                  <div className="text-xl font-bold text-orange-400">{data.defects.critical}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-2.5">
                  <div className="text-xs text-muted-foreground">Severidade Alta</div>
                  <div className="text-xl font-bold text-amber-400">{data.defects.high}</div>
                </div>
              </div>
            </div>

            {/* Atividade recente */}
            <div className="border border-border rounded-lg p-4 bg-card space-y-3">
              <h2 className="text-sm font-semibold">Última Atividade</h2>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Play className="h-3.5 w-3.5" />
                    Última execução
                  </div>
                  <span className="text-xs font-medium">{fmt(data.recentActivity.lastExecution)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Último caso criado
                  </div>
                  <span className="text-xs font-medium">{fmt(data.recentActivity.lastCase)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Último plano criado
                  </div>
                  <span className="text-xs font-medium">{fmt(data.recentActivity.lastPlan)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default Reports;
