'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface StockOption {
  symbol: string;
  name: string;
}

interface Props {
  options: StockOption[];
  onSelect: (symbol: string) => void;
  placeholder?: string;
  className?: string;
  /** 初始顯示值（如目前圖表代號）。 */
  initial?: string;
}

const MAX_VISIBLE = 50;

/** 可搜尋的股票下拉選單（打代號或名稱即時過濾 + 可滾動清單）。 */
export function StockCombobox({ options, onSelect, placeholder, className, initial }: Props) {
  const [query, setQuery] = useState(initial ?? '');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? options.filter((o) => o.symbol.includes(q) || o.name.toLowerCase().includes(q))
      : options;
    return matched.slice(0, MAX_VISIBLE);
  }, [options, query]);

  const pick = (o: StockOption) => {
    setQuery(`${o.symbol} ${o.name}`);
    setOpen(false);
    onSelect(o.symbol);
  };

  const submitRaw = () => {
    const m = query.trim().match(/^\d{4,6}/);
    if (m) {
      onSelect(m[0]);
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <input
        className="w-full rounded border px-2 py-1 text-sm"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submitRaw();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filtered.map((o) => (
            <li key={o.symbol}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-blue-50 dark:hover:bg-gray-700"
                onClick={() => pick(o)}
              >
                <span className="shrink-0 font-medium">{o.symbol}</span>
                <span className="min-w-0 truncate text-gray-500">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
