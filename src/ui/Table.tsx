import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { Agg, Ranking, TieGroup } from '../logic/standings.ts';
import type { ScenarioResult } from '../logic/scenarios.ts';
import { explainTie, record, type NameOf } from '../logic/explain.ts';
import type { RosterId, Team } from '../model/types.ts';
import { Avatar, CutLine, oddsText } from './marks.tsx';

interface Props {
  teams: Map<RosterId, Team>;
  agg: Agg;
  ranking: Ranking;
  scen: ScenarioResult | null;
  playoffTeams: number;
  myTeam: RosterId | null;
  onPickTeam: (id: RosterId) => void;
}

function TieNote({ group, name }: { group: TieGroup; name: NameOf }) {
  const [open, setOpen] = useState(false);
  const ex = explainTie(group, name);
  const rec = record(group.record.w, group.record.l, group.record.t);
  return (
    <li class={`tie-note${open ? ' is-open' : ''}`}>
      <button class="tie-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Why this order?'} <span class="tie-count">{group.members.length} teams tied at {rec}</span>
      </button>
      {open && (
        <div class="tie-body">
          <table class="h2h">
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">vs tied</th>
                <th scope="col">Pts/gm vs tied</th>
                <th scope="col">Total pts</th>
              </tr>
            </thead>
            <tbody>
              {ex.members.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{name(m.id)}</th>
                  <td>{m.games ? m.record : 'none'}</td>
                  <td>{m.ppm ?? 'n/a'}</td>
                  <td>{m.pf}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul class="reasons">
            {ex.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function Table({ teams, agg, ranking, scen, playoffTeams, myTeam, onPickTeam }: Props) {
  const name = (id: RosterId) => teams.get(id)?.name ?? `Team ${id}`;
  const groupAt = new Map<number, TieGroup>();
  for (const g of ranking.groups) groupAt.set(g.start + g.members.length - 1, g);
  const tieRole = (pos: number) => {
    for (const g of ranking.groups) {
      const end = g.start + g.members.length - 1;
      if (pos === g.start) return ' tie-first';
      if (pos > g.start && pos < end) return ' tie-mid';
      if (pos === end) return ' tie-last';
    }
    return '';
  };

  return (
    <section class="panel" aria-labelledby="table-h">
      <h2 id="table-h" class="sr-only">League table</h2>
      <div class="table-head" aria-hidden="true">
        <span>Team</span>
        <span>W–L</span>
        <span>Pts</span>
        <span>Odds</span>
      </div>
      <ol class="table">
        {ranking.order.map((id, pos) => {
          const t = teams.get(id)!;
          const i = agg.index.get(id)!;
          const badge = scen?.badge.get(id);
          const group = groupAt.get(pos);
          return (
            <Fragment key={id}>
              <li
                class={`row${tieRole(pos)}${id === myTeam ? ' is-me' : ''}${badge === 'eliminated' ? ' is-out' : ''}${badge === 'clinched' ? ' is-in' : ''}`}
              >
                <button class="row-btn" onClick={() => onPickTeam(id)} aria-label={`${t.name}: open paths for this team`}>
                  <span class="pos">{pos + 1}</span>
                  <Avatar src={t.avatar} name={t.name} />
                  <span class="who">
                    <span class="team-name">{t.name}</span>
                    <span class="owner">{t.owner}</span>
                  </span>
                  <span class="num">{record(agg.w[i], agg.l[i], agg.t[i])}</span>
                  <span class="num pf">{(agg.pf[i] / 100).toFixed(1)}</span>
                  <span class={`num odds odds-${badge ?? 'none'}`}>{oddsText(scen?.odds.get(id), badge)}</span>
                </button>
              </li>
              {group && <TieNote group={group} name={name} />}
              {pos === playoffTeams - 1 && pos < ranking.order.length - 1 && <CutLine label="playoff line" />}
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}
