import type { Game, RosterId } from '../model/types.ts';

/**
 * Season aggregates, indexed 0..n-1. Head-to-head matrices are flat n*n arrays where
 * [i*n+j] is team i's figure against team j. Points are integer cents.
 */
export class Agg {
  readonly n: number;
  readonly ids: RosterId[];
  readonly index: Map<RosterId, number>;
  w: number[];
  l: number[];
  t: number[];
  g: number[];
  pf: number[];
  hw: number[];
  ht: number[];
  hg: number[];
  hp: number[];

  constructor(ids: RosterId[], copyFrom?: Agg) {
    this.ids = ids;
    this.n = ids.length;
    this.index = copyFrom ? copyFrom.index : new Map(ids.map((id, i) => [id, i]));
    const n = this.n;
    if (copyFrom) {
      this.w = copyFrom.w.slice();
      this.l = copyFrom.l.slice();
      this.t = copyFrom.t.slice();
      this.g = copyFrom.g.slice();
      this.pf = copyFrom.pf.slice();
      this.hw = copyFrom.hw.slice();
      this.ht = copyFrom.ht.slice();
      this.hg = copyFrom.hg.slice();
      this.hp = copyFrom.hp.slice();
    } else {
      const z = (k: number) => new Array<number>(k).fill(0);
      this.w = z(n);
      this.l = z(n);
      this.t = z(n);
      this.g = z(n);
      this.pf = z(n);
      this.hw = z(n * n);
      this.ht = z(n * n);
      this.hg = z(n * n);
      this.hp = z(n * n);
    }
  }

  clone(): Agg {
    return new Agg(this.ids, this);
  }

  add(game: Game): void {
    const i = this.index.get(game.a);
    const j = this.index.get(game.b);
    if (i === undefined || j === undefined) return;
    const n = this.n;
    this.g[i]++;
    this.g[j]++;
    this.pf[i] += game.pa;
    this.pf[j] += game.pb;
    this.hg[i * n + j]++;
    this.hg[j * n + i]++;
    this.hp[i * n + j] += game.pa;
    this.hp[j * n + i] += game.pb;
    if (game.winner === 'a') {
      this.w[i]++;
      this.l[j]++;
      this.hw[i * n + j]++;
    } else if (game.winner === 'b') {
      this.w[j]++;
      this.l[i]++;
      this.hw[j * n + i]++;
    } else {
      this.t[i]++;
      this.t[j]++;
      this.ht[i * n + j]++;
      this.ht[j * n + i]++;
    }
  }

  static from(ids: RosterId[], games: Game[]): Agg {
    const agg = new Agg(ids);
    for (const g of games) agg.add(g);
    return agg;
  }
}

/** Compare fractions a/b vs c/d with non-negative denominators (b, d > 0). */
const cmpFrac = (a: number, b: number, c: number, d: number) => a * d - c * b;

/** Overall win% as a fraction (2W+T)/(2G). Teams with no games count as 0/1. */
function winFrac(agg: Agg, i: number): [number, number] {
  return agg.g[i] > 0 ? [2 * agg.w[i] + agg.t[i], 2 * agg.g[i]] : [0, 1];
}

export interface H2HLine {
  id: RosterId;
  w: number;
  l: number;
  t: number;
  games: number;
  /** Points scored against the other tied teams, cents. */
  pts: number;
  /** Win% used for sorting as [num, den]. No games counts as .500. */
  pct: [number, number];
  /** Points per matchup used for sorting as [num, den]. No games uses the season average. */
  ppm: [number, number];
  pf: number;
}

export type TieStep = 'h2h' | 'h2hPts' | 'pf' | 'none';

export interface TieGroup {
  /** 0-based position of the group's first team in the table. */
  start: number;
  /** Members in final order. */
  members: RosterId[];
  lines: Map<RosterId, H2HLine>;
  /** steps[k] = the criterion that put members[k] above members[k+1]. */
  steps: TieStep[];
  record: { w: number; l: number; t: number };
}

export interface Ranking {
  /** Team ids in table order. */
  order: RosterId[];
  groups: TieGroup[];
}

