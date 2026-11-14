import type { Overrides, ReplayMode } from '../model/types.ts';

export interface UrlState {
  league?: string;
  mode?: ReplayMode;
  team?: number;
  overrides: Overrides;
}

/** Hash format: #l=<league>&m=a|b&t=<roster>&o=<matchup>.<winner>[.<ptsA>.<ptsB>],... (points in cents) */
export function readUrl(): UrlState {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
  const overrides: Overrides = {};
  for (const part of (p.get('o') ?? '').split(',').filter(Boolean)) {
    const [mid, w, pa, pb] = part.split('.').map(Number);
    if (!Number.isFinite(mid)) continue;
    overrides[mid] = {};
    if (Number.isFinite(w) && w > 0) overrides[mid].w = w;
    if (Number.isFinite(pa) && Number.isFinite(pb)) Object.assign(overrides[mid], { pa, pb });
  }
  const m = p.get('m');
  return {
    league: p.get('l') ?? undefined,
    mode: m === 'a' ? 'actual' : m === 'b' ? 'blank' : undefined,
    team: num('t'),
    overrides,
  };
}

export function writeUrl(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.league) p.set('l', s.league);
  if (s.mode) p.set('m', s.mode === 'actual' ? 'a' : 'b');
  if (s.team) p.set('t', String(s.team));
  const o = Object.entries(s.overrides)
    .map(([mid, ov]) => {
      const parts = [mid, String(ov.w ?? 0)];
      if (ov.pa !== undefined && ov.pb !== undefined) parts.push(String(ov.pa), String(ov.pb));
      return parts.join('.');
    })
    .join(',');
  if (o) p.set('o', o);
  const hash = p.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname);
  return location.href;
}
