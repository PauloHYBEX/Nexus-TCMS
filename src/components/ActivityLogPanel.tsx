import React, { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, RefreshCcw, Clock, User, FileText, Play, ClipboardCheck, Bug, Link2, Settings } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  user_id: string;
  action: string;
  context?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  profile?: { display_name: string | null; avatar_url?: string | null };
}

type DaysOption = 7 | 30 | 90;

// ── Helpers ────────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ElementType> = {
  plan: FileText,
  case: ClipboardCheck,
  execution: Play,
  defect: Bug,
  requirement: Link2,
  user: User,
  project: Settings,
};

const contextIcon = (context?: string | null): React.ElementType => {
  if (!context) return Clock;
  const c = context.toLowerCase();
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (c.includes(key)) return icon;
  }
  return Clock;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const initials = (name?: string | null) => {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
};

// ── Component ──────────────────────────────────────────────────────────────────

interface ActivityLogPanelProps {
  /** Se informado, filtra logs apenas deste usuário. Se null, busca todos (log global). */
  userId?: string | null;
  /** Exibe coluna de usuário (útil no log global) */
  showUserColumn?: boolean;
}

export const ActivityLogPanel = ({ userId = null, showUserColumn = false }: ActivityLogPanelProps) => {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<DaysOption>(30);
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async (daysBack: DaysOption = days) => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      let query = supabase
        .from('activity_logs' as any)
        .select('id, user_id, action, context, metadata, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      const entries: ActivityLogEntry[] = (data || []) as ActivityLogEntry[];

      // Buscar perfis para usuários únicos
      const uids = [...new Set(entries.map(e => e.user_id).filter(Boolean))];
      if (uids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', uids);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        entries.forEach(e => {
          e.profile = profileMap.get(e.user_id) ?? null;
        });
      }

      setLogs(entries);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [userId, days]);

  const handleDaysChange = (val: string) => {
    const d = Number(val) as DaysOption;
    setDays(d);
    if (loaded) fetchLogs(d);
  };

  const filtered = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter(l =>
      l.action?.toLowerCase().includes(q) ||
      l.context?.toLowerCase().includes(q) ||
      l.profile?.display_name?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Clock className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Clique para carregar os logs de atividade</p>
        <Button size="sm" variant="outline" onClick={() => fetchLogs()}>
          Carregar logs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar ação, contexto ou usuário..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={String(days)} onValueChange={handleDaysChange}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchLogs()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Carregando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {search ? 'Nenhum log encontrado para a busca.' : 'Nenhuma atividade registrada no período.'}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className={`grid ${showUserColumn ? 'grid-cols-[1fr_160px_160px]' : 'grid-cols-[1fr_160px]'} items-center px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>
            <div>Ação</div>
            {showUserColumn && <div>Usuário</div>}
            <div>Data/Hora</div>
          </div>
          <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
            {filtered.map(log => {
              const Icon = contextIcon(log.context);
              return (
                <div
                  key={log.id}
                  className={`grid ${showUserColumn ? 'grid-cols-[1fr_160px_160px]' : 'grid-cols-[1fr_160px]'} items-start px-4 py-2.5 hover:bg-muted/20 transition-colors`}
                >
                  {/* Ação */}
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{log.action}</div>
                      {log.context && (
                        <div className="text-[11px] text-muted-foreground truncate">{log.context}</div>
                      )}
                    </div>
                  </div>
                  {/* Usuário (log global) */}
                  {showUserColumn && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-5 w-5 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[9px] font-bold shrink-0">
                        {initials(log.profile?.display_name)}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {log.profile?.display_name ?? log.user_id.slice(0, 8)}
                      </span>
                    </div>
                  )}
                  {/* Data */}
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'} • últimos {days} dias
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityLogPanel;
