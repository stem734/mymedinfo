import { useState, useCallback } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortState = { col: string; dir: SortDir };

export function useTableSort(defaultCol: string, defaultDir: SortDir = 'asc') {
  const [sort, setSort] = useState<SortState>({ col: defaultCol, dir: defaultDir });

  const toggle = useCallback((col: string) => {
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' },
    );
  }, []);

  const indicator = (col: string) => (sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');

  function sortRows<T extends Record<string, unknown>>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      const va = String(a[sort.col] ?? '').toLowerCase();
      const vb = String(b[sort.col] ?? '').toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }

  const thProps = (col: string): React.ThHTMLAttributes<HTMLTableCellElement> => ({
    onClick: () => toggle(col),
    style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' },
  });

  return { sort, toggle, indicator, sortRows, thProps };
}
