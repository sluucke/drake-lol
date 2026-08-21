export const WHATS_NEW = [
  {
    version: '0.3.16',
    items: [
      {
        title: 'Welcome & What\'s New',
        body: 'First-time welcome tour and a changelog after updates. Reopen What\'s New anytime from the sidebar.',
        screen: 'whats-new',
      },
      {
        title: 'Reveal follows role swaps',
        body: 'In-client team reveal remaps names when players trade cells in champ select.',
        screen: 'queue',
      },
      {
        title: 'Ranked pool controls',
        body: 'Choose Solo+Flex, current queue, or any queue for recent games, plus sample size, last-5 pool, and fetch concurrency.',
        screen: 'queue',
      },
      {
        title: 'Pick WR on cards',
        body: 'Reveal cards show games and win rate for the champion they locked.',
        screen: 'queue',
      },
      {
        title: 'Champ select dodge',
        body: 'Optional in-client dodge button (on by default) from Queue settings.',
        screen: 'queue',
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
