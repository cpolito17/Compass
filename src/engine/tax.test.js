import { describe, it, expect } from 'vitest';
import { effectiveTax, progressiveTax, ficaTax } from './tax.js';
import { appData } from '../lib/data.js';

describe('tax engine (§12)', () => {
  it('computes progressive federal tax across brackets', () => {
    // Single, $120k gross, no 401k: taxable = 120000 - 16100 = 103900.
    // 10%*12400 + 12%*(50400-12400) + 22%*(103900-50400) = 1240 + 4560 + 11770.
    const t = effectiveTax(120000, 'single', 'houston-tx', appData);
    expect(t.federal).toBeCloseTo(17570, 2);
  });

  it('computes FICA with wage base and additional Medicare', () => {
    // $250k single: SS capped at 184500*6.2% = 11439; medicare 250000*1.45% = 3625;
    // additional 0.9% on 50000 = 450.
    expect(ficaTax(250000, 'single', appData.federal)).toBeCloseTo(11439 + 3625 + 450, 2);
    // Below all thresholds: straight 7.65%.
    expect(ficaTax(100000, 'single', appData.federal)).toBeCloseTo(7650, 2);
    // MFJ threshold is 250k → no additional Medicare at 250k.
    expect(ficaTax(250000, 'mfj', appData.federal)).toBeCloseTo(11439 + 3625, 2);
  });

  it('computes California progressive state tax', () => {
    // Single $120k in LA: CA taxable = 120000 - 5540 = 114460.
    const t = effectiveTax(120000, 'single', 'los-angeles-ca', appData);
    const expected =
      0.01 * 10756 +
      0.02 * (25499 - 10756) +
      0.04 * (40245 - 25499) +
      0.06 * (55866 - 40245) +
      0.08 * (70606 - 55866) +
      0.093 * (114460 - 70606);
    expect(t.state).toBeCloseTo(expected, 2);
    expect(t.local).toBe(0);
    expect(t.total).toBeCloseTo(t.federal + t.fica + t.state, 6);
    expect(t.effectiveRate).toBeCloseTo(t.total / 120000, 10);
  });

  it('handles no-income-tax states and flat-rate states', () => {
    const tx = effectiveTax(100000, 'single', 'dallas-tx', appData);
    expect(tx.state).toBe(0);
    const pa = effectiveTax(100000, 'single', 'philadelphia-pa', appData);
    expect(pa.state).toBeCloseTo(100000 * 0.0307, 2); // PA: no standard deduction
    expect(pa.local).toBeCloseTo(100000 * 0.0374, 2); // Philly wage tax
  });

  it('applies NYC local income tax', () => {
    const t = effectiveTax(150000, 'single', 'new-york-ny', appData);
    expect(t.local).toBeCloseTo(150000 * 0.03876, 2);
    expect(t.state).toBeGreaterThan(0);
  });

  it('reduces federal and state (not FICA) by pre-tax 401k', () => {
    const without = effectiveTax(120000, 'single', 'los-angeles-ca', appData, 0);
    const with401k = effectiveTax(120000, 'single', 'los-angeles-ca', appData, 12000);
    expect(with401k.federal).toBeLessThan(without.federal);
    expect(with401k.state).toBeLessThan(without.state);
    expect(with401k.fica).toBeCloseTo(without.fica, 6);
  });

  it('respects filing status (MFJ pays less than single at same income)', () => {
    const single = effectiveTax(150000, 'single', 'chicago-il', appData);
    const mfj = effectiveTax(150000, 'mfj', 'chicago-il', appData);
    expect(mfj.federal).toBeLessThan(single.federal);
  });

  it('floors taxable income at zero', () => {
    const t = effectiveTax(10000, 'mfj', 'dallas-tx', appData);
    expect(t.federal).toBe(0); // below the MFJ standard deduction
    expect(t.fica).toBeGreaterThan(0); // FICA still applies
  });

  it('progressiveTax handles edge cases', () => {
    expect(progressiveTax(0, appData.federal.brackets.single)).toBe(0);
    expect(progressiveTax(-5, appData.federal.brackets.single)).toBe(0);
    // Top bracket engages
    const big = progressiveTax(1000000, appData.federal.brackets.single);
    expect(big).toBeGreaterThan(0.3 * 1000000);
  });
});
