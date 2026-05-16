'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { cn, ui } from '@/lib/ui/styles';

export const DataTableShell = ({
  children,
  minWidth = 1120,
  totalItems = 0,
  page = 1,
  pageSize = 25,
  pageSizeOptions = [25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className = ''
}) => {
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const contentRef = useRef(null);
  const syncingRef = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(minWidth);

  useEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return undefined;
    }

    const updateWidth = () => {
      setScrollWidth(Math.max(minWidth, content.scrollWidth, content.offsetWidth));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(content);

    return () => observer.disconnect();
  }, [minWidth, children]);

  const syncScroll = (source, target) => {
    if (syncingRef.current || !source.current || !target.current) {
      return;
    }

    syncingRef.current = true;
    target.current.scrollLeft = source.current.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);
  const hasPagination = Boolean(onPageChange && onPageSizeChange);

  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={topScrollRef}
        onScroll={() => syncScroll(topScrollRef, tableScrollRef)}
        className={cn(
          'executive-scroll mb-2 overflow-x-auto rounded-lg border px-1 py-1',
          isLight ? 'border-slate-200 bg-white shadow-sm shadow-slate-200/70' : 'border-white/10 bg-[#0b1019] shadow-lg shadow-black/20'
        )}
        aria-label="Horizontal table scroll"
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>

      <div
        ref={tableScrollRef}
        onScroll={() => syncScroll(tableScrollRef, topScrollRef)}
        className={cn(
          'executive-scroll overflow-x-auto overflow-y-hidden overscroll-contain',
          isLight ? 'bg-white' : 'bg-[#0b1019]/20'
        )}
      >
        <div ref={contentRef} style={{ minWidth }}>
          {children}
        </div>
      </div>

      {hasPagination ? (
        <div className={cn(
          'flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-white/10 bg-[#0b1019] text-slate-400'
        )}
        >
          <p className="text-sm">
            {totalItems === 0 ? 'No results' : `${start}-${end} of ${totalItems}`}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className={ui.input(isLight)}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} / page
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className={ui.button(isLight, 'secondary')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <span className={cn('rounded-lg border px-3 py-2 text-sm font-semibold', ui.surface(isLight, 'subtle'))}>
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className={ui.button(isLight, 'secondary')}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
