export const SCREENS = [
  { id: 'auto-accept', label: 'Auto Accept' },
  { id: 'auto-pick', label: 'Auto Pick' },
  { id: 'auto-ban', label: 'Auto Ban' },
  { id: 'queue', label: 'Queue' },
  { id: 'status', label: 'Status' },
  { id: 'profile', label: 'Profile' },
  { id: 'friends', label: 'Friends' },
  { id: 'whats-new', label: "What's New" },
  { id: 'settings', label: 'Settings' },
];

export const CREDITS = {
  createdBy: { label: 'David William', href: 'https://github.com/sluucke' },
  specialThanks: { label: 'Bieelyi', href: 'https://twitch.tv/bieelyi' },
  inspiredBy: [
    { label: 'Tiamat', href: 'https://github.com/369gabriel/tiamat' },
    { label: 'Sona', href: 'https://github.com/WJZ-P/sona' },
  ],
  assets: { label: 'Community Dragon', href: 'https://www.communitydragon.org' },
  repoUrl: 'https://github.com/sluucke/drake-lol',
};

export function formatHostLabel({ appVersion, loaderVersion }) {
  const host = loaderVersion ? `loader ${loaderVersion}` : 'in client';
  return `drake ${appVersion || '?'} · ${host}`;
}
