import type { FinalMatchup, Game, RosterId } from '../model/types.ts';
import { Agg, pointsFreeBuckets, rank } from './standings.ts';

/** IN: makes the playoffs whatever the points. OUT: misses whatever the points. PTS: depends on points. */
export const OUT = 0;
export const IN = 1;
export const PTS = 2;

export interface ScenarioInput {
  ids: RosterId[];
  /** Games already counted (earlier weeks). */
  games: Game[];
  playoffTeams: number;
  week: number;
  /** Matchups with a fixed result including points. */
  fixed: Game[];
  /** Matchups with a forced winner but unknown points. */
  forced: { m: FinalMatchup; winner: 'a' | 'b' }[];
  /** Matchups still open; each is one variable. Bit k = 0 means `a` wins, 1 means `b` wins. */
  open: FinalMatchup[];
  samples?: number;
}

export interface Outcome {
  bits: number;
  p: number;
  status: Uint8Array;
  /** P(in | this outcome) per team index. */
  pin: Float64Array;
  /** For PTS teams: indices of the other teams in the same points tiebreak. */
  rivals: Map<number, number[]>;
}

export interface ScenarioResult {
  ids: RosterId[];
  open: FinalMatchup[];
  /** P(a wins) per open matchup. */
  pa: number[];
  outcomes: Outcome[];
  odds: Map<RosterId, number>;
  badge: Map<RosterId, 'clinched' | 'eliminated' | 'alive'>;
}

interface ScoreModel {
  mean: number;
  sd: number;
}

function scoreModels(ids: RosterId[], games: Game[]): Map<RosterId, ScoreModel> {
  const pts = new Map<RosterId, number[]>(ids.map((id) => [id, []]));
  for (const g of games) {
    pts.get(g.a)?.push(g.pa);
    pts.get(g.b)?.push(g.pb);
  }
  const all = games.flatMap((g) => [g.pa, g.pb]);
  const stats = (xs: number[]): ScoreModel => {
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
    return { mean, sd: Math.max(1500, Math.sqrt(v)) };
  };
  const league = all.length >= 2 ? stats(all) : { mean: 11000, sd: 2500 };
  const out = new Map<RosterId, ScoreModel>();
  for (const [id, xs] of pts) out.set(id, xs.length >= 3 ? stats(xs) : league);
  return out;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runScenarios(input: ScenarioInput): ScenarioResult {
  const { ids, playoffTeams, open, forced, fixed, week } = input;
  const S = input.samples ?? 300;
  const n = ids.length;
  const models = scoreModels(ids, input.games);
  const base = Agg.from(ids, input.games);
  for (const g of fixed) base.add(g);

  const pa = open.map((m) => {
    const x = models.get(m.a)!;
    const y = models.get(m.b)!;
    return phi((x.mean - y.mean) / Math.sqrt(x.sd ** 2 + y.sd ** 2));
  });

  const rand = mulberry32(0x5eed);
  const normal = () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const draw = (id: RosterId) => {
    const m = models.get(id)!;
    return Math.max(0, Math.round(m.mean + m.sd * normal()));
  };
  /** Points for a matchup consistent with the given winner. */
  const drawPair = (m: FinalMatchup, winner: 'a' | 'b'): Game => {
    let x = draw(m.a);
    let y = draw(m.b);
    if (x === y) x += 1;
    if ((winner === 'a') !== x > y) [x, y] = [y, x];
    return { week, a: m.a, b: m.b, pa: x, pb: y, winner };
  };

  const winnerGames: { m: FinalMatchup; winner: 'a' | 'b' }[] = [...forced];
  const outcomes: Outcome[] = [];
  const total = 1 << open.length;

  for (let bits = 0; bits < total; bits++) {
    let p = 1;
    const decided = winnerGames.slice();
    open.forEach((m, k) => {
      const bWins = (bits >> k) & 1;
      p *= bWins ? 1 - pa[k] : pa[k];
      decided.push({ m, winner: bWins ? 'b' : 'a' });
    });

    // Points-free classification is exact: only these bucket boundaries depend on points.
    const agg = base.clone();
    for (const d of decided) agg.add({ week, a: d.m.a, b: d.m.b, pa: 0, pb: 0, winner: d.winner });
    const status = new Uint8Array(n);
    const pin = new Float64Array(n);
    const rivals = new Map<number, number[]>();
    let pos = 0;
    let anyPts = false;
    for (const bucket of pointsFreeBuckets(agg)) {
      const start = pos;
      const end = pos + bucket.length;
      for (const i of bucket) {
        if (end <= playoffTeams) {
          status[i] = IN;
          pin[i] = 1;
        } else if (start >= playoffTeams) {
          status[i] = OUT;
        } else {
          status[i] = PTS;
          anyPts = true;
          rivals.set(i, bucket.filter((j) => j !== i));
        }
      }
      pos = end;
    }

    if (anyPts) {
      const counts = new Float64Array(n);
      for (let s = 0; s < S; s++) {
        const a2 = base.clone();
        for (const d of decided) a2.add(drawPair(d.m, d.winner));
        const order = rank(a2, false).order;
        for (let r = 0; r < playoffTeams; r++) counts[a2.index.get(order[r])!]++;
      }
      for (let i = 0; i < n; i++) if (status[i] === PTS) pin[i] = counts[i] / S;
    }
    outcomes.push({ bits, p, status, pin, rivals });
  }

  const odds = new Map<RosterId, number>();
  const badge = new Map<RosterId, 'clinched' | 'eliminated' | 'alive'>();
  ids.forEach((id, i) => {
    odds.set(id, outcomes.reduce((s, o) => s + o.p * o.pin[i], 0));
    const all = (v: number) => outcomes.every((o) => o.status[i] === v);
    badge.set(id, all(IN) ? 'clinched' : all(OUT) ? 'eliminated' : 'alive');
  });

  return { ids, open, pa, outcomes, odds, badge };
}

/** For one team: P(in) given each side of every open matchup. */
export function conditionalOdds(res: ScenarioResult, teamIndex: number) {
  return res.open.map((m, k) => {
    const side = (bWins: number) => {
      let num = 0;
      let den = 0;
      for (const o of res.outcomes) {
        if (((o.bits >> k) & 1) !== bWins) continue;
        num += o.p * o.pin[teamIndex];
        den += o.p;
      }
      return den > 0 ? num / den : 0;
    };
    return { m, ifA: side(0), ifB: side(1) };
  });
}
