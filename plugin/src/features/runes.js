const TAG = '[Drake]';

export const RUNES_PAGES_ROUTE = '/lol-perks/v1/pages';
export const RUNES_CURRENT_PAGE_ROUTE = '/lol-perks/v1/currentpage';
export const PERKS_ROUTE = '/lol-game-data/assets/v1/perks.json';
export const PERK_STYLES_ROUTE = '/lol-game-data/assets/v1/perkstyles.json';

export const STYLE_NAMES = {
  8000: 'Precision',
  8100: 'Domination',
  8200: 'Sorcery',
  8300: 'Inspiration',
  8400: 'Resolve',
};

export const STYLE_ICONS = {
  8000: '/lol-game-data/assets/v1/perk-images/Styles/7201_Precision.png',
  8100: '/lol-game-data/assets/v1/perk-images/Styles/7200_Domination.png',
  8200: '/lol-game-data/assets/v1/perk-images/Styles/7202_Sorcery.png',
  8300: '/lol-game-data/assets/v1/perk-images/Styles/7203_Whimsy.png',
  8400: '/lol-game-data/assets/v1/perk-images/Styles/7204_Resolve.png',
};

export const PERK_PATHS = {
  // Precision
  8005: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png',
  8008: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
  8021: 'perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png',
  8010: 'perk-images/Styles/Precision/Conqueror/Conqueror.png',
  9101: 'perk-images/Styles/Precision/AbsorbLife/AbsorbLife.png',
  9102: 'perk-images/Styles/Precision/Overheal.png',
  9111: 'perk-images/Styles/Precision/Triumph.png',
  8009: 'perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png',
  9104: 'perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png',
  9105: 'perk-images/Styles/Precision/LegendHaste/LegendHaste.png',
  9103: 'perk-images/Styles/Precision/LegendBloodline/LegendBloodline.png',
  8014: 'perk-images/Styles/Precision/CoupDeGrace/CoupDeGrace.png',
  8017: 'perk-images/Styles/Precision/CutDown/CutDown.png',
  8299: 'perk-images/Styles/Precision/LastStand/LastStand.png',

  // Domination
  8112: 'perk-images/Styles/Domination/Electrocute/Electrocute.png',
  8124: 'perk-images/Styles/Domination/Predator/Predator.png',
  8128: 'perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png',
  9923: 'perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png',
  8126: 'perk-images/Styles/Domination/CheapShot/CheapShot.png',
  8139: 'perk-images/Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png',
  8143: 'perk-images/Styles/Domination/SuddenImpact/SuddenImpact.png',
  8136: 'perk-images/Styles/Domination/ZombieWard/ZombieWard.png',
  8120: 'perk-images/Styles/Domination/GhostPoro/GhostPoro.png',
  8138: 'perk-images/Styles/Domination/EyeballCollection/EyeballCollection.png',
  8137: 'perk-images/Styles/Domination/SixthSense/SixthSense.png',
  8140: 'perk-images/Styles/Domination/GrislyMementos/GrislyMementos.png',
  8141: 'perk-images/Styles/Domination/DeepWard/DeepWard.png',
  8135: 'perk-images/Styles/Domination/TreasureHunter/TreasureHunter.png',
  8134: 'perk-images/Styles/Domination/IngeniousHunter/IngeniousHunter.png',
  8105: 'perk-images/Styles/Domination/RelentlessHunter/RelentlessHunter.png',
  8106: 'perk-images/Styles/Domination/UltimateHunter/UltimateHunter.png',

  // Sorcery
  8214: 'perk-images/Styles/Sorcery/SummonAery/SummonAery.png',
  8229: 'perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png',
  8230: 'perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png',
  8224: 'perk-images/Styles/Sorcery/NullifyingOrb/Pokeshield.png',
  8226: 'perk-images/Styles/Sorcery/ManaflowBand/ManaflowBand.png',
  8275: 'perk-images/Styles/Sorcery/NimbusCloak/6361.png',
  8210: 'perk-images/Styles/Sorcery/Transcendence/Transcendence.png',
  8234: 'perk-images/Styles/Sorcery/Celerity/CelerityTemp.png',
  8233: 'perk-images/Styles/Sorcery/AbsoluteFocus/AbsoluteFocus.png',
  8237: 'perk-images/Styles/Sorcery/Scorch/Scorch.png',
  8232: 'perk-images/Styles/Sorcery/Waterwalking/Waterwalking.png',
  8236: 'perk-images/Styles/Sorcery/GatheringStorm/GatheringStorm.png',

  // Inspiration
  8351: 'perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png',
  8360: 'perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png',
  8369: 'perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png',
  8306: 'perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png',
  8304: 'perk-images/Styles/Inspiration/MagicalFootwear/MagicalFootwear.png',
  8321: 'perk-images/Styles/Inspiration/CashBack/CashBack.png',
  8313: 'perk-images/Styles/Inspiration/PerfectTiming/AlchemistCabinet.png',
  8316: 'perk-images/Styles/Inspiration/JackOfAllTrades/JackofAllTrades2.png',
  8345: 'perk-images/Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png',
  8347: 'perk-images/Styles/Inspiration/CosmicInsight/CosmicInsight.png',
  8410: 'perk-images/Styles/Resolve/ApproachVelocity/ApproachVelocity.png',
  8352: 'perk-images/Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png',

  // Resolve
  8437: 'perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png',
  8439: 'perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png',
  8465: 'perk-images/Styles/Resolve/Guardian/Guardian.png',
  8446: 'perk-images/Styles/Resolve/Demolish/Demolish.png',
  8463: 'perk-images/Styles/Resolve/FontOfLife/FontOfLife.png',
  8401: 'perk-images/Styles/Resolve/MirrorShell/MirrorShell.png',
  8429: 'perk-images/Styles/Resolve/Conditioning/Conditioning.png',
  8444: 'perk-images/Styles/Resolve/SecondWind/SecondWind.png',
  8473: 'perk-images/Styles/Resolve/BonePlating/BonePlating.png',
  8451: 'perk-images/Styles/Resolve/Overgrowth/Overgrowth.png',
  8453: 'perk-images/Styles/Resolve/Revitalize/Revitalize.png',
  8242: 'perk-images/Styles/Sorcery/Unflinching/Unflinching.png',

  // Stat mods
  5001: 'perk-images/StatMods/StatModsHealthScalingIcon.png',
  5002: 'perk-images/StatMods/StatModsArmorIcon.png',
  5003: 'perk-images/StatMods/StatModsMagicResIcon.png',
  5005: 'perk-images/StatMods/StatModsAttackSpeedIcon.png',
  5007: 'perk-images/StatMods/StatModsCDRIcon.png',
  5008: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png',
  5010: 'perk-images/StatMods/StatModsMovementSpeedIcon.png',
  5011: 'perk-images/StatMods/StatModsHealthFlatIcon.png',
  5012: 'perk-images/StatMods/StatModsTenacityIcon.png',
  5013: 'perk-images/StatMods/StatModsTenacityIcon.png',
};

