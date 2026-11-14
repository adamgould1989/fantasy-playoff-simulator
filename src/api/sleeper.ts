import type { FinalMatchup, Game, League, Team, WeekStatus } from '../model/types.ts';

const BASE = 'https://api.sleeper.app/v1';

interface RawMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  custom_points: number | null;
}

const cache = new Map<string, unknown>();

async function get<T>(path: string, useCache = false): Promise<T> {
  if (useCache && cache.has(path)) return cache.get(path) as T;
  const res = await fetch(BASE + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} for ${path}`);
  const body = (await res.json()) as T;
  if (body === null) throw new Error(`Sleeper has no data for ${path}. Check the league ID.`);
  if (useCache) cache.set(path, body);
  return body;
}

const cents = (p: number | null | undefined) => Math.round((p ?? 0) * 100);

/** Pair a week's raw matchups by matchup_id. */
export function pairWeek(raw: RawMatchup[]): FinalMatchup[] {
  const byId = new Map<number, RawMatchup[]>();
  for (const m of raw) {
    if (m.matchup_id == null) continue;
    const list = byId.get(m.matchup_id) ?? [];
    list.push(m);
    byId.set(m.matchup_id, list);
  }
  const out: FinalMatchup[] = [];
  for (const [id, pair] of byId) {
    if (pair.length !== 2) continue;
    const [x, y] = pair[0].roster_id < pair[1].roster_id ? pair : [pair[1], pair[0]];
    out.push({
      id,
      a: x.roster_id,
      b: y.roster_id,
      pa: cents(x.custom_points ?? x.points),
      pb: cents(y.custom_points ?? y.points),
    });
  }
  return out.sort((p, q) => p.id - q.id);
}

export function toGame(week: number, m: FinalMatchup): Game {
  return {
    week,
    a: m.a,
    b: m.b,
    pa: m.pa,
    pb: m.pb,
    winner: m.pa > m.pb ? 'a' : m.pb > m.pa ? 'b' : 'tie',
  };
}

const played = (week: FinalMatchup[]) => week.some((m) => m.pa > 0 || m.pb > 0);

export function weekStatus(
  openWeek: number,
  leagueSeason: string,
  leagueStatus: string,
  state: { season: string; week: number; season_type: string },
): WeekStatus {
  if (leagueStatus === 'complete') return 'complete';
  const ls = Number(leagueSeason);
  const ss = Number(state.season);
  if (ss > ls) return 'complete';
  if (ss < ls) return 'upcoming';
  if (state.season_type === 'post' || state.week > openWeek) return 'complete';
  if (state.week === openWeek) return 'live';
  return 'upcoming';
}

export async function loadLeague(leagueId: string, requestedWeek?: number): Promise<League> {
  const [league, users, rosters, state] = await Promise.all([
    get<any>(`/league/${leagueId}`, true),
    get<any[]>(`/league/${leagueId}/users`, true),
    get<any[]>(`/league/${leagueId}/rosters`, true),
    get<any>(`/state/nfl`),
  ]);

  const playoffStart = Number(league.settings?.playoff_week_start) || 15;
  const finalWeek = playoffStart - 1;
  const openWeek = Math.min(finalWeek, Math.max(2, requestedWeek ?? finalWeek));
  const status = weekStatus(openWeek, league.season, league.status, state);

  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teams: Team[] = rosters
    .map((r) => {
      const u = usersById.get(r.owner_id);
      const avatar: string | null =
        u?.metadata?.avatar || (u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null);
      return {
        id: r.roster_id as number,
        name: (u?.metadata?.team_name as string) || u?.display_name || `Team ${r.roster_id}`,
        owner: u?.display_name ?? 'No owner',
        avatar,
      };
    })
    .sort((a, b) => a.id - b.id);

  const weeks = Array.from({ length: openWeek }, (_, k) => k + 1);
  const raw = await Promise.all(
    // Earlier weeks rarely change, so cache them; always refetch the open week.
    weeks.map((w) => get<RawMatchup[]>(`/league/${leagueId}/matchups/${w}`, w < openWeek && status !== 'upcoming')),
  );

  const games: Game[] = [];
  const unplayedWeeks: number[] = [];
  raw.slice(0, -1).forEach((r, k) => {
    const week = pairWeek(r);
    if (!played(week)) {
      unplayedWeeks.push(k + 1);
      return;
    }
    for (const m of week) games.push(toGame(k + 1, m));
  });

  return {
    id: leagueId,
    name: league.name,
    season: league.season,
    avatar: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
    finalWeek,
    openWeek,
    playoffTeams: Number(league.settings?.playoff_teams) || 6,
    teams,
    games,
    unplayedWeeks,
    matchups: pairWeek(raw[raw.length - 1]),
    status,
    fetchedAt: Date.now(),
  };
}
