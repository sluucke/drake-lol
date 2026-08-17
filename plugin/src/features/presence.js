// Rank, banner and badges -- all three are fields in the same chat presence
// blob, so they share one read-merge-write.
//
// The merge is the important part. `PUT /lol-chat/v1/me` replaces the `lol`
// block wholesale, so writing only the field being changed would drop level,
// challenge points, banner, party info and everything else the client is
// broadcasting. Every setter reads the current block first and merges into it.

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

/// The `lol` block, whichever shape the client returns it in.
///
/// It comes back as an object most of the time and as a JSON *string* in some
/// client states. Treating the string case as an object yields `{}`, and the
/// next merge would then wipe every existing key.
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
      // Deliberately no write: a merge built on nothing would blank the
      // entire presence, which is far worse than the change not applying.
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

    /// Empty strings, not deleted keys: the client stops overriding when the
    /// fields are present and blank. Removing them leaves the last override.
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
