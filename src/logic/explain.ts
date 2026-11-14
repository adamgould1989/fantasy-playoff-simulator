import type { FinalMatchup, RosterId } from '../model/types.ts';
import { minimise, type Term } from './paths.ts';
import { IN, PTS, type ScenarioResult } from './scenarios.ts';
import type { H2HLine, TieGroup } from './standings.ts';

export type NameOf = (id: RosterId) => string;

export const pts = (c: number) => (c / 100).toFixed(2);
export const record = (w: number, l: number, t: number) => (t ? `${w}–${l}–${t}` : `${w}–${l}`);

const lineRecord = (l: H2HLine) => record(l.w, l.l, l.t);
const ppm = (l: H2HLine) => pts(l.ppm[0] / l.ppm[1]);

export interface TieExplanation {
  members: { id: RosterId; record: string; games: number; ppm: string | null; pf: string }[];
  reasons: string[];
}

export function explainTie(group: TieGroup, name: NameOf): TieExplanation {
  const members = group.members.map((id) => {
    const l = group.lines.get(id)!;
    return {
      id,
      record: lineRecord(l),
      games: l.games,
      ppm: l.games ? pts(l.pts / l.games) : null,
      pf: pts(l.pf),
    };
  });
  const reasons = group.steps.map((step, k) => {
    const x = group.lines.get(group.members[k])!;
    const y = group.lines.get(group.members[k + 1])!;
    const X = name(x.id);
    const Y = name(y.id);
    switch (step) {
      case 'h2h': {
        const note = !x.games || !y.games
          ? ` ${!x.games ? X : Y} hasn't played any of the other tied teams, so counts as .500.`
          : '';
        return `${X} is above ${Y} on head-to-head record against the tied teams (${lineRecord(x)} vs ${lineRecord(y)}).${note}`;
      }
      case 'h2hPts':
        return `${X} and ${Y} have the same head-to-head win rate. ${X} scored more per game against the tied teams (${ppm(x)} vs ${ppm(y)}).`;
      case 'pf':
        return `${X} and ${Y} are level on head-to-head record and points against the tied teams. ${X} has more total points (${pts(x.pf)} vs ${pts(y.pf)}).`;
      default:
        return `${X} and ${Y} are identical on every tiebreak, so they're listed in Sleeper's team order.`;
    }
  });
  return { members, reasons };
}

export interface Literal {
  m: FinalMatchup;
  winner: RosterId;
  loser: RosterId;
}

export interface PathTerm {
  literals: Literal[];
  /** For points-dependent terms: who the points tiebreak would be against. */
  rivals: RosterId[];
}

export interface Paths {
  kind: 'clinched' | 'eliminated' | 'open';
  inTerms: PathTerm[];
  ptsTerms: PathTerm[];
}

function termLiterals(res: ScenarioResult, t: Term, me: RosterId): Literal[] {
  const lits: Literal[] = [];
  res.open.forEach((m, k) => {
    if (!((t.care >> k) & 1)) return;
    const bWins = (t.value >> k) & 1;
    lits.push({ m, winner: bWins ? m.b : m.a, loser: bWins ? m.a : m.b });
  });
  // Your own game first.
  return lits.sort((p, q) => Number(q.winner === me || q.loser === me) - Number(p.winner === me || p.loser === me));
}

export function teamPaths(res: ScenarioResult, me: RosterId): Paths {
  const i = res.ids.indexOf(me);
  const n = res.open.length;
  const inSet = res.outcomes.filter((o) => o.status[i] === IN).map((o) => o.bits);
  const ptsOutcomes = res.outcomes.filter((o) => o.status[i] === PTS);
  const total = res.outcomes.length;
  if (inSet.length === total) return { kind: 'clinched', inTerms: [], ptsTerms: [] };
  if (!inSet.length && !ptsOutcomes.length) return { kind: 'eliminated', inTerms: [], ptsTerms: [] };

  const inTerms = minimise(inSet, n).map((t) => ({ literals: termLiterals(res, t, me), rivals: [] }));
  const ptsTerms = minimise(ptsOutcomes.map((o) => o.bits), n).map((t) => {
    const rivals = new Set<RosterId>();
    for (const o of ptsOutcomes) {
      if ((o.bits & t.care) !== t.value) continue;
      for (const j of o.rivals.get(i) ?? []) rivals.add(res.ids[j]);
    }
    return { literals: termLiterals(res, t, me), rivals: [...rivals] };
  });
  return { kind: 'open', inTerms, ptsTerms };
}

export function literalText(l: Literal, me: RosterId | null, name: NameOf): string {
  if (l.winner === me) return 'you win';
  if (l.loser === me) return 'you lose';
  return `${name(l.winner)} beat ${name(l.loser)}`;
}