export const PERK_NAMES = {
  8005: 'Press the Attack',
  8008: 'Lethal Tempo',
  8021: 'Fleet Footwork',
  8010: 'Conqueror',
  9101: 'Absorb Life',
  9102: 'Overheal',
  9111: 'Triumph',
  8009: 'Presence of Mind',
  9104: 'Legend: Alacrity',
  9105: 'Legend: Haste',
  9103: 'Legend: Bloodline',
  8014: 'Coup de Grace',
  8017: 'Cut Down',
  8299: 'Last Stand',
  8112: 'Electrocute',
  8124: 'Predator',
  8128: 'Dark Harvest',
  9923: 'Hail of Blades',
  8126: 'Cheap Shot',
  8139: 'Taste of Blood',
  8143: 'Sudden Impact',
  8136: 'Zombie Ward',
  8120: 'Ghost Poro',
  8138: 'Eyeball Collection',
  8137: 'Sixth Sense',
  8140: 'Grisly Mementos',
  8141: 'Deep Ward',
  8135: 'Treasure Hunter',
  8134: 'Ingenious Hunter',
  8105: 'Relentless Hunter',
  8106: 'Ultimate Hunter',
  8214: 'Summon Aery',
  8229: 'Arcane Comet',
  8230: 'Phase Rush',
  8224: 'Nullifying Orb',
  8226: 'Manaflow Band',
  8275: 'Nimbus Cloak',
  8210: 'Transcendence',
  8234: 'Celerity',
  8233: 'Absolute Focus',
  8237: 'Scorch',
  8232: 'Waterwalking',
  8236: 'Gathering Storm',
  8351: 'Glacial Augment',
  8360: 'Unsealed Spellbook',
  8369: 'First Strike',
  8306: 'Hextech Flashtraption',
  8304: 'Magical Footwear',
  8321: 'Cash Back',
  8313: 'Triple Tonic',
  8316: 'Jack of All Trades',
  8345: 'Biscuit Delivery',
  8347: 'Cosmic Insight',
  8410: 'Approach Velocity',
  8352: 'Time Warp Tonic',
  8437: 'Grasp of the Undying',
  8439: 'Aftershock',
  8465: 'Guardian',
  8446: 'Demolish',
  8463: 'Font of Life',
  8401: 'Shield Bash',
  8429: 'Conditioning',
  8444: 'Second Wind',
  8473: 'Bone Plating',
  8451: 'Overgrowth',
  8453: 'Revitalize',
  8242: 'Unflinching',
  5001: 'Health Scaling',
  5002: 'Armor',
  5003: 'Magic Resist',
  5005: 'Attack Speed',
  5007: 'Ability Haste',
  5008: 'Adaptive Force',
  5010: 'Movement Speed',
  5011: 'Health',
  5012: 'Tenacity',
  5013: 'Tenacity',
};

