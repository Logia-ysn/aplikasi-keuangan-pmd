import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const SearchableSelect = ({ options, value, onChange, placeholder = '— Pilih —', disabled = false, className = '' }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q));
  }, [options, search]);

  // Group filtered options
  const grouped = useMemo(() => {
    const hasGroups = filtered.some((o) => !!o.group);
    if (!hasGroups) return [{ group: '', items: filtered }];
    const map = new Map<string, SelectOption[]>();
    for (const o of filtered) {
      const g = o.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatFiltered = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setHighlightIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIdx(-1);
  }, []);

  const select = useCallback((val: string) => {
    onChange(val);
    close();
  }, [onChange, close]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < flatFiltered.length) {
        select(flatFiltered[highlightIdx].value);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      {!isOpen ? (
        <button
          type="button"
          onClick={open}
          disabled={disabled}
          className="w-full flex items-center justify-between border border-gray-200 rounded-lg py-2 px-3 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <span className={selectedOption ? 'text-gray-900 truncate' : 'text-gray-400 truncate'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {value && !disabled && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                className="p-0.5 hover:bg-gray-100 rounded"
              >
                <X size={12} className="text-gray-400" />
              </span>
            )}
            <ChevronDown size={14} className="text-gray-400" />
          </div>
        </button>
      ) : (
        <div className="w-full flex items-center border border-blue-500 ring-2 ring-blue-500 rounded-lg py-2 px-3 bg-white">
          <Search size={14} className="text-gray-400 flex-shrink-0 mr-2" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Ketik untuk mencari..."
            className="w-full text-sm text-gray-900 outline-none bg-transparent"
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {flatFiltered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">Tidak ditemukan</div>
          ) : (
            grouped.map((g) => (
              <div key={g.group}>
                {g.group && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest bg-gray-50 sticky top-0">
                    {g.group}
                  </div>
                )}
                {g.items.map((opt) => {
                  const idx = flatFiltered.indexOf(opt);
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <div
                      key={opt.value}
                      data-idx={idx}
                      onClick={() => select(opt.value)}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-blue-50 text-blue-900' :
                        isSelected ? 'bg-gray-50 text-gray-900 font-medium' :
                        'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
