type PlaceholderPageProps = {
  title: string;
  description: string;
  phase: string;
};

export function PlaceholderPage({ title, description, phase }: PlaceholderPageProps) {
  return (
    <section className="max-w-2xl rounded-3xl border border-[var(--erp-line)] bg-[var(--erp-panel)] p-8">
      <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--erp-accent)]">
        {phase}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-[var(--erp-muted)]">{description}</p>
    </section>
  );
}