const perks = new Map();
const perkStyles = new Map();
let runeAssetsLoaded = false;
let runeAssetsLoading = null;

function ingestPerks(list) {
  if (!Array.isArray(list)) return 0;
  let count = 0;
  for (const entry of list) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    perks.set(id, {
      name: String(entry?.name || ''),
      iconPath: String(entry?.iconPath || '').toLowerCase(),
    });
    count += 1;
  }
  return count;
}

function ingestPerkStyles(payload) {
  const list = Array.isArray(payload?.styles) ? payload.styles : [];
  let count = 0;
  for (const entry of list) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    perkStyles.set(id, {
      name: String(entry?.name || ''),
      iconPath: String(entry?.iconPath || '').toLowerCase(),
    });
    count += 1;
  }
  return count;
}

export function resetRuneAssets() {
  perks.clear();
  perkStyles.clear();
  runeAssetsLoaded = false;
  runeAssetsLoading = null;
}

// Perk icon/name paths drift across patches (Riot renames files), so the
// PERK_PATHS/STYLE_ICONS maps below are only a fallback for before this load
// resolves (or for a perk it doesn't yet know about). The LCU's own game-data
// manifest is authoritative and always matches the running patch.
export async function loadRuneAssets(lcu) {
  if (runeAssetsLoaded) return true;
  if (runeAssetsLoading) return runeAssetsLoading;

  runeAssetsLoading = (async () => {
    try {
      const [perkList, styleList] = await Promise.all([
        lcu.get(PERKS_ROUTE),
        lcu.get(PERK_STYLES_ROUTE),
      ]);
      const perkCount = ingestPerks(perkList);
      ingestPerkStyles(styleList);
      runeAssetsLoaded = perkCount > 0;
      if (!runeAssetsLoaded) console.warn(TAG, 'rune assets loaded but contained no perks');
      return runeAssetsLoaded;
    } catch (err) {
      console.warn(TAG, 'failed to load rune assets:', err?.message || err);
      resetRuneAssets();
      return false;
    } finally {
      runeAssetsLoading = null;
    }
  })();

  return runeAssetsLoading;
}

