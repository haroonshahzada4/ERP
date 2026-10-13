import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { PLATFORM_THEME } from '../lib/themePresets';

export function PlatformLoginPage() {
  const { session, platformLogin, loading } = useAuth();
  const { setBranding, setScope } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setScope('platform');
    setBranding({
      name: 'Platform Console',
      brandPrimary: PLATFORM_THEME.primary,
      brandSecondary: PLATFORM_THEME.secondary,
      themeMode: 'dark',
    });
    return () => setScope('tenant');
  }, [setBranding, setScope]);

  if (!loading && session?.isPlatformAdmin) {
    return <Navigate to="/platform" replace />;
  }
  if (!loading && session && !session.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await platformLogin(email, password);
      navigate('/platform');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <form onSubmit={onSubmit} className="erp-panel w-full max-w-md space-y-5 p-8">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl"
            style={{ background: 'var(--erp-grad-accent)', color: 'var(--erp-on-accent)' }}
          >
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--erp-accent)]">
              Platform
            </p>
            <h1 className="text-xl font-semibold">Super Admin sign in</h1>
          </div>
        </div>

        <p className="text-sm text-[var(--erp-muted)]">
          This console manages every company on the platform. Company users must
          sign in on their own subdomain.
        </p>

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
          {submitting ? 'Signing in…' : 'Sign in to platform'}
        </button>
      </form>
    </div>
  );
}
