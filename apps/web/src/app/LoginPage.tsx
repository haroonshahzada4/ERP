import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CompanyAvatar } from '../components/ui';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { resolveTenantHost } from '../lib/tenantHost';
import { useTheme } from '../lib/theme';
import { TenantUnavailablePage } from './TenantUnavailablePage';

type TenantBranding = {
  slug: string;
  name: string;
  logoUrl: string | null;
  brandPrimary: string;
  brandSecondary: string;
  themeMode: 'dark' | 'light';
};

export function LoginPage() {
  const host = resolveTenantHost();
  const { session, login, loading } = useAuth();
  const { setBranding } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const branding = useQuery({
    queryKey: ['login-branding', host],
    queryFn: () =>
      apiGet<TenantBranding>('/platform/tenants/current/branding', null, host),
    enabled: !!host,
    retry: false,
  });

  useEffect(() => {
    if (!branding.data) return;
    setBranding({
      name: branding.data.name,
      logoUrl: branding.data.logoUrl,
      brandPrimary: branding.data.brandPrimary,
      brandSecondary: branding.data.brandSecondary,
      themeMode: branding.data.themeMode,
    });
  }, [branding.data, setBranding]);

  if (!host) {
    return <TenantUnavailablePage reason="apex" />;
  }

  if (branding.isError) {
    const msg = (branding.error as Error)?.message?.toLowerCase() ?? '';
    const inactive = msg.includes('inactive') || msg.includes('suspended');
    return (
      <TenantUnavailablePage
        host={host}
        reason={inactive ? 'inactive' : 'unknown'}
      />
    );
  }

  if (!loading && session) {
    return (
      <Navigate to={session.isPlatformAdmin ? '/platform' : '/'} replace />
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (branding.isLoading || !branding.data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--erp-muted)]">
        Loading workspace…
      </div>
    );
  }

  const name = branding.data.name;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section
        className="relative hidden overflow-hidden border-r border-[var(--erp-line)] p-12 lg:flex lg:flex-col lg:justify-between"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 0% 0%, var(--erp-accent-glow), transparent 60%), radial-gradient(ellipse 70% 60% at 100% 100%, var(--erp-accent-soft), transparent 60%), var(--erp-panel)',
        }}
      >
        <div className="flex items-center gap-3">
          <CompanyAvatar name={name} logoUrl={branding.data.logoUrl} size={48} radius={14} />
          <div>
            <p className="text-lg font-semibold">{name}</p>
            <p className="text-sm text-[var(--erp-muted)]">{host}</p>
          </div>
        </div>

        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Sign in to {name}
          </h1>
          <p className="mt-4 max-w-md text-[var(--erp-muted)]">
            Access is limited to members of this company workspace.
          </p>
        </div>

        <p className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
          <ShieldCheck size={14} className="text-[var(--erp-accent)]" />
          Tenant-isolated · Role-based access · Audited sessions
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={onSubmit} className="erp-panel w-full max-w-md space-y-5 p-8">
          <div className="flex items-center gap-3 lg:hidden">
            <CompanyAvatar name={name} logoUrl={branding.data.logoUrl} size={40} />
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-xs text-[var(--erp-muted)]">{host}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--erp-accent)]">
              Welcome back
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Sign in</h2>
          </div>

          <label className="block">
            <span className="erp-label">Email</span>
            <input
              className="erp-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="erp-label">Password</span>
            <div className="relative">
              <input
                className="erp-input !pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--erp-muted)] hover:text-[var(--erp-accent)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          {error && (
            <p className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="erp-btn erp-btn-primary w-full !py-3"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-[var(--erp-muted)]">
            Platform operators use{' '}
            <Link to="/platform/login" className="text-[var(--erp-accent)] hover:underline">
              Super Admin login
            </Link>
            .
          </p>
        </form>
      </section>
    </div>
  );
}
