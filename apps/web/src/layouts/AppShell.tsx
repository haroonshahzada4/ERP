import {
  ArrowLeftRight,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Command,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from '../components/CommandPalette';
import { CompanyAvatar } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useTenantBranding } from '../lib/branding';
import { hasFeature, useEntitlements } from '../lib/features';
import { useTheme, type ModePreference } from '../lib/theme';
import {
  pageTitle,
  platformNav,
  workspaceNav,
  type NavItem,
  type NavSection,
} from './navigation';

const COLLAPSE_KEY = 'erp.sidebarCollapsed';

function initials(name?: string) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function SidebarNav({
  sections,
  collapsed,
  onNavigate,
}: {
  sections: NavSection[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {sections.map((section) => (
        <div key={section.title} className="mt-5 first:mt-2">
          {!collapsed && (
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--erp-muted)]">
              {section.title}
            </p>
          )}
          <div className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/' || item.to === '/platform'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `erp-nav-item ${isActive ? 'erp-nav-item-active' : ''} ${
                      collapsed ? 'justify-center' : ''
                    }`
                  }
                >
                  <Icon size={17} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

const modeOptions: { value: ModePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { session } = useAuth();
  const { preference, setPreference, mode, branding } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const role = session?.isPlatformAdmin
    ? 'Super Admin'
    : (session?.roles[0] ?? 'Member').replace(/_/g, ' ');
  const effective: ModePreference = preference ?? (branding.themeMode ?? mode);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-[var(--erp-line)] py-1 pl-1 pr-3 transition hover:border-[var(--erp-accent)]"
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold"
          style={{ background: 'var(--erp-grad-accent)', color: 'var(--erp-on-accent)' }}
        >
          {initials(session?.user.fullName)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-semibold">{session?.user.fullName}</span>
          <span className="block text-[10px] capitalize text-[var(--erp-muted)]">{role}</span>
        </span>
      </button>

      {open && (
        <div className="erp-popover absolute right-0 top-12 z-40 w-64 p-2">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold">{session?.user.fullName}</p>
            <p className="truncate text-xs text-[var(--erp-muted)]">{session?.user.email}</p>
            <p className="mt-1 text-[11px] capitalize text-[var(--erp-accent)]">{role}</p>
          </div>
          <div className="my-1 border-t border-[var(--erp-line)]" />
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
            Appearance
          </p>
          {modeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = preference ? preference === opt.value : effective === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPreference(opt.value)}
                className="erp-hover flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
              >
                <Icon size={15} className="text-[var(--erp-muted)]" />
                <span className="flex-1 text-left">{opt.label}</span>
                {selected && <Check size={14} className="text-[var(--erp-accent)]" />}
              </button>
            );
          })}
          <div className="my-1 border-t border-[var(--erp-line)]" />
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--erp-danger)] hover:bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)]"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { session, logout, hasPermission } = useAuth();
  const { mode, toggleMode, branding, setScope } = useTheme();
  const location = useLocation();
  const isPlatformRoute = location.pathname.startsWith('/platform');
  const platformAdmin = !!session?.isPlatformAdmin;
  const platformMode = isPlatformRoute && platformAdmin;

  useTenantBranding();
  const entitlements = useEntitlements();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    setScope(platformMode ? 'platform' : 'tenant');
    return () => setScope('tenant');
  }, [platformMode, setScope]);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filterItems = useCallback(
    (items: NavItem[]) =>
      items.filter((i) => {
        if (i.permission && !hasPermission(i.permission)) return false;
        if (!platformMode && i.feature && !hasFeature(entitlements.data, i.feature)) {
          return false;
        }
        return true;
      }),
    [hasPermission, entitlements.data, platformMode],
  );

  const sections = useMemo<NavSection[]>(() => {
    const source = platformMode ? platformNav : workspaceNav;
    return source
      .map((s) => ({ ...s, items: filterItems(s.items) }))
      .filter((s) => s.items.length);
  }, [platformMode, filterItems]);

  const paletteItems = useMemo(
    () => [
      ...sections.flatMap((s) => s.items),
      ...(platformAdmin && !platformMode ? platformNav.flatMap((s) => s.items) : []),
    ],
    [sections, platformAdmin, platformMode],
  );

  const companyName = platformMode
    ? 'Platform Console'
    : branding.name || session?.tenant?.name || 'ERP SaaS';

  const handleLogout = useCallback(() => logout(), [logout]);

  const sidebar = (isDrawer: boolean) => {
    const slim = collapsed && !isDrawer;
    return (
      <div className="flex h-full flex-col">
        <div className={`flex items-center gap-3 px-4 py-4 ${slim ? 'justify-center' : ''}`}>
          {platformMode ? (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: 'var(--erp-grad-accent)', color: 'var(--erp-on-accent)' }}
            >
              <ShieldCheck size={20} />
            </span>
          ) : (
            <CompanyAvatar name={companyName} logoUrl={branding.logoUrl} />
          )}
          {!slim && (
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">{companyName}</p>
              <p className="truncate text-xs text-[var(--erp-muted)]">
                {platformMode
                  ? 'Super Admin'
                  : `${session?.tenant?.slug ?? 'company'}.localhost`}
              </p>
            </div>
          )}
        </div>

        {platformAdmin && (
          <div className="px-3">
            <Link
              to={platformMode ? '/' : '/platform'}
              className={`erp-btn erp-btn-ghost w-full !text-xs ${slim ? '!px-0' : ''}`}
              title={platformMode ? 'Back to workspace' : 'Platform console'}
            >
              {platformMode ? <ArrowLeftRight size={14} /> : <ShieldCheck size={14} />}
              {!slim && (platformMode ? 'Back to workspace' : 'Platform console')}
            </Link>
          </div>
        )}

        <SidebarNav
          sections={sections}
          collapsed={slim}
          onNavigate={() => setDrawer(false)}
        />

        {!isDrawer && (
          <div className="border-t border-[var(--erp-line)] p-3">
            <button
              type="button"
              onClick={() => {
                const next = !collapsed;
                setCollapsed(next);
                localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
              }}
              className="erp-nav-item w-full"
            >
              {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </div>
    );
  };

  const title = pageTitle(location.pathname);

  return (
    <div className="min-h-screen text-[var(--erp-text)]">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--erp-line)] bg-[var(--erp-panel)] transition-[width] duration-200 lg:block ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {sidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="erp-backdrop lg:hidden" onMouseDown={() => setDrawer(false)}>
          <aside
            className="absolute inset-y-0 left-0 w-[280px] border-r border-[var(--erp-line)] bg-[var(--erp-panel)]"
            style={{ animation: 'erp-slide-left 0.2s ease' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="erp-icon-btn absolute right-3 top-3"
              onClick={() => setDrawer(false)}
            >
              <X size={16} />
            </button>
            {sidebar(true)}
          </aside>
        </div>
      )}

      <div
        className={`min-w-0 transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'
        }`}
      >
        {platformMode && (
          <div
            className="px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide"
            style={{ background: 'var(--erp-grad-accent)', color: 'var(--erp-on-accent)' }}
          >
            PLATFORM CONSOLE · changes here affect every company
          </div>
        )}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--erp-line)] bg-[color-mix(in_srgb,var(--erp-bg)_82%,transparent)] px-4 py-3 backdrop-blur md:px-6">
          <button
            type="button"
            className="erp-icon-btn lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>

          <h2 className="hidden min-w-0 truncate text-sm font-semibold sm:block">{title}</h2>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="ml-auto flex min-w-[40px] items-center gap-2 rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel)] px-3 py-2 text-sm text-[var(--erp-muted)] transition hover:border-[var(--erp-accent)] md:w-72 md:justify-start"
          >
            <Search size={15} />
            <span className="hidden flex-1 text-left md:block">Search or jump to…</span>
            <span className="erp-kbd hidden items-center gap-0.5 md:inline-flex">
              <Command size={10} />K
            </span>
          </button>

          <button
            type="button"
            className="erp-icon-btn"
            onClick={toggleMode}
            title={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <UserMenu onLogout={handleLogout} />
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        navItems={paletteItems}
        mode={mode}
        onToggleMode={toggleMode}
        onLogout={handleLogout}
      />
    </div>
  );
}
