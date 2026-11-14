import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadLeague } from '../api/sleeper.ts';
import type { Game, League, Override, Overrides, ReplayMode, RosterId } from '../model/types.ts';
import { matchupRole, tableGames } from '../model/season.ts';
import { Agg, rank } from '../logic/standings.ts';
import { runScenarios, type ScenarioInput, type ScenarioResult } from '../logic/scenarios.ts';
import { readUrl, writeUrl } from '../state/url.ts';
import { Table } from './Table.tsx';
import { Week } from './Week.tsx';
import { Paths } from './Paths.tsx';

const PRESETS = [
  { id: '1312885134466256896', label: 'Redraft 2026' },
  { id: '1312401717450522624', label: 'Dynasty 2026' },
  { id: '1233074781964750848', label: 'Redraft 2025' },
  { id: '1180474001524310016', label: 'Dynasty 2025' },
];

type Tab = 'table' | 'week' | 'paths';

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const initial = readUrl();

export function App() {
  const [leagueId, setLeagueId] = useState(initial.league ?? store.get('league') ?? PRESETS[0].id);
  const [mode, setMode] = useState<ReplayMode>(initial.mode ?? 'blank');
  const [overrides, setOverrides] = useState<Overrides>(initial.overrides);
  const [myTeam, setMyTeam] = useState<RosterId | null>(
    initial.team ?? (Number(store.get(`team:${initial.league ?? store.get('league')}`)) || null),
  );
  const [tab, setTab] = useState<Tab>('table');
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otherId, setOtherId] = useState('');
  const [copied, setCopied] = useState(false);

  const load = (keepOverrides: boolean) => {
    setLoading(true);
    setError(null);
    loadLeague(leagueId)
      .then((l) => {
        setLeague(l);
        if (!keepOverrides) setOverrides({});
        store.set('league', leagueId);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // Load on league change. Overrides from the URL survive the first load only.
  const [firstLoad, setFirstLoad] = useState(true);
  useEffect(() => {
    load(firstLoad);
    setFirstLoad(false);
  }, [leagueId]);

  useEffect(() => {
    writeUrl({ league: leagueId, mode: league?.status === 'complete' ? mode : undefined, team: myTeam ?? undefined, overrides });
  }, [leagueId, mode, myTeam, overrides, league]);

  const switchLeague = (id: string) => {
    if (id === leagueId) return;
    setLeague(null);
    setOverrides({});
    setMyTeam(Number(store.get(`team:${id}`)) || null);
    setLeagueId(id);
  };

  const pickTeam = (id: RosterId | null) => {
    setMyTeam(id);
    store.set(`team:${leagueId}`, id === null ? null : String(id));
  };

  const teams = useMemo(() => new Map(league?.teams.map((t) => [t.id, t]) ?? []), [league]);

  const table = useMemo(() => {
    if (!league) return null;
    const agg = Agg.from(league.teams.map((t) => t.id), tableGames(league, mode, overrides));
    return { agg, ranking: rank(agg) };
  }, [league, mode, overrides]);

  const scen: ScenarioResult | null = useMemo(() => {
    if (!league) return null;
    const fixed: Game[] = [];
    const forced: ScenarioInput['forced'] = [];
    const open: League['matchups'] = [];
    for (const m of league.matchups) {
      const r = matchupRole(league, mode, m, overrides[m.id]);
      if (r.kind === 'fixed') fixed.push(r.game);
      else if (r.kind === 'winner') forced.push({ m, winner: r.winner });
      else open.push(m);
    }
    if (open.length > 10) return null;
    return runScenarios({
      ids: league.teams.map((t) => t.id),
      games: league.games,
      playoffTeams: league.playoffTeams,
      week: league.openWeek,
      fixed,
      forced,
      open,
    });
  }, [league, mode, overrides]);

  const setOverride = (id: number, o: Override | undefined) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (o) next[id] = o;
      else delete next[id];
      return next;
    });
  };

  const share = async () => {
    const url = writeUrl({ league: leagueId, mode: league?.status === 'complete' ? mode : undefined, team: myTeam ?? undefined, overrides });
    const title = `${league?.name ?? 'League'}: week ${league?.openWeek} scenarios`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share cancelled */
    }
  };

  const fetchedAt = league ? new Date(league.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const picks = Object.keys(overrides).length;

  return (
    <div class="app">
      <header class="masthead">
        <nav class="leagues" aria-label="Leagues">
          {PRESETS.map((p) => (
            <button key={p.id} class={`chip${p.id === leagueId ? ' is-active' : ''}`} aria-pressed={p.id === leagueId} onClick={() => switchLeague(p.id)}>
              {p.label}
            </button>
          ))}
          <form
            class="other"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{6,}$/.test(otherId.trim())) switchLeague(otherId.trim());
            }}
          >
            <input
              inputMode="numeric"
              placeholder="Other league ID"
              aria-label="Other Sleeper league ID"
              value={otherId}
              onInput={(e) => setOtherId((e.target as HTMLInputElement).value)}
            />
          </form>
        </nav>

        {league && (
          <div class="title-block">
            <p class="league-name">
              {league.name} <span class="season">{league.season}</span>
            </p>
            <h1 class="hand title">Week {league.openWeek}: who's in?</h1>
            <p class="status">
              {league.status === 'live' && <>Week {league.openWeek} is being played. Scores as of {fetchedAt}. </>}
              {league.status === 'upcoming' && <>Week {league.openWeek} hasn't started. </>}
              {league.status === 'complete' && <>Week {league.openWeek} is over. Replay it from the start, or load the real results. </>}
              Top {league.playoffTeams} make the playoffs.
            </p>
            <div class="controls">
              {league.status === 'complete' && (
                <div class="seg" role="group" aria-label="Week results">
                  <button aria-pressed={mode === 'blank'} class={mode === 'blank' ? 'is-active' : ''} onClick={() => setMode('blank')}>
                    Start blank
                  </button>
                  <button aria-pressed={mode === 'actual'} class={mode === 'actual' ? 'is-active' : ''} onClick={() => setMode('actual')}>
                    Real results
                  </button>
                </div>
              )}
              {league.status !== 'complete' && (
                <button class="btn btn-quiet" onClick={() => load(true)} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh scores'}
                </button>
              )}
            </div>
            {league.unplayedWeeks.length > 0 && (
              <p class="banner">
                Weeks {league.unplayedWeeks[0]}–{league.unplayedWeeks[league.unplayedWeeks.length - 1]} haven't been played yet, so
                they're left out. This page is most useful once week {league.openWeek - 1} is done.
              </p>
            )}
            {league.status === 'live' && <p class="note">Odds treat unfinished games as open and use season scoring averages, not live scores.</p>}
          </div>
        )}
      </header>

      {league && (
        <nav class="tabs" aria-label="Views">
          <button class={tab === 'table' ? 'is-active' : ''} aria-current={tab === 'table' ? 'page' : undefined} onClick={() => setTab('table')}>
            Table
          </button>
          <button class={tab === 'week' ? 'is-active' : ''} aria-current={tab === 'week' ? 'page' : undefined} onClick={() => setTab('week')}>
            Week {league.openWeek}
            {picks > 0 && <span class="pip">{picks}</span>}
          </button>
          <button class={tab === 'paths' ? 'is-active' : ''} aria-current={tab === 'paths' ? 'page' : undefined} onClick={() => setTab('paths')}>
            Paths
          </button>
        </nav>
      )}

      <main>
        {error && (
          <div class="banner banner-error" role="alert">
            <p>Couldn't load this league. {error}</p>
            <button class="btn" onClick={() => load(true)}>
              Try again
            </button>
          </div>
        )}
        {!league && !error && <p class="loading hand">Drawing up the board…</p>}
        {league && table && (
          <>
            {tab === 'table' && (
              <Table
                teams={teams}
                agg={table.agg}
                ranking={table.ranking}
                scen={scen}
                playoffTeams={league.playoffTeams}
                myTeam={myTeam}
                onPickTeam={(id) => {
                  pickTeam(id);
                  setTab('paths');
                }}
              />
            )}
            {tab === 'week' && (
              <Week
                league={league}
                mode={mode}
                teams={teams}
                overrides={overrides}
                scen={scen}
                inNow={table.ranking.order.slice(0, league.playoffTeams)}
                myTeam={myTeam}
                onChange={setOverride}
                onReset={() => setOverrides({})}
              />
            )}
            {tab === 'paths' && scen && (
              <Paths teams={teams} order={table.ranking.order} scen={scen} me={myTeam} week={league.openWeek} picks={picks} onPickTeam={pickTeam} />
            )}
            <div class="share-row">
              <button class="btn" onClick={share}>
                {copied ? 'Link copied' : 'Share this scenario'}
              </button>
            </div>
          </>
        )}
      </main>

    </div>
  );
}
