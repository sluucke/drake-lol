export const WHATS_NEW = [
  {
    version: '0.3.20',
    items: [
      {
        title: 'Reveal names in champ select chat',
        body: 'Team reveal posts a private name map in chat and rewrites message authors to Riot IDs while you are in champ select.',
        screen: 'queue',
      },
      {
        title: 'Credits',
        body: 'A ? next to Close opens credits for Drake and the tools that inspired it.',
      },
      {
        title: 'Fresh lobby W/L each queue',
        body: 'Match history is fetched without HTTP cache so your W/L updates after the last game.',
        screen: 'queue',
      },
      {
        title: 'Update prompt when auto-update is off',
        body: 'Starting Drake asks whether to install a newer release if automatic updates are disabled.',
        screen: 'settings',
      },
    ],
  },
  {
    version: '0.3.19',
    items: [
      {
        title: 'Reveal follows swaps with you',
        body: 'In-client team reveal remaps names when you trade cells with an ally, including when their identity is still obfuscated.',
        screen: 'queue',
      },
      {
        title: 'Auto Ban clear control',
        body: 'Selected ban shows as a chip with icon and ✕ — no need to search the champion again to deselect.',
        screen: 'auto-ban',
      },
      {
        title: 'Cancel Queue leaves search',
        body: 'Cancel Queue declines the ready check and also exits matchmaking search so you are fully out of queue.',
      },
    ],
  },
  {
    version: '0.3.18',
    items: [
      {
        title: 'Auto Pick by role',
        body: 'Choose up to 2 champions for Top, Jungle, Mid, ADC, and Support. Picks wait until your role is assigned — old global picks were cleared.',
        screen: 'auto-pick',
      },
      {
        title: 'Lobby reveal resets between games',
        body: 'Ally names from the last lobby no longer stick when you queue again; scrub only rewrites rows that still show our reveal.',
        screen: 'queue',
      },
    ],
  },
  {
    version: '0.3.17',
    items: [
      {
        title: 'Welcome tour',
        body: 'First open shows a short welcome with an optional spotlight tour of the Ctrl+D screens. Skip anytime.',
      },
      {
        title: 'What\'s New',
        body: 'After an update, Ctrl+D opens a changelog. Reopen it anytime from the sidebar; feature rows jump to that screen.',
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
    ],
  },
  {
    version: '0.3.16',
    items: [
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
