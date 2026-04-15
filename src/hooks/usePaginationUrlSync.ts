import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type Applied = { q: string; dateStart?: string; dateEnd?: string; type: 'all'|'plan'|'case'|'execution' };

type Setters = {
  setQ: (v: string) => void;
  setDateStart: (v: string) => void;
  setDateEnd: (v: string) => void;
  setTypeFilter: (v: 'all'|'plan'|'case'|'execution') => void;
  setApplied: (v: Applied) => void;
  setPage: (n: number) => void;
};

export function usePaginationUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initFromSearchParams = useCallback((s: Setters) => {
    const sp = new URLSearchParams(searchParams);
    const spQ = sp.get('q') ?? '';
    const spStart = sp.get('start') ?? '';
    const spEnd = sp.get('end') ?? '';
    const spType = (sp.get('type') as Applied['type'] | null) ?? 'all';
    const spPage = Math.max(1, Number(sp.get('page') || '1') || 1);
    s.setQ(spQ);
    s.setDateStart(spStart);
    s.setDateEnd(spEnd);
    s.setTypeFilter(spType);
    s.setApplied({ q: spQ, dateStart: spStart || undefined, dateEnd: spEnd || undefined, type: spType });
    s.setPage(spPage);
  }, [searchParams]);

  const writeFromState = useCallback((applied: Applied, currentPage: number) => {
    const sp = new URLSearchParams(searchParams);
    if (applied.q) sp.set('q', applied.q); else sp.delete('q');
    if (applied.dateStart) sp.set('start', applied.dateStart); else sp.delete('start');
    if (applied.dateEnd) sp.set('end', applied.dateEnd); else sp.delete('end');
    sp.set('type', applied.type);
    sp.set('page', String(currentPage));
    setSearchParams(sp, { replace: true });
  }, [searchParams, setSearchParams]);

  return { searchParams, initFromSearchParams, writeFromState };
}
