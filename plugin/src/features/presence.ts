







import type { Lcu } from '../lcu';

export interface LolPresence {
  rankedLeagueTier?: string;
  rankedLeagueDivision?: string;
  rankedLeagueQueue?: string;
  challengeCrystalLevel?: string;
  challengeTokensSelected?: string;
  bannerIdSelected?: string;
  playerTitleSelected?: string;
  [key: string]: unknown;
}

export interface ChatMeResponse {
  lol?: LolPresence | string | null;
  availability?: string;
  statusMessage?: string;
  puuid?: string;
  platformId?: string;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

export interface PresenceRank {
  tier: string;
  division: string;
  queue: string;
}

export interface PresenceBadges {
  crystal?: string;
  titleId?: number | string;
}

export interface PresenceOption {
  id: string;
  label: string;
}

export interface Presence {
  merge(fields: LolPresence): Promise<ActionResult>;
  setRank(rank: PresenceRank): Promise<ActionResult>;
  clearRank(): Promise<ActionResult>;
  setBanner(id: number | string): Promise<ActionResult>;
  setBadges(badges: PresenceBadges): Promise<ActionResult>;
  setAvailability(availability: string): Promise<ActionResult>;
}

export const CHAT_ME = '/lol-chat/v1/me';

export const TIERS = [
  'CHALLENGER',
  'GRANDMASTER',
  'MASTER',
  'DIAMOND',
  'EMERALD',
  'PLATINUM',
  'GOLD',
  'SILVER',
  'BRONZE',
  'IRON',
];

export const DIVISIONS = ['I', 'II', 'III', 'IV'];

export const QUEUES: PresenceOption[] = [
  { id: 'RANKED_SOLO_5x5', label: 'Solo/Duo' },
  { id: 'RANKED_FLEX_SR', label: 'Flex' },
  { id: 'RANKED_TFT', label: 'TFT' },
];

export const AVAILABILITIES: PresenceOption[] = [
  { id: 'chat', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'dnd', label: 'Busy' },
];

export const CRYSTALS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
];






export function readLol(me: ChatMeResponse | null | undefined): LolPresence {
  const lol = me && me.lol;
  if (!lol) return {};
  if (typeof lol === 'string') {
    try {
      return JSON.parse(lol) as LolPresence;
    } catch {
      return {};
    }
  }
  return typeof lol === 'object' ? lol : {};
}

export function makePresence({ lcu }: { lcu: Pick<Lcu, 'get' | 'put'> }): Presence {
  async function merge(fields: LolPresence): Promise<ActionResult> {
    let current: LolPresence;
    try {
      current = readLol(await lcu.get<ChatMeResponse | null>(CHAT_ME));
    } catch (e) {
      
      
      return { ok: false, reason: `could not read your presence (${(e as Error).message})` };
    }

    try {
      const res = await lcu.put(CHAT_ME, { lol: { ...current, ...fields } });
      if (res && res.ok === false) {
        return { ok: false, reason: `the client refused it (${res.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
    }
  }

  return {
    merge,

    setRank({ tier, division, queue }) {
      return merge({
        rankedLeagueTier: tier,
        rankedLeagueDivision: division,
        rankedLeagueQueue: queue,
      });
    },

    
    
    clearRank() {
      return merge({
        rankedLeagueTier: '',
        rankedLeagueDivision: '',
        rankedLeagueQueue: '',
      });
    },

    setBanner(id) {
      return merge({ bannerIdSelected: String(id) });
    },

    setBadges({ crystal, titleId }) {
      const fields: LolPresence = {};
      if (crystal !== undefined) fields.challengeCrystalLevel = crystal;
      if (titleId !== undefined) fields.playerTitleSelected = String(titleId);
      return merge(fields);
    },

    async setAvailability(availability) {
      try {
        const res = await lcu.put(CHAT_ME, { availability });
        if (res && res.ok === false) {
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
      }
    },
  };
}
