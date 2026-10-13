import { CornerDownLeft, LogOut, Moon, Search, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavItem } from '../layouts/navigation';

type Command = {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  navItems,
  mode,
  onToggleMode,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  mode: 'dark' | 'light';
  onToggleMode: () => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...navItems.map((item) => ({
        id: item.to,
        label: item.label,
        group: 'Go to',
        icon: item.icon,
        run: () => navigate(item.to),
      })),
      {
        id: 'theme',
        label: mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        group: 'Actions',
        icon: mode === 'dark' ? Sun : Moon,
        run: onToggleMode,
      },
      { id: 'logout', label: 'Sign out', group: 'Actions', icon: LogOut, run: onLogout },
    ],
    [navItems, mode, navigate, onToggleMode, onLogout],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  function run(cmd?: Command) {
    if (!cmd) return;
    onClose();
    cmd.run();
  }

  return (
    <div className="erp-backdrop flex items-start justify-center px-4 pt-[14vh]" onMouseDown={onClose}>
      <div
        className="erp-popover w-full max-w-lg overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndex((i) => Math.min(filtered.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter') run(filtered[index]);
        }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--erp-line)] px-4 py-3">
          <Search size={16} className="text-[var(--erp-muted)]" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--erp-muted)]"
          />
          <span className="erp-kbd">Esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--erp-muted)]">
              No results for “{query}”
            </p>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const showGroup = i === 0 || filtered[i - 1].group !== cmd.group;
            return (
              <div key={cmd.id}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
                    {cmd.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(cmd)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                    i === index
                      ? 'bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]'
                      : 'text-[var(--erp-text)]'
                  }`}
                >
                  <Icon size={15} />
                  <span className="flex-1">{cmd.label}</span>
                  {i === index && <CornerDownLeft size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
