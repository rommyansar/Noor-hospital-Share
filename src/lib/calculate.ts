// ============================================
// Hospital Share v2 — Calculation Engine
// ============================================
// SIMPLIFIED: No fraction-based logic.
// Percentage is always a plain number (e.g., 3, 10, 0.5).
// Group distribution: pool = income × (pct/100) → share = pool ÷ present count.
// ============================================

/**
 * Parse a percentage string into a number.
 * "3"    → 3
 * "10"   → 10
 * "0.5"  → 0.5
 * ".5"   → 0.5
 */
export function parsePercentage(input: string): number {
  const trimmed = (input || '0').trim();
  return parseFloat(trimmed) || 0;
}

/**
 * Format percentage for display.
 * "3" → "3%"
 * "0.5" → "0.5%"
 */
export function formatPercentage(input: string): string {
  const pct = parsePercentage(input);
  return `${pct}%`;
}

/**
 * Compute INDIVIDUAL share.
 * share = income × (pct / 100)
 */
export function computeIndividualShare(income: number, pctStr: string): number {
  const pct = parsePercentage(pctStr);
  if (pct === 0 || income === 0) return 0;
  return Math.round(income * (pct / 100) * 100) / 100;
}

/**
 * Compute GROUP share (DYNAMIC DISTRIBUTION).
 *
 * pool = income × (pct / 100)
 * share = pool ÷ presentCount
 *
 * Only PRESENT staff are counted.
 * OFF/CL staff are completely excluded.
 */
export function computeGroupShare(
  income: number,
  pctStr: string,
  presentCount: number,
): number {
  if (presentCount <= 0) return 0;
  const pct = parsePercentage(pctStr);
  if (pct === 0 || income === 0) return 0;
  const pool = income * (pct / 100);
  return Math.round((pool / presentCount) * 100) / 100;
}

/**
 * Compute the group pool amount (for display).
 */
export function computePoolAmount(income: number, pctStr: string): number {
  const pct = parsePercentage(pctStr);
  if (pct === 0 || income === 0) return 0;
  return Math.round(income * (pct / 100) * 100) / 100;
}

/**
 * Compute work-entry based share (for doctors).
 * Each entry: share = amount × (pct / 100)
 * Total = sum of all entry shares.
 */
export function computeWorkEntryShare(
  entries: { amount: number; percentage: string }[],
): number {
  let total = 0;
  for (const entry of entries) {
    const pct = parsePercentage(entry.percentage);
    if (pct === 0 || entry.amount === 0) continue;
    total += entry.amount * (pct / 100);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Compute a single entry's share (for preview).
 */
export function computeSingleEntry(amount: number, pctStr: string): number {
  return computeIndividualShare(amount, pctStr);
}
