import React, { CSSProperties, ReactNode, useMemo, useRef } from 'react';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

export type VirtualListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  itemKey: (item: T, index: number) => string | number;
  /** Estimated row height in pixels (used before measuring). */
  estimateSize?: number;
  /** Container height in pixels. Default: 600 */
  height?: number;
  /** Extra items to render above/below the viewport */
  overscan?: number;
  /** Optional className for the scroll container */
  className?: string;
  /** Optional style for the scroll container */
  style?: CSSProperties;
  /** Use window scroll instead of an inner scroll container */
  useWindow?: boolean;
};

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    renderItem,
    itemKey,
    estimateSize = 100,
    height = 600,
    overscan = 6,
    className,
    style,
    useWindow = false,
  } = props;

  const parentRef = useRef<HTMLDivElement | null>(null);

  // OBS: Removido ajuste de scrollMargin que causava espaço extra antes do primeiro item
  // quando a lista estava em modo janela. O virtualizer lida bem sem esse offset.

  // Instancia ambos os virtualizers e decide qual usar sem violar as regras de hooks
  const windowVirtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => String(itemKey(items[index], index)),
    // Medição dinâmica por item
    measureElement: (el) => el.getBoundingClientRect().height,
    // Removido scrollMargin para evitar espaço extra no topo
    scrollMargin: 0,
  });

  const containerVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => String(itemKey(items[index], index)),
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const rowVirtualizer = useWindow ? windowVirtualizer : containerVirtualizer;

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  const containerStyle = useMemo<CSSProperties>(() => {
    if (useWindow) {
      // Sem contêiner com scroll; apenas um wrapper leve
      return { position: 'relative', ...style };
    }
    return {
      height,
      overflow: 'auto',
      position: 'relative',
      ...style,
    };
  }, [height, style, useWindow]);

  return (
    <div 
      ref={(el) => { 
        if (!useWindow) parentRef.current = el; 
      }} 
      style={containerStyle} 
      className={cn(className, 'virtual-list-container')}
    >
      <div 
        style={{ 
          height: totalSize, 
          position: 'relative', 
          width: '100%',
          // Garante que não haja margens ou paddings indesejados
          margin: 0,
          padding: 0
        }}
      >
        {virtualItems.map((virtualRow) => {
          const index = virtualRow.index;
          const item = items[index];
          // Use a chave gerada pelo virtualizer para evitar reciclagem incorreta dos nós
          const key = virtualRow.key;
          const rowOuterStyle: CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translate3d(0, ${virtualRow.start}px, 0)`,
            contain: 'content',
            willChange: 'transform',
            // Remove margens e paddings indesejados
            margin: 0,
            padding: 0,
            // Permitir que o conteúdo defina a altura real da linha
            overflow: 'visible'
          };
          return (
            <div
              key={key}
              style={rowOuterStyle}
              ref={rowVirtualizer.measureElement}
              data-index={index}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
