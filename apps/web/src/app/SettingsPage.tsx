import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  BrandPreview,
  ColorField,
  LogoUploader,
  PageHeader,
  ThemePresetPicker,
} from '../components/ui';
import { apiGet, apiPatch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useEntitlements } from '../lib/features';
import { statusTone } from './PlatformOverviewPage';

type TenantStatus = {
  id: string;
  slug: string;
  name: string;
  status: string;
  schemaVersion: string;
  domains: string[];
  database: {
    name: string;
    host: string;
    port: number;
    connected: boolean;
  } | null;
  companySettings: {
    name: string;
    timezone: string;
    fiscalYearStartMonth: number;
    logoUrl: string | null;
    brandPrimary: string;
    brandSecondary: string;
    themeMode: 'dark' | 'light';
  } | null;
};

export function SettingsPage() {
  const { session } = useAuth();
  const entitlements = useEntitlements();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    timezone: 'Asia/Karachi',
    fiscalYearStartMonth: 7,
    logoUrl: '',
    brandPrimary: '#1ecf8a',
    brandSecondary: '#149a66',
    themeMode: 'dark' as 'dark' | 'light',
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const status = useQuery({
    queryKey: ['tenant-status'],
    queryFn: () =>
      apiGet<TenantStatus>('/platform/tenants/current/status', session?.accessToken),
    enabled: !!session,
  });

  useEffect(() => {
    const c = status.data?.companySettings;
    if (!c) return;
    setForm({
      name: c.name,
      timezone: c.timezone,
      fiscalYearStartMonth: c.fiscalYearStartMonth,
      logoUrl: c.logoUrl ?? '',
      brandPrimary: c.brandPrimary,
      brandSecondary: c.brandSecondary,
      themeMode: c.themeMode,
    });
  }, [status.data]);

  const save = useMutation({
    mutationFn: () =>
      apiPatch(
        '/platform/tenants/current/company',
        { ...form, logoUrl: form.logoUrl || null },
        session?.accessToken,
      ),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['tenant-status'] });
      // Re-fetch branding so the whole shell re-themes immediately.
      queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError((err as Error).message),
  });

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-[var(--erp-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Company settings"
        description="Branding applies to every user in your company. Each person can still pick light, dark or system from their profile menu."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form
          className="erp-panel space-y-5 p-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-semibold">Branding & theme</h2>

          <label className="block">
            <span className="erp-label">Company name</span>
            <input
              className="erp-input"
              value={form.name}
              required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <LogoUploader
            value={form.logoUrl}
            name={form.name}
            onChange={(logoUrl) => setForm({ ...form, logoUrl })}
          />

          <ThemePresetPicker
            primary={form.brandPrimary}
            onPick={(brandPrimary, brandSecondary) =>
              setForm({ ...form, brandPrimary, brandSecondary })
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              label="Primary"
              value={form.brandPrimary}
              onChange={(brandPrimary) => setForm({ ...form, brandPrimary })}
            />
            <ColorField
              label="Secondary"
              value={form.brandSecondary}
              onChange={(brandSecondary) => setForm({ ...form, brandSecondary })}
            />
          </div>

          <div>
            <span className="erp-label">Company default appearance</span>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, themeMode: m })}
                  className={`erp-chip capitalize ${form.themeMode === m ? 'erp-chip-active' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="erp-label">Timezone</span>
              <input
                className="erp-input"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </label>
            <label>
              <span className="erp-label">Fiscal year starts (month)</span>
              <input
                className="erp-input"
                type="number"
                min={1}
                max={12}
                value={form.fiscalYearStartMonth}
                onChange={(e) =>
                  setForm({ ...form, fiscalYearStartMonth: Number(e.target.value) })
                }
              />
            </label>
          </div>

          {error && <p className="text-sm text-[var(--erp-danger)]">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" className="erp-btn erp-btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-[var(--erp-success)]">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className="erp-panel p-5">
            <h2 className="mb-3 font-semibold">Live preview</h2>
            <BrandPreview
              name={form.name}
              logoUrl={form.logoUrl}
              primary={form.brandPrimary}
              secondary={form.brandSecondary}
              mode={form.themeMode}
            />
          </div>

          <div className="erp-panel p-5">
            <h2 className="font-semibold">Workspace</h2>
            <dl className="mt-2 divide-y divide-[var(--erp-line)] text-sm">
              {row(
                'Status',
                <Badge tone={statusTone(status.data?.status ?? 'active')}>
                  {status.data?.status ?? '…'}
                </Badge>,
              )}
              {row('Slug', status.data?.slug)}
              {row('Domain', status.data?.domains?.[0])}
              {row('Database', status.data?.database?.name)}
            </dl>
          </div>

          <div className="erp-panel p-5">
            <h2 className="font-semibold">Subscription & features</h2>
            <dl className="mt-2 divide-y divide-[var(--erp-line)] text-sm">
              {row('Plan', entitlements.data?.planSlug ?? '—')}
              {row(
                'Subscription',
                entitlements.data?.subscriptionStatus ?? '—',
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(entitlements.data?.enabledFeatures ?? []).map((f) => (
                <span key={f} className="erp-badge erp-badge-accent">
                  {f}
                </span>
              ))}
              {!entitlements.data?.enabledFeatures?.length && (
                <p className="text-sm text-[var(--erp-muted)]">
                  No features enabled yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
