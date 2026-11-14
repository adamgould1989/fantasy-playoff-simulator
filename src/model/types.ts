export type RosterId = number;

export interface Team {
  id: RosterId;
  name: string;
  owner: string;
  avatar: string | null;
}

export type Winner = 'a' | 'b' | 'tie';

/** A counted game. Points are integer hundredths (cents) to keep comparisons exact. */
export interface Game {
  week: number;
  a: RosterId;
  b: RosterId;
  pa: number;
  pb: number;
  winner: Winner;
}

/** A matchup in the week being simulated, with its current (live or actual) points in cents. */
export interface FinalMatchup {
  id: number;
  a: RosterId;
  b: RosterId;
  pa: number;
  pb: number;
}

/** User override for one matchup: a forced winner and/or custom points (cents). */
export interface Override {
  w?: RosterId;
  pa?: number;
  pb?: number;
}
export type Overrides = Record<number, Override>;

export type WeekStatus = 'upcoming' | 'live' | 'complete';

/** For a completed week: start with nothing decided, or with the real results filled in. */
export type ReplayMode = 'blank' | 'actual';

export interface League {
  id: string;
  name: string;
  season: string;
  avatar: string | null;
  finalWeek: number;
  /** The week being treated as the final regular-season week. */
  openWeek: number;
  playoffTeams: number;
  teams: Team[];
  /** Played games from weeks before openWeek. */
  games: Game[];
  /** Weeks before openWeek that have not been played yet. */
  unplayedWeeks: number[];
  matchups: FinalMatchup[];
  status: WeekStatus;
  fetchedAt: number;
}
