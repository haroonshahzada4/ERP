import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type Job = {
  id: number;
  title: string;
  status: string;
  description: string | null;
};

type Application = {
  id: number;
  jobId: number;
  candidateName: string;
  candidateEmail: string;
  status: string;
};

export function RecruitmentPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');

  const jobs = useQuery({
    queryKey: ['jobs', session?.tenant?.slug],
    queryFn: () => apiGet<Job[]>('/recruitment/jobs', token),
    enabled: !!token,
  });

  const apps = useQuery({
    queryKey: ['applications', selectedJob, session?.tenant?.slug],
    queryFn: () =>
      apiGet<Application[]>(
        selectedJob
          ? `/recruitment/applications?jobId=${selectedJob}`
          : '/recruitment/applications',
        token,
      ),
    enabled: !!token,
  });

  const createJob = useMutation({
    mutationFn: () =>
      apiPost<Job>(
        '/recruitment/jobs',
        { title, status: 'open' },
        token,
      ),
    onSuccess: () => {
      setTitle('');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const createApp = useMutation({
    mutationFn: () =>
      apiPost(
        '/recruitment/applications',
        {
          jobId: selectedJob,
          candidateName,
          candidateEmail,
        },
        token,
      ),
    onSuccess: () => {
      setCandidateName('');
      setCandidateEmail('');
      void qc.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPatch(`/recruitment/applications/${id}/status`, { status }, token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['applications'] }),
  });

  const canWrite = hasPermission('recruitment.write');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recruitment</h1>
        <p className="text-sm text-[var(--erp-muted)]">
          Open roles and candidate applications.
        </p>
      </div>

      {canWrite && (
        <div className="erp-panel flex flex-wrap gap-2 p-4">
          <input
            className="erp-input min-w-[200px] flex-1"
            placeholder="Job title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            disabled={!title.trim() || createJob.isPending}
            onClick={() => createJob.mutate()}
          >
            Post job
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="erp-panel overflow-hidden">
          <div className="border-b border-[var(--erp-border)] px-4 py-3 text-sm font-medium">
            Jobs
          </div>
          <ul className="divide-y divide-[var(--erp-border)]">
            {(jobs.data ?? []).map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  className={`flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-[var(--erp-accent-soft)] ${
                    selectedJob === j.id ? 'bg-[var(--erp-accent-soft)]' : ''
                  }`}
                  onClick={() => setSelectedJob(j.id)}
                >
                  <span>{j.title}</span>
                  <span className="text-[var(--erp-muted)]">{j.status}</span>
                </button>
              </li>
            ))}
            {!jobs.isLoading && !(jobs.data ?? []).length && (
              <li className="px-4 py-8 text-center text-sm text-[var(--erp-muted)]">
                No jobs yet
              </li>
            )}
          </ul>
        </div>

        <div className="erp-panel space-y-3 p-4">
          <h2 className="text-sm font-medium">Applications</h2>
          {canWrite && selectedJob && (
            <div className="flex flex-wrap gap-2">
              <input
                className="erp-input"
                placeholder="Candidate name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
              <input
                className="erp-input"
                placeholder="Email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
              />
              <button
                type="button"
                className="erp-btn erp-btn-primary erp-btn-sm"
                disabled={!candidateName || !candidateEmail || createApp.isPending}
                onClick={() => createApp.mutate()}
              >
                Add
              </button>
            </div>
          )}
          <ul className="divide-y divide-[var(--erp-border)]">
            {(apps.data ?? []).map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{a.candidateName}</div>
                  <div className="text-[var(--erp-muted)]">{a.candidateEmail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--erp-muted)]">{a.status}</span>
                  {canWrite && a.status !== 'hired' && (
                    <button
                      type="button"
                      className="erp-btn erp-btn-ghost erp-btn-sm"
                      onClick={() =>
                        setStatus.mutate({ id: a.id, status: 'interview' })
                      }
                    >
                      Interview
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
