import type { RosterId, Team } from '../model/types.ts';
import { conditionalOdds, type ScenarioResult } from '../logic/scenarios.ts';
import { literalText, teamPaths, type PathTerm } from '../logic/explain.ts';
import { oddsText } from './marks.tsx';

interface Props {
  teams: Map<RosterId, Team>;
  order: RosterId[];
  scen: ScenarioResult;
  me: RosterId | null;
  week: number;
  picks: number;
  onPickTeam: (id: RosterId | null) => void;
}

const pct = (p: number) => (p >= 0.995 && p < 1 ? '>99%' : p <= 0.005 && p > 0 ? '<1%' : `${Math.round(p * 100)}%`);

function Terms({ terms, me, name }: { terms: PathTerm[]; me: RosterId; name: (id: RosterId) => string }) {
  return (
    <ol class="terms">
      {terms.map((t, k) => (
        <li key={k}>
          {k > 0 && <span class="or">or</span>}
          <span class="term">
            {t.literals.length === 0
              ? 'whatever happens'
              : t.literals.map((l, j) => (
                  <span key={j} class="lit">
                    {j > 0 && <span class="and"> and </span>}
                    {literalText(l, me, name)}
                  </span>
                ))}
          </span>
          {t.rivals.length > 0 && <span class="rivals">Points decide it against {t.rivals.map(name).join(', ')}</span>}
        </li>
      ))}
    </ol>
  );
}

export function Paths({ teams, order, scen, me, week, picks, onPickTeam }: Props) {
  const name = (id: RosterId) => teams.get(id)?.name ?? `Team ${id}`;
  const select = (
    <label class="team-select">
      <span>Team</span>
      <select
        value={me ?? ''}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          onPickTeam(v ? Number(v) : null);
        }}
      >
        <option value="">Choose a team</option>
        {order.map((id) => (
          <option key={id} value={id}>
            {name(id)}
          </option>
        ))}
      </select>
    </label>
  );

  if (me === null) {
    return (
      <section class="panel">
        {select}
        <p class="empty">Choose a team to see exactly what it needs in week {week}, and who to root for.</p>
      </section>
    );
  }

  const i = scen.ids.indexOf(me);
  const paths = teamPaths(scen, me);
  const odds = scen.odds.get(me) ?? 0;
  const badge = scen.badge.get(me);
  const cond = conditionalOdds(scen, i);
  const own = cond.find((c) => c.m.a === me || c.m.b === me);
  const others = cond
    .filter((c) => c !== own)
    .map((c) => {
      const delta = c.ifA - c.ifB;
      const fav = delta >= 0 ? c.m.a : c.m.b;
      const other = delta >= 0 ? c.m.b : c.m.a;
      return { c, delta: Math.abs(delta), fav, other };
    })
    .sort((x, y) => y.delta - x.delta);
  const matters = others.filter((o) => o.delta >= 0.005);
  const noMatter = others.filter((o) => o.delta < 0.005);

  return (
    <section class="panel paths">
      {select}
      <div class="verdict">
        <p class="hand verdict-line">
          {badge === 'clinched'
            ? `${name(me)} is in.`
            : badge === 'eliminated'
              ? `${name(me)} is out.`
              : `${name(me)} makes it in ${oddsText(odds, badge)} of simulations.`}
        </p>
        {picks > 0 && (
          <p class="note">
            Based on your {picks} {picks === 1 ? 'pick' : 'picks'} in week {week}.
          </p>
        )}
      </div>

      {own && badge === 'alive' && (
        <div class="own-game">
          <div>
            <span class="big num">{pct(own.m.a === me ? own.ifA : own.ifB)}</span>
            <span>if you win</span>
          </div>
          <div>
            <span class="big num">{pct(own.m.a === me ? own.ifB : own.ifA)}</span>
            <span>if you lose</span>
          </div>
        </div>
      )}

      {paths.kind === 'open' && (
        <>
          <h3>In for sure if</h3>
          {paths.inTerms.length ? <Terms terms={paths.inTerms} me={me} name={name} /> : <p class="note">No combination guarantees a place.</p>}
          {paths.ptsTerms.length > 0 && (
            <>
              <h3>Down to points if</h3>
              <Terms terms={paths.ptsTerms} me={me} name={name} />
            </>
          )}
          <p class="note">Any other combination and {name(me)} misses out.</p>
        </>
      )}

      {matters.length > 0 && (
        <>
          <h3>Who to root for</h3>
          <ul class="rooting">
            {matters.map(({ c, fav, other, delta }) => (
              <li key={c.m.id}>
                <span>
                  <strong>{name(fav)}</strong> over {name(other)}
                </span>
                <span class="num swing">+{Math.round(delta * 100)}</span>
              </li>
            ))}
          </ul>
          <p class="note">Numbers are the change in playoff odds, in percentage points.</p>
        </>
      )}
      {noMatter.length > 0 && badge === 'alive' && (
        <p class="note">Doesn't affect you: {noMatter.map((o) => `${name(o.c.m.a)} v ${name(o.c.m.b)}`).join('; ')}.</p>
      )}
    </section>
  );
}