/** Indices grouped by equal overall win%, best first. */
function winGroups(agg: Agg): number[][] {
  const idx = Array.from({ length: agg.n }, (_, i) => i);
  idx.sort((x, y) => {
    const [a, b] = winFrac(agg, x);
    const [c, d] = winFrac(agg, y);
    return cmpFrac(c, d, a, b);
  });
  const groups: number[][] = [];
  for (const i of idx) {
    const last = groups[groups.length - 1];
    if (last) {
      const [a, b] = winFrac(agg, last[0]);
      const [c, d] = winFrac(agg, i);
      if (cmpFrac(a, b, c, d) === 0) {
        last.push(i);
        continue;
      }
    }
    groups.push([i]);
  }
  return groups;
}

function h2hLine(agg: Agg, i: number, group: number[]): H2HLine {
  const n = agg.n;
  let w = 0;
  let t = 0;
  let games = 0;
  let pts = 0;
  for (const j of group) {
    if (j === i) continue;
    w += agg.hw[i * n + j];
    t += agg.ht[i * n + j];
    games += agg.hg[i * n + j];
    pts += agg.hp[i * n + j];
  }
  const pct: [number, number] = games > 0 ? [2 * w + t, 2 * games] : [1, 2];
  const ppm: [number, number] =
    games > 0 ? [pts, games] : agg.g[i] > 0 ? [agg.pf[i], agg.g[i]] : [0, 1];
  return { id: agg.ids[i], w, l: games - w - t, t, games, pts, pct, ppm, pf: agg.pf[i] };
}

/** Which criterion separates a (above) from b; 0 if they are identical on everything. */
function compareLines(a: H2HLine, b: H2HLine): [number, TieStep] {
  const h = cmpFrac(b.pct[0], b.pct[1], a.pct[0], a.pct[1]);
  if (h !== 0) return [h, 'h2h'];
  const p = cmpFrac(b.ppm[0], b.ppm[1], a.ppm[0], a.ppm[1]);
  if (p !== 0) return [p, 'h2hPts'];
  if (a.pf !== b.pf) return [b.pf - a.pf, 'pf'];
  return [a.id - b.id, 'none'];
}

/**
 * Rank all teams: overall win%, then within each tied group (stats always taken over the
 * original tied group) H2H win%, H2H points per matchup, then total points.
 */
export function rank(agg: Agg, withNotes = true): Ranking {
  const order: RosterId[] = [];
  const groups: TieGroup[] = [];
  for (const group of winGroups(agg)) {
    if (group.length === 1) {
      order.push(agg.ids[group[0]]);
      continue;
    }
    const lines = group.map((i) => h2hLine(agg, i, group));
    lines.sort((a, b) => compareLines(a, b)[0]);
    const start = order.length;
    for (const line of lines) order.push(line.id);
    if (withNotes) {
      const i0 = group[0];
      groups.push({
        start,
        members: lines.map((l) => l.id),
        lines: new Map(lines.map((l) => [l.id, l])),
        steps: lines.slice(1).map((l, k) => compareLines(lines[k], l)[1]),
        record: { w: agg.w[i0], l: agg.l[i0], t: agg.t[i0] },
      });
    }
  }
  return { order, groups };
}

/**
 * Points-free view: teams bucketed by (overall win%, H2H win% within the tied group).
 * Points can only reorder teams inside the same bucket. Returns buckets in table order.
 */
export function pointsFreeBuckets(agg: Agg): number[][] {
  const buckets: number[][] = [];
  for (const group of winGroups(agg)) {
    if (group.length === 1) {
      buckets.push(group);
      continue;
    }
    const lines = group.map((i) => ({ i, pct: h2hLine(agg, i, group).pct }));
    lines.sort((a, b) => cmpFrac(b.pct[0], b.pct[1], a.pct[0], a.pct[1]));
    let cur: typeof lines = [];
    for (const l of lines) {
      if (cur.length && cmpFrac(cur[0].pct[0], cur[0].pct[1], l.pct[0], l.pct[1]) !== 0) {
        buckets.push(cur.map((x) => x.i));
        cur = [];
      }
      cur.push(l);
    }
    if (cur.length) buckets.push(cur.map((x) => x.i));
  }
  return buckets;
}
