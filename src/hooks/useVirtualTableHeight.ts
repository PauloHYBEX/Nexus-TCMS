import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

interface Options {
  containerRef: RefObject<HTMLElement | null>;
  listHeaderRef: RefObject<HTMLElement | null>;
  listCardRef: RefObject<HTMLElement | null>;
  paginationRef: RefObject<HTMLElement | null>;
  rowSize: number;
  pageSize: number;
  totalItems: number;
  currentPage: number;
  minHeight?: number;
}

export function useVirtualTableHeight(opts: Options) {
  const {
    containerRef,
    listHeaderRef,
    listCardRef,
    paginationRef,
    rowSize,
    pageSize,
    totalItems,
    currentPage,
    minHeight = 240,
  } = opts;

  const [listHeight, setListHeight] = useState<number>(minHeight);

  useLayoutEffect(() => {
    const recalc = () => {
      const container = containerRef.current?.getBoundingClientRect();
      const headerBottom = listHeaderRef.current?.getBoundingClientRect().bottom
        ?? listCardRef.current?.getBoundingClientRect().top
        ?? 0;
      const paginationH = (paginationRef.current?.getBoundingClientRect().height ?? 56) + 8;
      const safety = 88;
      const hContainer = container && headerBottom
        ? (container.bottom - headerBottom - paginationH - safety)
        : Infinity;
      const vh = (window.visualViewport?.height ?? window.innerHeight) || 800;
      const padding = 20;
      const containerBottomPad = 24;
      const hViewport = vh - headerBottom - paginationH - containerBottomPad - safety - padding;
      const hAvailable = Math.min(hContainer, hViewport);
      const start = (currentPage - 1) * pageSize;
      const visible = Math.max(1, Math.min(pageSize, Math.max(0, totalItems - start)));
      const rowsTotal = Math.ceil(rowSize * visible);
      const antiBreak = 12;
      const h = Math.max(minHeight, Math.min(Math.max(0, hAvailable - antiBreak), rowsTotal));
      setListHeight(h);
    };
    recalc();
    const raf = requestAnimationFrame(recalc);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('resize', recalc);
      cancelAnimationFrame(raf);
    };
  }, [containerRef, listHeaderRef, listCardRef, paginationRef, rowSize, pageSize, totalItems, currentPage, minHeight]);

  useEffect(() => {
    const compute = () => {
      const container = containerRef.current?.getBoundingClientRect();
      const headerBottom = listHeaderRef.current?.getBoundingClientRect().bottom
        ?? listCardRef.current?.getBoundingClientRect().top
        ?? 0;
      const paginationH = (paginationRef.current?.getBoundingClientRect().height ?? 56) + 8;
      const safety = 72;
      const padding = 20;
      const containerBottomPad = 24;
      const hContainer = container && headerBottom
        ? (container.bottom - headerBottom - paginationH - safety)
        : Infinity;
      const hViewport = (((window.visualViewport?.height ?? window.innerHeight) || 800) - headerBottom - paginationH - containerBottomPad - safety - padding);
      const hAvailable = Math.min(hContainer, hViewport);
      const start = (currentPage - 1) * pageSize;
      const visible = Math.max(1, Math.min(pageSize, Math.max(0, totalItems - start)));
      const rowsTotal = Math.ceil(rowSize * visible);
      const h = Math.max(minHeight, Math.min(hAvailable, rowsTotal));
      setListHeight(h);
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    if (containerRef.current) ro.observe(containerRef.current);
    if (paginationRef.current) ro.observe(paginationRef.current);
    return () => ro.disconnect();
  }, [containerRef, listHeaderRef, listCardRef, paginationRef, rowSize, pageSize, totalItems, currentPage, minHeight]);

  return { listHeight };
}
