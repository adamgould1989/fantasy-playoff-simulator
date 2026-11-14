import type { FinalMatchup, Game, League, Override, Overrides, ReplayMode } from './types.ts';

/** Does the week's real data count as results (finished week shown with actual results)? */
export function usesActual(league: League, mode: ReplayMode): boolean {
  return league.status === 'complete' && mode === 'actual';
}

/** Does the week show live points (in progress)? */
export function usesLive(league: League): boolean {
  return league.status === 'live';
}

/** The points to display for a matchup before overrides: live/actual points, or none. */
export function basePoints(league: League, mode: ReplayMode, m: FinalMatchup): { pa: number; pb: number } | null {
  if (usesActual(league, mode) || usesLive(league)) {
    if (m.pa > 0 || m.pb > 0) return { pa: m.pa, pb: m.pb };
  }
  return null;
}

const winnerOf = (pa: number, pb: number) => (pa > pb ? 'a' : pb > pa ? 'b' : 'tie') as Game['winner'];

/** How the table should count this matchup, or null if it doesn't count yet. */
export function effectiveGame(
  league: League,
  mode: ReplayMode,
  m: FinalMatchup,
  o: Override | undefined,
): Game | null {
  const week = league.openWeek;
  if (o?.pa !== undefined && o?.pb !== undefined) {
    return { week, a: m.a, b: m.b, pa: o.pa, pb: o.pb, winner: winnerOf(o.pa, o.pb) };
  }
  const base = basePoints(league, mode, m);
  if (o?.w !== undefined) {
    return {
      week,
      a: m.a,
      b: m.b,
      pa: base?.pa ?? 0,
      pb: base?.pb ?? 0,
      winner: o.w === m.a ? 'a' : 'b',
    };
  }
  if (base) return { week, a: m.a, b: m.b, pa: base.pa, pb: base.pb, winner: winnerOf(base.pa, base.pb) };
  return null;
}

export function tableGames(league: League, mode: ReplayMode, overrides: Overrides): Game[] {
  const extra: Game[] = [];
  for (const m of league.matchups) {
    const g = effectiveGame(league, mode, m, overrides[m.id]);
    if (g) extra.push(g);
  }
  return [...league.games, ...extra];
}

/** How the scenario engine treats a matchup. */
export type MatchupRole =
  | { kind: 'fixed'; game: Game }
  | { kind: 'winner'; winner: 'a' | 'b' }
  | { kind: 'open' };

export function matchupRole(league: League, mode: ReplayMode, m: FinalMatchup, o: Override | undefined): MatchupRole {
  const week = league.openWeek;
  if (o?.pa !== undefined && o?.pb !== undefined) {
    return { kind: 'fixed', game: { week, a: m.a, b: m.b, pa: o.pa, pb: o.pb, winner: winnerOf(o.pa, o.pb) } };
  }
  if (o?.w !== undefined) return { kind: 'winner', winner: o.w === m.a ? 'a' : 'b' };
  if (usesActual(league, mode)) {
    return { kind: 'fixed', game: { week, a: m.a, b: m.b, pa: m.pa, pb: m.pb, winner: winnerOf(m.pa, m.pb) } };
  }
  return { kind: 'open' };
}
