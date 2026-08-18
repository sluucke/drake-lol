







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

export const QUEUES = [
  { id: 'RANKED_SOLO_5x5', label: 'Solo/Duo' },
  { id: 'RANKED_FLEX_SR', label: 'Flex' },
  { id: 'RANKED_TFT', label: 'TFT' },
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






export function readLol(me) {
  const lol = me && me.lol;
  if (!lol) return {};
  if (typeof lol === 'string') {
    try {
      return JSON.parse(lol);
    } catch {
      return {};
    }
  }
  return typeof lol === 'object' ? lol : {};
}

export function makePresence({ lcu }) {
  async function merge(fields) {
    let current;
    try {
      current = readLol(await lcu.get(CHAT_ME));
    } catch (e) {
      
      
      return { ok: false, reason: `could not read your presence (${e.message})` };
    }

    try {
      const res = await lcu.put(CHAT_ME, { lol: { ...current, ...fields } });
      if (res && res.ok === false) {
        return { ok: false, reason: `the client refused it (${res.status})` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `could not reach the client (${e.message})` };
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
      const fields = {};
      if (crystal !== undefined) fields.challengeCrystalLevel = crystal;
      if (titleId !== undefined) fields.playerTitleSelected = String(titleId);
      return merge(fields);
    },
  };
}
