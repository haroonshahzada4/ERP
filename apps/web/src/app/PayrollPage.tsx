import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { Badge, PageHeader, StatCard } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type RosterRow = {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  email: string;
  compensation: {
    id: number;
    baseCents: number;
    currency: string;
    effectiveFrom: string;
  } | null;
};

type PayrollRun = {
  id: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalCents: number;
  calculationVersion?: string;
  finalizedAt?: string | null;
};

type RunDetail = PayrollRun & {
  items: Array<{
    id: number;
    employeeId: number;
    employeeCode?: string;
    fullName?: string | null;
    baseCents: number;
    allowanceCents: number;
    deductionCents: number;
    taxCents: number;
    netCents: number;
    daysPresent: number;
    daysExpected: number;
  }>;
  approvals: Array<{
    step: string;
    decision: string;
    remarks: string | null;
    actorUserId: number;
  }>;
};

type Payslip = {
  id: number;
  employeeId: number;
  payrollRunId: number;
  issuedAt: string;
  snapshot: Record<string, unknown>;
};

type TaxSlab = {
  id: number;
  name: string;
  fromCents: number;
  toCents: number | null;
  rateBps: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusTone(status: string) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  if (status.startsWith('pending')) return 'warning' as const;
  return 'neutral' as const;
}

