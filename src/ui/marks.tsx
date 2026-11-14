/** Hand-drawn marker marks: a ring around a picked winner and the playoff cut line. */

export function Ring() {
  return (
    <svg class="ring" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M14 34 C 10 12, 70 4, 120 6 C 170 8, 196 20, 190 36 C 184 52, 120 58, 70 55 C 28 52, 6 44, 16 26 C 22 16, 40 11, 56 9"
        pathLength="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

export function CutLine({ label }: { label: string }) {
  return (
    <li class="cut" aria-label={label}>
      <svg viewBox="0 0 400 16" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M2 9 C 40 5, 80 12, 130 8 S 220 4, 270 9 S 360 12, 398 7"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span>{label}</span>
    </li>
  );
}

export function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    <img class="avatar" src={src} alt="" loading="lazy" width={28} height={28} />
  ) : (
    <span class="avatar avatar-blank" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function oddsText(p: number | undefined, badge: string | undefined): string {
  if (badge === 'clinched') return 'In';
  if (badge === 'eliminated') return 'Out';
  if (p === undefined) return '';
  if (p >= 0.995) return '>99%';
  if (p <= 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}
