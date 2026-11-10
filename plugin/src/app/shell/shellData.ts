export interface ScreenDef {
  id: string;
  label: string;
}

export interface CreditEntry {
  label: string;
  href: string;
}

export interface Credits {
  createdBy: CreditEntry;
  specialThanks: CreditEntry;
  inspiredBy: CreditEntry[];
  assets: CreditEntry;
  repoUrl: string;
}

export interface HostLabelInput {
  appVersion?: string | null;
  loaderVersion?: string | null;
}

export const SCREENS: ScreenDef[] = [
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

export const CREDITS: Credits = {
  createdBy: { label: 'David William', href: 'https://github.com/sluucke' },
  specialThanks: { label: 'SpeedLOL', href: 'https://www.twitch.tv/speedlol_' },
  inspiredBy: [
    { label: 'Tiamat', href: 'https://github.com/369gabriel/tiamat' },
    { label: 'Sona', href: 'https://github.com/WJZ-P/sona' },
  ],
  assets: { label: 'Community Dragon', href: 'https://www.communitydragon.org' },
  repoUrl: 'https://github.com/sluucke/drake-lol',
};

export function formatHostLabel({ appVersion, loaderVersion }: HostLabelInput): string {
  const host = loaderVersion ? `loader ${loaderVersion}` : 'in client';
  return `drake ${appVersion || '?'} · ${host}`;
}
