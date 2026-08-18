












const BASE = '/fe/lol-static-assets/sounds';

export function soundUrl(name) {
  return `${BASE}/${name}.ogg`;
}

export const SFX = {
  click: 'sfx-uikit-button-gold-click',
  goldHover: 'sfx-uikit-button-gold-hover',
  hover: 'sfx-uikit-button-generic-hover',
  secondary: 'sfx-uikit-button-generic-click',
  close: 'sfx-uikit-button-circlex-click',
  tab: 'sfx-uikit-button-text-click',
  radio: 'sfx-uikit-button-circlegold-click',
  radioHover: 'sfx-uikit-button-circlegold-hover',
  check: 'sfx-uikit-generic-click-small',
  select: 'sfx-uikit-button-flyout-open-click',
  card: 'sfx-uikit-grid-big-click',
  cardHover: 'sfx-uikit-grid-big-hover',
  tile: 'sfx-uikit-grid-click',
  tileHover: 'sfx-uikit-grid-hover',
};

const KNOWN = new Set(Object.values(SFX));



export function sfxFor(el) {
  const has = (c) => !!el?.classList?.contains(c);

  if (has('close')) return { click: SFX.close, hover: SFX.hover };
  if (has('check-row')) return { click: SFX.check, hover: SFX.hover };
  if (has('select-field')) return { click: SFX.select, hover: SFX.hover };
  if (has('pill')) return { click: SFX.radio, hover: SFX.radioHover };
  if (has('navitem')) return { click: SFX.tab, hover: SFX.hover };
  if (has('champ') || has('skin')) return { click: SFX.card, hover: SFX.cardHover };
  if (has('rank')) return { click: SFX.tile, hover: SFX.tileHover };
  if (has('slider')) return { click: SFX.check, hover: null };
  if (has('hextech-btn-muted') || has('hextech-btn-danger')) {
    return { click: SFX.secondary, hover: SFX.hover };
  }
  if (has('hextech-btn')) return { click: SFX.click, hover: SFX.goldHover };
  return { click: SFX.click, hover: SFX.hover };
}

export function makeSfx({ AudioImpl = typeof Audio !== 'undefined' ? Audio : null, enabled = true, volume = 0.35 } = {}) {
  
  
  const players = new Map();
  let on = enabled;

  return {
    setEnabled(next) {
      on = !!next;
    },

    play(name) {
      if (!on || !AudioImpl || !KNOWN.has(name)) return;

      let audio = players.get(name);
      if (!audio) {
        audio = new AudioImpl(soundUrl(name));
        audio.volume = volume;
        players.set(name, audio);
      } else {
        
        
        audio.pause();
        audio.currentTime = 0;
      }

      
      
      const played = audio.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    },
  };
}