export function PayrollPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const canGenerate = hasPermission('payroll.generate');
  const canHr = hasPermission('payroll.approve.hr');
  const canCeo = hasPermission('payroll.approve.ceo');

  const [tab, setTab] = useState<
    'roster' | 'runs' | 'payslips' | 'tax'
  >('roster');
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [payslipId, setPayslipId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
  });
  const [compForm, setCompForm] = useState({
    employeeId: '',
    baseCents: '500000',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const roster = useQuery({
    queryKey: ['payroll-roster', session?.tenant?.slug],
    queryFn: () => apiGet<RosterRow[]>('/payroll/roster', token),
    enabled: !!token,
  });

  const runs = useQuery({
    queryKey: ['payroll-runs', session?.tenant?.slug],
    queryFn: () => apiGet<PayrollRun[]>('/payroll/runs', token),
    enabled: !!token,
  });

  const detail = useQuery({
    queryKey: ['payroll-run', selectedId],
    queryFn: () => apiGet<RunDetail>(`/payroll/runs/${selectedId}`, token),
    enabled: !!token && selectedId != null,
  });

  const payslips = useQuery({
    queryKey: ['payslips', session?.tenant?.slug],
    queryFn: () => apiGet<Payslip[]>('/payroll/payslips', token),
    enabled: !!token && tab === 'payslips',
  });

  const payslip = useQuery({
    queryKey: ['payslip', payslipId],
    queryFn: () => apiGet<Payslip>(`/payroll/payslips/${payslipId}`, token),
    enabled: !!token && payslipId != null,
  });

  const taxSlabs = useQuery({
    queryKey: ['tax-slabs', session?.tenant?.slug],
    queryFn: () => apiGet<TaxSlab[]>('/payroll/tax-slabs', token),
    enabled: !!token && tab === 'tax',
  });

  const saveComp = useMutation({
    mutationFn: () =>
      apiPost(
        '/payroll/compensations',
        {
          employeeId: Number(compForm.employeeId),
          baseCents: Number(compForm.baseCents),
          effectiveFrom: compForm.effectiveFrom,
        },
        token,
      ),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['payroll-roster'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiPost<RunDetail>(
        '/payroll/runs',
        { periodStart, periodEnd },
        token,
      ),
    onSuccess: (data) => {
      setError(null);
      setTab('runs');
      setSelectedId(data.id);
      void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const act = useMutation({
    mutationFn: ({
      id,
      path,
      body,
    }: {
      id: number;
      path: string;
      body?: object;
    }) => apiPost(`/payroll/runs/${id}/${path}`, body ?? {}, token),
    onSuccess: () => {
      setRemarks('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      void qc.invalidateQueries({ queryKey: ['payroll-run', selectedId] });
      void qc.invalidateQueries({ queryKey: ['payslips'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const approvedTotal =
    runs.data
      ?.filter((r) => r.status === 'approved')
      .reduce((s, r) => s + r.totalCents, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HRM"
        icon={<Wallet size={13} />}
        title="Payroll"
        description="Compensation, deterministic monthly runs, HR/CEO approval, and payslips."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Employees on roster" value={String(roster.data?.length ?? 0)} />
        <StatCard label="Payroll runs" value={String(runs.data?.length ?? 0)} />
        <StatCard label="Approved net (all)" value={money(approvedTotal)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['roster', 'Salary roster'],
            ['runs', 'Runs & approvals'],
            ['payslips', 'Payslips'],
            ['tax', 'Tax slabs'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`erp-btn erp-btn-sm ${
              tab === key ? 'erp-btn-primary' : 'erp-btn-ghost'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {tab === 'roster' && (
        <div className="space-y-4">
          {canGenerate && (
            <div className="erp-panel flex flex-wrap items-end gap-2 p-4">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--erp-muted)]">Employee</span>
                <select
                  className="erp-input"
                  value={compForm.employeeId}
                  onChange={(e) =>
                    setCompForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {(roster.data ?? []).map((r) => (
                    <option key={r.employeeId} value={r.employeeId}>
                      {r.employeeCode} — {r.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--erp-muted)]">
                  Base (cents)
                </span>
                <input
                  className="erp-input"
                  value={compForm.baseCents}
                  onChange={(e) =>
                    setCompForm((f) => ({ ...f, baseCents: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--erp-muted)]">
                  Effective from
                </span>
                <input
                  type="date"
                  className="erp-input"
                  value={compForm.effectiveFrom}
                  onChange={(e) =>
                    setCompForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                  }
                />
              </label>
              <button
                type="button"
                className="erp-btn erp-btn-primary"
                disabled={!compForm.employeeId || saveComp.isPending}
                onClick={() => saveComp.mutate()}
              >
                Set compensation
              </button>
            </div>
          )}

          <div className="erp-panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[var(--erp-muted)]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Base</th>
                  <th className="px-4 py-3">Effective</th>
                </tr>
              </thead>
              <tbody>
                {(roster.data ?? []).map((r) => (
                  <tr key={r.employeeId} className="border-t border-[var(--erp-border)]">
                    <td className="px-4 py-2 font-mono text-xs">{r.employeeCode}</td>
                    <td className="px-4 py-2">{r.fullName}</td>
                    <td className="px-4 py-2">
                      {r.compensation
                        ? money(r.compensation.baseCents)
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-[var(--erp-muted)]">
                      {r.compensation?.effectiveFrom ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <div className="space-y-4">
          {canGenerate && (
            <div className="erp-panel flex flex-wrap items-end gap-3 p-4">
              <label className="text-sm">
                <span className="mb-1 block text-[var(--erp-muted)]">From</span>
                <input
                  type="date"
                  className="erp-input"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-[var(--erp-muted)]">To</span>
                <input
                  type="date"
                  className="erp-input"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="erp-btn erp-btn-primary"
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
              >
                Generate draft run
              </button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="erp-panel overflow-hidden">
              <div className="border-b border-[var(--erp-border)] px-4 py-3 text-sm font-medium">
                Runs
              </div>
              <ul className="divide-y divide-[var(--erp-border)]">
                {(runs.data ?? []).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--erp-accent-soft)] ${
                        selectedId === r.id ? 'bg-[var(--erp-accent-soft)]' : ''
                      }`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span>
                        {r.periodStart} → {r.periodEnd}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        <span className="text-[var(--erp-muted)]">
                          {money(r.totalCents)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="erp-panel space-y-3 p-4">
              {!detail.data ? (
                <p className="text-sm text-[var(--erp-muted)]">Select a run</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-medium">
                        Run #{detail.data.id}{' '}
                        <Badge tone={statusTone(detail.data.status)}>
                          {detail.data.status}
                        </Badge>
                      </h2>
                      <p className="text-xs text-[var(--erp-muted)]">
                        calc {detail.data.calculationVersion ?? '—'}
                        {detail.data.finalizedAt
                          ? ` · finalized ${new Date(detail.data.finalizedAt).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.data.status === 'draft' && canGenerate && (
                        <>
                          <button
                            type="button"
                            className="erp-btn erp-btn-sm erp-btn-ghost"
                            onClick={() =>
                              act.mutate({
                                id: detail.data!.id,
                                path: 'recalculate',
                              })
                            }
                          >
                            Recalculate
                          </button>
                          <button
                            type="button"
                            className="erp-btn erp-btn-sm erp-btn-primary"
                            onClick={() =>
                              act.mutate({ id: detail.data!.id, path: 'submit' })
                            }
                          >
                            Submit to HR
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {(detail.data.status === 'pending_hr' && canHr) ||
                  (detail.data.status === 'pending_ceo' && canCeo) ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[180px] flex-1 text-sm">
                        <span className="mb-1 block text-[var(--erp-muted)]">
                          Remarks
                        </span>
                        <input
                          className="erp-input w-full"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          placeholder="Optional note"
                        />
                      </label>
                      <button
                        type="button"
                        className="erp-btn erp-btn-sm erp-btn-primary"
                        onClick={() =>
                          act.mutate({
                            id: detail.data!.id,
                            path:
                              detail.data!.status === 'pending_hr'
                                ? 'hr-decide'
                                : 'ceo-decide',
                            body: { approve: true, remarks },
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="erp-btn erp-btn-sm erp-btn-danger"
                        onClick={() =>
                          act.mutate({
                            id: detail.data!.id,
                            path:
                              detail.data!.status === 'pending_hr'
                                ? 'hr-decide'
                                : 'ceo-decide',
                            body: { approve: false, remarks },
                          })
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}

                  {!!detail.data.approvals?.length && (
                    <ul className="text-xs text-[var(--erp-muted)]">
                      {detail.data.approvals.map((a, i) => (
                        <li key={i}>
                          {a.step}: {a.decision}
                          {a.remarks ? ` — ${a.remarks}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}

                  <table className="w-full text-left text-sm">
                    <thead className="text-[var(--erp-muted)]">
                      <tr>
                        <th className="py-1">Employee</th>
                        <th className="py-1">Days</th>
                        <th className="py-1">Base</th>
                        <th className="py-1">Tax</th>
                        <th className="py-1">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.items.map((i) => (
                        <tr
                          key={i.id}
                          className="border-t border-[var(--erp-border)]"
                        >
                          <td className="py-1.5">
                            {i.fullName ?? `#${i.employeeId}`}
                          </td>
                          <td>
                            {i.daysPresent}/{i.daysExpected}
                          </td>
                          <td>{money(i.baseCents)}</td>
                          <td>{money(i.taxCents)}</td>
                          <td>{money(i.netCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'payslips' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="erp-panel overflow-hidden">
            <div className="border-b border-[var(--erp-border)] px-4 py-3 text-sm font-medium">
              Issued payslips
            </div>
            <ul className="divide-y divide-[var(--erp-border)]">
              {(payslips.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-[var(--erp-accent-soft)]"
                    onClick={() => setPayslipId(p.id)}
                  >
                    <span>
                      Run #{p.payrollRunId} · Emp #{p.employeeId}
                    </span>
                    <span className="text-[var(--erp-muted)]">
                      {new Date(p.issuedAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
              {!payslips.isLoading && !(payslips.data ?? []).length && (
                <li className="px-4 py-8 text-center text-sm text-[var(--erp-muted)]">
                  No payslips yet — approve a run to issue them.
                </li>
              )}
            </ul>
          </div>
          <div className="erp-panel p-4 text-sm">
            {!payslip.data ? (
              <p className="text-[var(--erp-muted)]">Select a payslip</p>
            ) : (
              <pre className="overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(payslip.data.snapshot, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === 'tax' && (
        <div className="erp-panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--erp-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {(taxSlabs.data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-[var(--erp-border)]">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">{money(s.fromCents)}</td>
                  <td className="px-4 py-2">
                    {s.toCents == null ? '∞' : money(s.toCents)}
                  </td>
                  <td className="px-4 py-2">{(s.rateBps / 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
