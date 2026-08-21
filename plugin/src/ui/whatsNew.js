export const WHATS_NEW = [
  {
    version: '0.3.16',
    items: [
      {
        title: 'Welcome & What\'s New',
        body: 'First-time welcome tour and a changelog screen after updates. Open What\'s New anytime from the sidebar.',
        screen: 'whats-new',
      },
      {
        title: 'Presence lock',
        body: 'Keep Online, Offline, Mobile, or Busy sticky from the Status screen.',
        screen: 'status',
      },
    ],
  },
];

export function compareSemver(a, b) {
  const pa = String(a || '').split('.').map((n) => Number(n) || 0);
  const pb = String(b || '').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function pickWhatsNew(entries, version) {
  const list = Array.isArray(entries) ? entries : [];
  const exact = list.find((e) => e.version === version);
  if (exact) return exact;
  let best = null;
  for (const e of list) {
    if (compareSemver(e.version, version) <= 0) {
      if (!best || compareSemver(e.version, best.version) > 0) best = e;
    }
  }
  return best;
}
