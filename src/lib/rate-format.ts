/**
 * A support rate per 10,000 residents, as shown to a reader.
 *
 * The marts hold two decimals ("46.66"). The numerator is a quarter-end count and the
 * denominator a mid-year estimate, so the second decimal is not information. One decimal
 * is shown; the stored value, which ranks and percentiles are computed from, is unchanged.
 */
export function formatRatePer10k(rate: number | null | undefined): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "n/a";
  return rate.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
