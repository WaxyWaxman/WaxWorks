export const money = (n: number): string =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

// E-02 decision 9 / E-04 decision 8 — shelf prices round UP to the next .50 or .99.
export function roundUpShelf(n: number): number {
  if (n <= 0) return 0;
  const base = Math.floor(n + 1e-9);
  const candidates = [base + 0.5, base + 0.99, base + 1.5];
  const hit = candidates.find((c) => c >= n - 1e-9);
  return Number((hit ?? base + 0.99).toFixed(2));
}

export const pct = (n: number): string => `${n}%`;
