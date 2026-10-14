import {
  applyTaxSlabs,
  calculateEmployeePay,
  countWeekdays,
  resolveComponentCents,
} from './payroll-calculator';

describe('payroll calculator', () => {
  it('resolves fixed and percent components in cents', () => {
    expect(
      resolveComponentCents(100_000, {
        name: 'Transport',
        kind: 'fixed',
        amountValue: 5000,
      }),
    ).toBe(5000);
    expect(
      resolveComponentCents(100_000, {
        name: 'HRA',
        kind: 'percent_base',
        amountValue: 1000, // 10%
      }),
    ).toBe(10_000);
  });

  it('applies progressive tax slabs deterministically', () => {
    const slabs = [
      { fromCents: 0, toCents: 50_000, rateBps: 0 },
      { fromCents: 50_000, toCents: 100_000, rateBps: 500 },
      { fromCents: 100_000, toCents: null, rateBps: 1000 },
    ];
    // 120_000: 0 on first 50k, 5% on next 50k = 2500, 10% on 20k = 2000 → 4500
    expect(applyTaxSlabs(120_000, slabs)).toBe(4500);
    expect(applyTaxSlabs(0, slabs)).toBe(0);
  });

  it('counts weekdays in a period', () => {
    // 2026-10-01 Thu … 2026-10-07 Wed = 5 weekdays
    expect(countWeekdays('2026-10-01', '2026-10-07')).toBe(5);
  });

  it('prorates base by attendance and computes net', () => {
    const result = calculateEmployeePay({
      employeeId: 1,
      baseCents: 100_000,
      allowances: [
        {
          name: 'Transport',
          kind: 'fixed',
          amountValue: 10_000,
          isTaxable: true,
        },
      ],
      deductions: [
        {
          name: 'PF',
          kind: 'percent_base',
          amountValue: 500,
          isPreTax: true,
        },
      ],
      daysPresent: 10,
      daysExpected: 20,
      taxSlabs: [{ fromCents: 0, toCents: null, rateBps: 0 }],
    });

    expect(result.proratedBaseCents).toBe(50_000);
    expect(result.allowanceCents).toBe(10_000);
    expect(result.preTaxDeductionCents).toBe(2500); // 5% of 50k
    expect(result.netCents).toBe(50_000 + 10_000 - 2500);
  });

  it('is reproducible for identical inputs', () => {
    const input = {
      employeeId: 2,
      baseCents: 200_000,
      allowances: [] as never[],
      deductions: [] as never[],
      daysPresent: 22,
      daysExpected: 22,
      taxSlabs: [
        { fromCents: 0, toCents: 100_000, rateBps: 0 },
        { fromCents: 100_000, toCents: null, rateBps: 1000 },
      ],
    };
    expect(calculateEmployeePay(input)).toEqual(calculateEmployeePay(input));
  });
});
