/**
 * Real-data check: final regular-season standings for the 2025 leagues, compared with
 * Sleeper's own records and playoff bracket. Run with `npm run verify`.
 */
import { loadLeague } from '../src/api/sleeper.ts';
import { tableGames, matchupRole } from '../src/model/season.ts';
import { Agg, rank } from '../src/logic/standings.ts';
import { explainTie, pts, record } from '../src/logic/explain.ts';
import { runScenarios } from '../src/logic/scenarios.ts';
import type { Game } from '../src/model/types.ts';

const LEAGUES = [
  ['Redraft 2025', '1233074781964750848'],
  ['Dynasty 2025', '1180474001524310016'],
];

for (const [label, id] of LEAGUES) {
  const league = await loadLeague(id);
  const name = (rid: number) => league.teams.find((t) => t.id === rid)!.name;
  const ids = league.teams.map((t) => t.id);
  const agg = Agg.from(ids, tableGames(league, 'actual', {}));
  const r = rank(agg);
  console.log(`\n=== ${label}: ${league.name}, final week ${league.openWeek}, status ${league.status}, top ${league.playoffTeams}`);
  r.order.forEach((rid, k) => {
    const i = agg.index.get(rid)!;
    const cut = k === league.playoffTeams - 1 ? '   ----- cut' : '';
    console.log(`${String(k + 1).padStart(2)}. ${name(rid).padEnd(28)} ${record(agg.w[i], agg.l[i], agg.t[i]).padEnd(7)} ${pts(agg.pf[i])}${cut}`);
  });
  for (const gr of r.groups) {
    const ex = explainTie(gr, name);
    console.log(`  Tie at ${record(gr.record.w, gr.record.l, gr.record.t)}:`);
    for (const reason of ex.reasons) console.log(`    - ${reason}`);
  }

  // Compare with Sleeper's roster records (which cover the regular season).
  const rosters: any[] = await (await fetch(`https://api.sleeper.app/v1/league/${id}/rosters`)).json();
  const mism = rosters.filter((ro) => {
    const i = agg.index.get(ro.roster_id)!;
    return ro.settings.wins !== agg.w[i] || ro.settings.losses !== agg.l[i] ||
      ro.settings.fpts * 100 + (ro.settings.fpts_decimal ?? 0) !== agg.pf[i];
  });
  console.log(mism.length ? `  Record/PF mismatches vs Sleeper: ${mism.map((m) => m.roster_id).join(', ')}` : '  W/L and PF match Sleeper for every team.');

  // Sleeper's playoff teams from the bracket's first two rounds.
  const bracket: any[] = await (await fetch(`https://api.sleeper.app/v1/league/${id}/winners_bracket`)).json();
  const inBracket = new Set<number>();
  for (const m of bracket) if (m.r <= 2) for (const t of [m.t1, m.t2]) if (typeof t === 'number') inBracket.add(t);
  const ours = new Set(r.order.slice(0, league.playoffTeams));
  const same = inBracket.size === ours.size && [...ours].every((t) => inBracket.has(t));
  console.log(same ? '  Playoff teams match Sleeper’s bracket.' : `  Playoff teams differ. Sleeper: ${[...inBracket].map(name).join(', ')}`);

  // Scenario engine as of the penultimate week (everything open).
  const roles = league.matchups.map((m) => matchupRole(league, 'blank', m, undefined));
  const t0 = performance.now();
  const res = runScenarios({
    ids,
    games: league.games,
    playoffTeams: league.playoffTeams,
    week: league.openWeek,
    fixed: roles.flatMap((x) => (x.kind === 'fixed' ? [x.game as Game] : [])),
    forced: [],
    open: league.matchups,
  });
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`  Before week ${league.openWeek} (${res.outcomes.length} outcomes, ${ms}ms):`);
  for (const rid of ids) {
    console.log(`    ${name(rid).padEnd(28)} ${(res.odds.get(rid)! * 100).toFixed(1).padStart(5)}%  ${res.badge.get(rid)}`);
  }
}
