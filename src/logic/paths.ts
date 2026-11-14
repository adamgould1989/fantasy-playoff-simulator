/**
 * Minimise a set of outcomes (bitmasks over n variables) into a short OR of AND terms,
 * using Quine–McCluskey. n is the number of open matchups (≤ 6 in practice).
 */

export interface Term {
  /** Bits that matter. */
  care: number;
  /** Required values for the bits that matter. */
  value: number;
}

const popcount = (x: number) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

export function minimise(minterms: number[], n: number): Term[] {
  const full = (1 << n) - 1;
  if (minterms.length === 0) return [];
  if (minterms.length === 1 << n) return [{ care: 0, value: 0 }];

  // Implicants as (value, dontCare mask).
  let level = new Map<string, { v: number; d: number }>();
  for (const m of minterms) level.set(`${m}:0`, { v: m, d: 0 });
  const primes = new Map<string, { v: number; d: number }>();

  while (level.size) {
    const next = new Map<string, { v: number; d: number }>();
    const used = new Set<string>();
    const items = [...level.entries()];
    for (let x = 0; x < items.length; x++) {
      for (let y = x + 1; y < items.length; y++) {
        const [kx, a] = items[x];
        const [ky, b] = items[y];
        if (a.d !== b.d) continue;
        const diff = a.v ^ b.v;
        if (popcount(diff) !== 1) continue;
        const v = a.v & ~diff;
        const d = a.d | diff;
        next.set(`${v}:${d}`, { v, d });
        used.add(kx);
        used.add(ky);
      }
    }
    for (const [k, imp] of items) if (!used.has(k)) primes.set(k, imp);
    level = next;
  }

  const covers = (imp: { v: number; d: number }, m: number) => (m & ~imp.d) === imp.v;
  const primeList = [...primes.values()];
  const uncovered = new Set(minterms);
  const chosen: { v: number; d: number }[] = [];

  // Essential primes first.
  for (const m of minterms) {
    const covering = primeList.filter((p) => covers(p, m));
    if (covering.length === 1 && !chosen.includes(covering[0])) chosen.push(covering[0]);
  }
  for (const c of chosen) for (const m of [...uncovered]) if (covers(c, m)) uncovered.delete(m);

  // Then greedily: most new coverage, fewest literals.
  while (uncovered.size) {
    let best = primeList[0];
    let bestScore = -1;
    for (const p of primeList) {
      let cnt = 0;
      for (const m of uncovered) if (covers(p, m)) cnt++;
      const score = cnt * 100 - popcount(full & ~p.d);
      if (cnt > 0 && score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    chosen.push(best);
    for (const m of [...uncovered]) if (covers(best, m)) uncovered.delete(m);
  }

  return chosen
    .map((p) => ({ care: full & ~p.d, value: p.v & full & ~p.d }))
    .sort((a, b) => popcount(a.care) - popcount(b.care));
}
