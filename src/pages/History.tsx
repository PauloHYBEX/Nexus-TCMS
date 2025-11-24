import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePaginationUrlSync } from '@/hooks/usePaginationUrlSync';
import { useVirtualTableHeight } from '@/hooks/useVirtualTableHeight';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getActivityLogs, type ActivityLog } from '@/services/supabaseService';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { VirtualList } from '@/experimental/VirtualList';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface HistoryItem {
  id: string;
  type: 'plan' | 'case' | 'execution' | 'other';
  action: string;
  description?: string;
  updated_at: Date;
  data: { user_id: string };
  meta?: { entity?: string; id?: string } | Record<string, unknown>;
}

export const History = () => {
  const { initFromSearchParams, writeFromState } = usePaginationUrlSync();
  const { user } = useAuth();
  const navigate = useNavigate();
  const E2E_MOCK = String((import.meta as { env?: Record<string, string> })?.env?.VITE_E2E_MOCK_HISTORY ?? 'false') === 'true';
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topBlockRef = useRef<HTMLDivElement | null>(null);
  const listCardRef = useRef<HTMLDivElement | null>(null);
  const listHeaderRef = useRef<HTMLDivElement | null>(null);
  // Altura da lista virá do hook de layout virtual
  const paginationRef = useRef<HTMLDivElement | null>(null);
  const [rowSize, setRowSize] = useState<number>(72);
  // Perfis de usuários para exibir avatar/nome
  const [profilesMap, setProfilesMap] = useState<Record<string, { display_name: string | null; avatar_url?: string | null }>>({});
  // Filtros (controlados) e filtros aplicados
  const [q, setQ] = useState('');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'plan' | 'case' | 'execution'>('all');
  const [applied, setApplied] = useState<{ q: string; dateStart?: string; dateEnd?: string; type: 'all' | 'plan' | 'case' | 'execution' }>({ q: '', type: 'all' });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  // Paginação padrão do sistema
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(5);

  const deriveTypeFromAction = (action: string): HistoryItem['type'] => {
    const a = action.toLowerCase();
    if (a.includes('execução')) return 'execution';
    if (a.includes('plano')) return 'plan';
    if (a.includes('caso')) return 'case';
    return 'other';
  };

  // Abrir modal específico conforme metadados do log
  const openLinkedModal = (item: HistoryItem) => {
    const entity = (item.meta?.entity as string | undefined) || item.type;
    const id = (item.meta?.id as string | undefined);
    if (id) {
      if (entity === 'plan') {
        navigate({ pathname: '/plans', search: `?id=${encodeURIComponent(id)}&modal=plan:view` });
        return;
      }
      if (entity === 'case') {
        navigate({ pathname: '/cases', search: `?id=${encodeURIComponent(id)}&modal=case:view` });
        return;
      }
      if (entity === 'execution') {
        navigate({ pathname: '/executions', search: `?id=${encodeURIComponent(id)}&modal=exec:view` });
        return;
      }
      if (entity === 'requirement') {
        navigate(`/management?tab=requirements&id=${encodeURIComponent(id)}&modal=req:view`);
        return;
      }
      if (entity === 'defect') {
        navigate(`/management?tab=defects&id=${encodeURIComponent(id)}&modal=defect:view`);
        return;
      }
    }
    // Fallback: abrir modal genérico
    setSelected(item);
    setOpen(true);
  };

  const loadHistoryData = useCallback(async (range?: { start?: Date; end?: Date }) => {
    try {
      if (E2E_MOCK) {
        const now = new Date();
        const mockUser = 'e2e-user';
        const mockItems: HistoryItem[] = [
          { id: 'log1', type: 'plan', action: 'Plano criado PT-1', description: 'Plano de Teste criado — Título: Alpha', updated_at: now, data: { user_id: mockUser }, meta: { entity: 'plan', id: 'pt-1' } },
          { id: 'log2', type: 'case', action: 'Caso atualizado CT-2', description: 'Caso de Teste atualizado — Campos: título', updated_at: now, data: { user_id: mockUser }, meta: { entity: 'case', id: 'ct-2' } },
          { id: 'log3', type: 'execution', action: 'Execução criada EX-3', description: 'Execução de Teste criada — Status: not_tested', updated_at: now, data: { user_id: mockUser }, meta: { entity: 'execution', id: 'ex-3' } },
          { id: 'log4', type: 'other', action: 'Requisito criado RQ-4', description: 'Requisito criado — Título: Beta', updated_at: now, data: { user_id: mockUser }, meta: { entity: 'requirement', id: 'rq-4' } },
          { id: 'log5', type: 'other', action: 'Defeito criado DF-5', description: 'Defeito criado — Status: open', updated_at: now, data: { user_id: mockUser }, meta: { entity: 'defect', id: 'df-5' } },
        ];
        setItems(mockItems);
        setProfilesMap({ [mockUser]: { display_name: 'E2E User', avatar_url: null } });
        setLoading(false);
        return;
      }
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const start = range?.start ?? twoWeeksAgo;
      const end = range?.end ?? new Date();
      const logs: ActivityLog[] = await getActivityLogs(user!.id, { dateStart: start, dateEnd: end });
      const historyItems: HistoryItem[] = logs.map((log) => ({
        id: log.id,
        type: deriveTypeFromAction(log.action),
        action: log.action,
        description: log.context ?? undefined,
        updated_at: log.created_at,
        data: { user_id: log.user_id },
        meta: log.metadata as Record<string, unknown> | undefined
      }));

      // Ordenar por data mais recente
      historyItems.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
      setItems(historyItems);
      // Carregar perfis/avatars dos usuários presentes
      const uids = Array.from(new Set(historyItems.map(i => i.data.user_id).filter(Boolean)));
      if (uids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', uids);
        const map: Record<string, { display_name: string | null; avatar_url?: string | null }> = {};
        ((profiles as Array<{ id: string; display_name: string | null; avatar_url: string | null }> | null) || []).forEach((p) => {
          map[p.id] = { display_name: p.display_name ?? null, avatar_url: p.avatar_url ?? null };
        });
        setProfilesMap(map);
      } else {
        setProfilesMap({});
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar histórico",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [user, E2E_MOCK]);

  useEffect(() => {
    if (user) {
      loadHistoryData();
    }
  }, [user, loadHistoryData]);

  // Removido: controle de overflow agora centralizado no Layout

  useEffect(() => {
    initFromSearchParams({ setQ, setDateStart, setDateEnd, setTypeFilter, setApplied, setPage });
  }, [initFromSearchParams]);

  // Sem abas: filtro por tipo é controlado apenas pelo Select acima

  // Filtro e paginação calculados antes dos efeitos de layout
  const filteredItems = useMemo(() => {
    const f = applied;
    let list = items;
    // Tipo
    if (f.type !== 'all') list = list.filter(it => it.type === f.type);
    // Datas
    if (f.dateStart) {
      const s = new Date(f.dateStart + 'T00:00:00');
      list = list.filter(it => it.updated_at >= s);
    }
    if (f.dateEnd) {
      const e = new Date(f.dateEnd + 'T23:59:59');
      list = list.filter(it => it.updated_at <= e);
    }
    // Busca textual (usuário, ação/tipo, descrição)
    const term = (f.q || '').trim().toLowerCase();
    if (term) {
      list = list.filter(it => {
        const prof = profilesMap[it.data.user_id];
        const userName = (prof?.display_name || '').toLowerCase();
        const typeLabel = getTypeLabel(it.type).toLowerCase();
        const action = (it.action || '').toLowerCase();
        const desc = (it.description || '').toLowerCase();
        return userName.includes(term) || typeLabel.includes(term) || action.includes(term) || desc.includes(term);
      });
    }
    return list;
  }, [items, applied, profilesMap]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const limitedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Altura calculada via hook reutilizável
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

  // Medir altura real de uma linha quando a lista for renderizada
  useEffect(() => {
    const el = listCardRef.current?.querySelector('.virtual-list-container [data-index="0"]') as HTMLElement | null;
    if (el) {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h && Math.abs(h - rowSize) > 1) setRowSize(h);
    }
  }, [limitedItems.length, items.length, rowSize]);

  // Itens não abrem modal; histórico mostra resumo apenas

  // ícones contextuais removidos para manter minimalismo da lista

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'plan': return 'Plano de Teste';
      case 'case': return 'Caso de Teste';
      case 'execution': return 'Execução';
      default: return 'Ação';
    }
  };

  // Helpers mínimos

  // Trunca descrições longas para manter os cards compactos
  const truncateText = (txt?: string, max: number = 160) => {
    if (!txt) return '';
    const clean = txt.replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
  };

  // Aplicar filtros quando clicado
  const applyFilters = () => {
    const nextApplied = { q, dateStart: dateStart || undefined, dateEnd: dateEnd || undefined, type: typeFilter as 'all'|'plan'|'case'|'execution' };
    setApplied(nextApplied);
    const start = dateStart ? new Date(dateStart + 'T00:00:00') : undefined;
    const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : undefined;
    // Recarrega do backend com o range
    loadHistoryData({ start, end });
    setPage(1);
    writeFromState(nextApplied, 1);
  };

  /** REMOVIDO: bloco duplicado de filteredItems/totalItems/currentPage/limitedItems */

  // Garante que a página atual exista quando filtros mudarem
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    writeFromState(applied, currentPage);
  }, [applied, currentPage, writeFromState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 p-6 flex flex-col gap-6 min-h-0 overflow-hidden" data-testid="history-page">
      {/* Título e ações */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Histórico de Atividades</h2>
          <p className="text-gray-600 dark:text-gray-400">Visualize e filtre as ações recentes</p>
        </div>
      </div>
      {/* Filtros minimalistas */}
      <Card ref={topBlockRef} className="filters">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground"/>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar por usuário, ação ou detalhe"
                className="h-9"
              />
            </div>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="h-9"/>
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="h-9"/>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'plan' | 'case' | 'execution')}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="plan">Planos</SelectItem>
                <SelectItem value="case">Casos</SelectItem>
                <SelectItem value="execution">Execuções</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="secondary" onClick={applyFilters} aria-label="Aplicar filtros">
              <Search className="h-4 w-4"/>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sem abas; o filtro por tipo está no Select acima */}

      {/* Lista em tabela com cabeçalho */}
      {filteredItems.length > 0 ? (
        <Card ref={listCardRef} className="bg-card border border-border rounded-lg overflow-hidden" data-testid="history-list">
          <div ref={listHeaderRef} className="grid grid-cols-[1.2fr_0.8fr_1.8fr_0.8fr] items-start gap-4 px-4 py-3 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div>Usuário</div>
            <div className="text-center">Ação</div>
            <div className="text-center">Detalhes</div>
            <div className="text-right">Data</div>
          </div>
          <div className="border-t no-scrollbar">
            <VirtualList
              key={`hist-${currentPage}-${pageSize}-${rowSize}`}
              items={limitedItems}
              itemKey={(it) => `${it.type}-${it.id}`}
              estimateSize={rowSize}
              className="overflow-x-hidden no-scrollbar"
              height={listHeight}
              overscan={4}
              renderItem={(item) => {
                const prof = profilesMap[item.data.user_id];
                return (
                  <div
                    className="grid grid-cols-[1.2fr_0.8fr_1.8fr_0.8fr] items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => openLinkedModal(item)}
                    data-testid="history-row"
                    data-entity={item.meta?.entity || item.type}
                    data-itemid={item.meta?.id || item.id}
                  >
                    {/* Usuário */}
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={prof?.avatar_url || undefined} alt={prof?.display_name || ''} />
                        <AvatarFallback>{(prof?.display_name || 'U')?.slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="truncate font-medium">{prof?.display_name || '—'}</div>
                    </div>

                    {/* Ação */}
                    <div className="min-w-0 flex items-center gap-2 justify-center">
                      <Badge variant="outline">{getTypeLabel(item.type)}</Badge>
                    </div>

                    {/* Detalhes */}
                    <div className="text-sm text-muted-foreground min-w-0 pr-4 text-center">
                      {item.description && (
                        <div className="truncate">{truncateText(item.description, 180)}</div>
                      )}
                    </div>

                    {/* Data */}
                    <div className="text-sm text-right text-muted-foreground tabular-nums min-w-0 pl-2">
                      {`${item.updated_at.toLocaleDateString('pt-BR')}, ${item.updated_at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        </Card>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum resultado encontrado com os filtros atuais.</p>
        </div>
      )}
      {/* Paginação */}
      {filteredItems.length > 0 && (
        <div ref={paginationRef} className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">
            {(() => {
              const start = (currentPage - 1) * pageSize + 1;
              const end = Math.min(currentPage * pageSize, totalItems);
              return `Mostrando ${start}–${end} de ${totalItems}`;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de detalhes do log */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da ação</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={profilesMap[selected.data.user_id]?.avatar_url || undefined} />
                  <AvatarFallback>{(profilesMap[selected.data.user_id]?.display_name || 'U').slice(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="font-medium">{profilesMap[selected.data.user_id]?.display_name || '—'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Ação: </span>
                <span className="font-medium">{getTypeLabel(selected.type)}</span>
              </div>
              {selected.description && (
                <div>
                  <span className="text-muted-foreground">Detalhes: </span>
                  <span>{selected.description}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Data: </span>
                <span className="tabular-nums">{`${selected.updated_at.toLocaleDateString('pt-BR')}, ${selected.updated_at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
