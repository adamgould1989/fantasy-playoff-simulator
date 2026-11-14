import { useState } from 'preact/hooks';
import type { FinalMatchup, League, Override, Overrides, ReplayMode, RosterId, Team } from '../model/types.ts';
import { basePoints, usesActual } from '../model/season.ts';
import type { ScenarioResult } from '../logic/scenarios.ts';
import { pts } from '../logic/explain.ts';
import { Avatar, Ring } from './marks.tsx';

interface Props {
  league: League;
  mode: ReplayMode;
  teams: Map<RosterId, Team>;
  overrides: Overrides;
  scen: ScenarioResult | null;
  inNow: RosterId[];
  myTeam: RosterId | null;
  onChange: (id: number, o: Override | undefined) => void;
  onReset: () => void;
}

function ScoreEditor({ m, o, teams, onSave }: { m: FinalMatchup; o?: Override; teams: Map<RosterId, Team>; onSave: (o: Override | undefined) => void }) {
  const [a, setA] = useState(o?.pa !== undefined ? pts(o.pa) : '');
  const [b, setB] = useState(o?.pb !== undefined ? pts(o.pb) : '');
  const valid = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0;
  const save = (e: Event) => {
    e.preventDefault();
    if (!valid(a) || !valid(b)) return;
    const pa = Math.round(Number(a) * 100);
    const pb = Math.round(Number(b) * 100);
    onSave({ pa, pb, w: pa > pb ? m.a : pb > pa ? m.b : undefined });
  };
  return (
    <form class="score-editor" onSubmit={save}>
      <label>
        <span>{teams.get(m.a)?.name}</span>
        <input inputMode="decimal" value={a} onInput={(e) => setA((e.target as HTMLInputElement).value)} placeholder="0.00" />
      </label>
      <label>
        <span>{teams.get(m.b)?.name}</span>
        <input inputMode="decimal" value={b} onInput={(e) => setB((e.target as HTMLInputElement).value)} placeholder="0.00" />
      </label>
      <button type="submit" class="btn" disabled={!valid(a) || !valid(b)}>
        Use these scores
      </button>
    </form>
  );
}

function MatchupCard(props: { m: FinalMatchup; k: number } & Omit<Props, 'onReset' | 'inNow'>) {
  const { m, league, mode, teams, overrides, scen, myTeam, onChange } = props;
  const [editing, setEditing] = useState(false);
  const o = overrides[m.id];
  const base = basePoints(league, mode, m);
  const shown = o?.pa !== undefined && o?.pb !== undefined ? { pa: o.pa, pb: o.pb } : base;
  const openIdx = scen?.open.findIndex((x) => x.id === m.id) ?? -1;
  const pA = openIdx >= 0 ? scen!.pa[openIdx] : null;

  // Who is circled: an explicit pick, otherwise the leader in live/actual scores.
  let winner: RosterId | null = o?.w ?? null;
  let auto = false;
  if (!winner && !o && base && base.pa !== base.pb) {
    winner = base.pa > base.pb ? m.a : m.b;
    auto = true;
  }
  const state = o?.pa !== undefined ? 'Your scores' : o?.w ? 'Your pick' : usesActual(league, mode) ? 'Final' : league.status === 'live' && base ? 'Live' : 'Open';

  const pick = (id: RosterId) => {
    if (o?.w === id && o.pa === undefined) onChange(m.id, undefined);
    else onChange(m.id, { w: id });
  };

  const side = (id: RosterId, p: number | undefined, prob: number | null) => {
    const t = teams.get(id)!;
    const isWinner = winner === id;
    return (
      <button
        class={`side${isWinner ? ' is-winner' : ''}${isWinner && auto ? ' is-auto' : ''}${winner && !isWinner ? ' is-loser' : ''}${id === myTeam ? ' is-me' : ''}`}
        aria-pressed={o?.w === id}
        onClick={() => pick(id)}
      >
        <Avatar src={t.avatar} name={t.name} />
        <span class="side-name">
          {isWinner && <Ring key={`${m.id}-${id}-${o?.w ?? 'auto'}`} />}
          <span>{t.name}</span>
        </span>
        <span class="num side-pts">{p !== undefined ? pts(p) : ''}</span>
        <span class="num side-prob">{prob !== null && !o ? `${Math.round(prob * 100)}%` : ''}</span>
      </button>
    );
  };

  return (
    <li class="card">
      <div class="card-top">
        <span class={`state state-${state.split(' ')[0].toLowerCase()}`}>{state}</span>
        <span class="card-actions">
          <button class="link" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            {editing ? 'Close' : 'Set scores'}
          </button>
          {o && (
            <button class="link" onClick={() => { onChange(m.id, undefined); setEditing(false); }}>
              Clear
            </button>
          )}
        </span>
      </div>
      {side(m.a, shown?.pa, pA)}
      {side(m.b, shown?.pb, pA === null ? null : 1 - pA)}
      {editing && (
        <ScoreEditor
          m={m}
          o={o}
          teams={teams}
          onSave={(next) => {
            onChange(m.id, next);
            setEditing(false);
          }}
        />
      )}
    </li>
  );
}

export function Week(props: Props) {
  const { league, teams, overrides, inNow, myTeam, onReset } = props;
  const picks = Object.keys(overrides).length;
  return (
    <section class="panel" aria-labelledby="week-h">
      <div class="in-now">
        <h2 id="week-h" class="hand">If it ended like this</h2>
        <ol class="in-list">
          {inNow.map((id) => (
            <li key={id} class={id === myTeam ? 'is-me' : ''}>
              {teams.get(id)?.name}
            </li>
          ))}
        </ol>
      </div>
      <p class="hint">Tap a team to pick the winner. Tap again to undo.</p>
      <ul class="cards">
        {league.matchups.map((m, k) => (
          <MatchupCard key={m.id} m={m} k={k} {...props} />
        ))}
      </ul>
      {picks > 0 && (
        <button class="btn btn-quiet" onClick={onReset}>
          Clear all {picks} {picks === 1 ? 'pick' : 'picks'}
        </button>
      )}
    </section>
  );
}