export function perkStyleName(styleId) {
  const id = Number(styleId);
  const dynamic = perkStyles.get(id)?.name;
  return dynamic || STYLE_NAMES[id] || `Tree ${styleId}`;
}

export function perkStyleIconUrl(styleId) {
  const sid = Number(styleId);
  const dynamic = perkStyles.get(sid)?.iconPath;
  return dynamic || STYLE_ICONS[sid] || `/lol-game-data/assets/v1/perk-images/Styles/${sid}.png`;
}

export function perkRelativePath(perkId) {
  const id = Number(perkId);
  return PERK_PATHS[id] || `perk-images/${id}.png`;
}

export function perkCdnUrl(perkId) {
  const path = perkRelativePath(perkId);
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/${path}`;
}

export function perkIconUrl(perkId) {
  const id = Number(perkId);
  const dynamic = perks.get(id)?.iconPath;
  if (dynamic) return dynamic;
  const path = PERK_PATHS[id];
  if (path) {
    return `/lol-game-data/assets/v1/${path}`;
  }
  return `/lol-game-data/assets/v1/perk-images/${id}.png`;
}

export function perkName(perkId) {
  const id = Number(perkId);
  const dynamic = perks.get(id)?.name;
  return dynamic || PERK_NAMES[id] || `Rune ${id}`;
}

export function formatRunePagePayload(name, primaryStyleId, subStyleId, selectedPerkIds) {
  return {
    name: name ? String(name) : 'Drake',
    primaryStyleId: Number(primaryStyleId) || 0,
    subStyleId: Number(subStyleId) || 0,
    selectedPerkIds: Array.isArray(selectedPerkIds) ? selectedPerkIds.map((id) => Number(id) || 0) : [],
    current: true,
    isActive: true,
  };
}

async function parseResponse(res, fallbackId) {
  if (!res) {
    return { success: true, ...(fallbackId !== undefined ? { pageId: fallbackId } : {}) };
  }
  if (res.ok === false) {
    return { success: false, error: `LCU returned status ${res.status || 'unknown'}` };
  }
  if (typeof res.json === 'function') {
    try {
      const data = await res.json();
      const pageId = data?.id ?? fallbackId;
      return { success: true, ...(pageId !== undefined ? { pageId } : {}) };
    } catch {
      return { success: true, ...(fallbackId !== undefined ? { pageId: fallbackId } : {}) };
    }
  }
  const pageId = res.id ?? fallbackId;
  return { success: true, ...(pageId !== undefined ? { pageId } : {}) };
}

export async function applyRunePage(lcu, pageData) {
  if (!lcu) {
    return { success: false, error: 'LCU client is required' };
  }

  const payload = formatRunePagePayload(
    pageData?.name,
    pageData?.primaryStyleId,
    pageData?.subStyleId,
    pageData?.selectedPerkIds
  );

  try {
    let pages = [];
    try {
      const res = await lcu.get(RUNES_PAGES_ROUTE);
      if (Array.isArray(res)) {
        pages = res;
      }
    } catch {
      pages = [];
    }

    const editablePage = pages.find((p) => p && (p.isDeletable || p.isEditable || p.isCustom));

    if (editablePage && editablePage.id !== undefined && editablePage.id !== null) {
      try {
        const updateRes = await lcu.put(`${RUNES_PAGES_ROUTE}/${editablePage.id}`, payload);
        if (!updateRes || updateRes.ok !== false) {
          const parsed = await parseResponse(updateRes, editablePage.id);
          if (parsed.success) {
            return parsed;
          }
        }
      } catch {
      }

      try {
        if (typeof lcu.delete === 'function') {
          await lcu.delete(`${RUNES_PAGES_ROUTE}/${editablePage.id}`);
        }
      } catch {
      }
    }

    const createRes = await lcu.post(RUNES_PAGES_ROUTE, payload);
    if (!createRes || createRes.ok !== false) {
      return await parseResponse(createRes);
    }
    return { success: false, error: `Failed to create rune page (${createRes.status || 'error'})` };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to apply rune page' };
  }
}
