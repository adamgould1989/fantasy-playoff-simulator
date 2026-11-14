import { describe, expect, it } from 'vitest';
import type { FinalMatchup, Game } from '../src/model/types.ts';
import { Agg, rank } from '../src/logic/standings.ts';
import { runScenarios, IN, OUT, PTS } from '../src/logic/scenarios.ts';
import { minimise } from '../src/logic/paths.ts';
import { teamPaths } from '../src/logic/explain.ts';

let week = 0;
/** Game helper; points in whole numbers. */
const g = (a: number, b: number, pa: number, pb: number): Game => ({
  week: ++week,
  a,
  b,
  pa: pa * 100,
  pb: pb * 100,
  winner: pa > pb ? 'a' : pb > pa ? 'b' : 'tie',
});
const order = (ids: number[], games: Game[]) => rank(Agg.from(ids, games));

describe('standings', () => {
  it('orders by overall win% first', () => {
    const r = order([1, 2, 3], [g(1, 2, 100, 90), g(1, 3, 100, 90), g(2, 3, 100, 90)]);
    expect(r.order).toEqual([1, 2, 3]);
    expect(r.groups).toEqual([]);
  });

  it('circular head-to-head falls through to points per matchup, then total points', () => {
    // 1>2, 2>3, 3>1; all beat 4. Everyone in {1,2,3} is 1-1 vs the group.
    const games = [
      g(1, 2, 100, 80),
      g(2, 3, 110, 100),
      g(3, 1, 120, 90),
      g(1, 4, 130, 50),
      g(2, 4, 120, 50),
      g(3, 4, 60, 50),
    ];
    const r = order([1, 2, 3, 4], games);
    // pts per matchup vs group: 3 = 110, 1 = 95, 2 = 95 → 3 first; 1 vs 2 on total points (320 vs 310).
    expect(r.order).toEqual([3, 1, 2, 4]);
    expect(r.groups[0].steps).toEqual(['h2hPts', 'pf']);
  });

  it('two-team tie decided purely by head-to-head', () => {
    // 1 and 2 are 1-1; 1 beat 2; 3 and 4 make up the rest.
    const games = [g(1, 2, 90, 89), g(2, 3, 150, 100), g(1, 4, 80, 100), g(3, 4, 100, 90), g(3, 4, 100, 90)];
    // 1: 1-1, 2: 1-1, 3: 2-1, 4: 1-2.
    const r = order([1, 2, 3, 4], games);
    expect(r.order).toEqual([3, 1, 2, 4]);
    expect(r.groups[0].steps).toEqual(['h2h']);
  });

  it('keeps the original group stats when head-to-head only partly splits a group', () => {
    // A=1, B=2, C=3, D=4, E=5. A, B, C finish 2-2.
    const games = [
      g(1, 2, 160, 150), // A beats B
      g(1, 3, 210, 200), // A beats C
      g(2, 3, 100, 80), // B beats C
      g(3, 2, 95, 90), // C beats B
      g(4, 1, 120, 100), // D beats A
      g(5, 1, 120, 100), // E beats A
      g(2, 4, 120, 100), // B beats D
      g(3, 5, 120, 100), // C beats E
      g(4, 5, 120, 100),
      g(4, 5, 120, 100),
    ];
    const r = order([1, 2, 3, 4, 5], games);
    // B and C are 1-2 vs the group. Over the original 3-team group C averages 125, B 113.33 → C above B,
    // even though B outscored C in their own two games (95 vs 87.5).
    expect(r.order).toEqual([4, 1, 3, 2, 5]);
    expect(r.groups[0].steps).toEqual(['h2h', 'h2hPts']);
  });

  it('counts ties as half a win', () => {
    const r = order([1, 2], [g(1, 2, 100, 100), g(1, 2, 100, 90)]);
    expect(r.order).toEqual([1, 2]);
  });
});

describe('minimise', () => {
  it('drops irrelevant variables', () => {
    expect(minimise([1, 3], 2)).toEqual([{ care: 1, value: 1 }]);
  });
  it('returns a tautology for every outcome', () => {
    expect(minimise([0, 1, 2, 3], 2)).toEqual([{ care: 0, value: 0 }]);
  });
  it('handles OR of terms', () => {
    // x0=1 OR x1=1
    const t = minimise([1, 2, 3], 2);
    expect(t).toHaveLength(2);
  });
});

describe('scenarios', () => {
  // Weeks 1-3: 1>2, 1>3, 1>4, 2>4, 3>2, 4>3. Records: 1 3-0, others 1-2.
  const games = [g(1, 2, 120, 100), g(1, 3, 120, 100), g(1, 4, 120, 100), g(2, 4, 110, 100), g(3, 2, 110, 100), g(4, 3, 110, 100)];
  const open: FinalMatchup[] = [
    { id: 1, a: 1, b: 2, pa: 0, pb: 0 },
    { id: 2, a: 3, b: 4, pa: 0, pb: 0 },
  ];
  const res = runScenarios({ ids: [1, 2, 3, 4], games, playoffTeams: 2, week: 4, fixed: [], forced: [], open });

  it('flags clinched teams', () => {
    expect(res.badge.get(1)).toBe('clinched');
    expect(res.odds.get(1)).toBeCloseTo(1);
  });

  it('works out each team’s path', () => {
    // Team 3 is in if and only if it wins.
    const p3 = teamPaths(res, 3);
    expect(p3.kind).toBe('open');
    expect(p3.inTerms).toHaveLength(1);
    expect(p3.inTerms[0].literals.map((l) => l.winner)).toEqual([3]);
    // Team 4 needs to win AND team 1 to beat team 2.
    const p4 = teamPaths(res, 4);
    expect(p4.inTerms[0].literals.map((l) => l.winner).sort()).toEqual([1, 4]);
    // Points never matter here.
    expect(res.outcomes.every((o) => !o.status.includes(PTS))).toBe(true);
  });

  it('odds sum to the number of playoff spots', () => {
    const sum = [...res.odds.values()].reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(2, 5);
  });

  it('marks points-dependent outcomes', () => {
    // 1 and 2 have identical records and never played; spot depends on points.
    const gs = [g(1, 3, 100, 90), g(2, 4, 100, 90), g(3, 4, 100, 90)];
    const r = runScenarios({
      ids: [1, 2, 3, 4],
      games: gs,
      playoffTeams: 1,
      week: 4,
      fixed: [],
      forced: [],
      open: [{ id: 9, a: 1, b: 3, pa: 0, pb: 0 }, { id: 8, a: 2, b: 4, pa: 0, pb: 0 }],
    });
    const both = r.outcomes.find((o) => o.bits === 0)!; // 1 and 2 both win → tied 2-0, no H2H
    expect(both.status[0]).toBe(PTS);
    expect(both.status[1]).toBe(PTS);
    expect(both.pin[0] + both.pin[1]).toBeCloseTo(1);
    const oneWins = r.outcomes.find((o) => o.bits === 2)!; // 1 wins, 4 beats 2
    expect(oneWins.status[0]).toBe(IN);
    expect(oneWins.status[1]).toBe(OUT);
  });
});
