/** Deterministic payroll math — pure functions, integer cents only. */

export const PAYROLL_CALC_VERSION = '1.0.0';

export type TaxSlabInput = {
  fromCents: number;
  toCents: number | null;
  rateBps: number;
};

export type ComponentInput = {
  name: string;
  kind: 'fixed' | 'percent_base';
  amountValue: number;
  isTaxable?: boolean;
  isPreTax?: boolean;
};

export type EmployeeCalcInput = {
  employeeId: number;
  baseCents: number;
  allowances: ComponentInput[];
  deductions: ComponentInput[];
  daysPresent: number;
  daysExpected: number;
  taxSlabs: TaxSlabInput[];
};

export type EmployeeCalcResult = {
  employeeId: number;
  baseCents: number;
  proratedBaseCents: number;
  allowanceCents: number;
  preTaxDeductionCents: number;
  taxableCents: number;
  taxCents: number;
  postTaxDeductionCents: number;
  deductionCents: number;
  netCents: number;
  daysPresent: number;
  daysExpected: number;
  breakdown: Record<string, unknown>;
};

export function resolveComponentCents(
  baseCents: number,
  component: ComponentInput,
): number {
  if (component.kind === 'percent_base') {
    return Math.floor((baseCents * component.amountValue) / 10_000);
  }
  return Math.max(0, component.amountValue);
}

/** Progressive tax over monthly taxable income using ordered slabs. */
export function applyTaxSlabs(
  taxableCents: number,
  slabs: TaxSlabInput[],
): number {
  if (taxableCents <= 0 || slabs.length === 0) return 0;
  const ordered = [...slabs].sort((a, b) => a.fromCents - b.fromCents);
  let tax = 0;
  let remaining = taxableCents;

  for (const slab of ordered) {
    if (remaining <= 0) break;
    if (taxableCents <= slab.fromCents) continue;
    const upper =
      slab.toCents == null ? Number.POSITIVE_INFINITY : slab.toCents;
    const bandStart = slab.fromCents;
    const bandEnd = Math.min(taxableCents, upper);
    const bandWidth = Math.max(0, bandEnd - bandStart);
    if (bandWidth <= 0) continue;
    tax += Math.floor((bandWidth * slab.rateBps) / 10_000);
    remaining = taxableCents - bandEnd;
  }
  return tax;
}

export function countWeekdays(periodStart: string, periodEnd: string): number {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function calculateEmployeePay(
  input: EmployeeCalcInput,
): EmployeeCalcResult {
  const expected = Math.max(0, input.daysExpected);
  const present = Math.min(Math.max(0, input.daysPresent), expected || input.daysPresent);
  const factor =
    expected > 0 ? Math.min(1, present / expected) : 1;
  const proratedBaseCents = Math.floor(input.baseCents * factor);

  const allowanceLines = input.allowances.map((a) => ({
    name: a.name,
    cents: resolveComponentCents(proratedBaseCents, a),
    isTaxable: a.isTaxable !== false,
  }));
  const allowanceCents = allowanceLines.reduce((s, l) => s + l.cents, 0);

  const preTax = input.deductions.filter((d) => d.isPreTax !== false);
  const postTax = input.deductions.filter((d) => d.isPreTax === false);

  const preTaxLines = preTax.map((d) => ({
    name: d.name,
    cents: resolveComponentCents(proratedBaseCents, d),
  }));
  const preTaxDeductionCents = preTaxLines.reduce((s, l) => s + l.cents, 0);

  const taxableAllowances = allowanceLines
    .filter((l) => l.isTaxable)
    .reduce((s, l) => s + l.cents, 0);
  const taxableCents = Math.max(
    0,
    proratedBaseCents + taxableAllowances - preTaxDeductionCents,
  );
  const taxCents = applyTaxSlabs(taxableCents, input.taxSlabs);

  const postTaxLines = postTax.map((d) => ({
    name: d.name,
    cents: resolveComponentCents(proratedBaseCents, d),
  }));
  const postTaxDeductionCents = postTaxLines.reduce((s, l) => s + l.cents, 0);
  const deductionCents = preTaxDeductionCents + postTaxDeductionCents;

  const netCents = Math.max(
    0,
    proratedBaseCents +
      allowanceCents -
      deductionCents -
      taxCents,
  );

  return {
    employeeId: input.employeeId,
    baseCents: input.baseCents,
    proratedBaseCents,
    allowanceCents,
    preTaxDeductionCents,
    taxableCents,
    taxCents,
    postTaxDeductionCents,
    deductionCents,
    netCents,
    daysPresent: present,
    daysExpected: expected,
    breakdown: {
      calcVersion: PAYROLL_CALC_VERSION,
      factor,
      allowances: allowanceLines,
      preTaxDeductions: preTaxLines,
      postTaxDeductions: postTaxLines,
      taxCents,
    },
  };
}
