












const BASE = '/fe/lol-static-assets/sounds';

export function soundUrl(name: string): string {
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
} as const;

export type SfxName = (typeof SFX)[keyof typeof SFX];

export interface AudioLike {
  volume: number;
  currentTime: number;
  pause(): void;
  play(): Promise<void> | void;
}

export type AudioCtor = new (src: string) => AudioLike;

export interface SfxOptions {
  AudioImpl?: AudioCtor | null;
  enabled?: boolean;
  volume?: number;
}

export interface Sfx {
  setEnabled(next: unknown): void;
  play(name: string): void;
}

const KNOWN = new Set<string>(Object.values(SFX));

export function makeSfx({ AudioImpl = typeof Audio !== 'undefined' ? Audio : null, enabled = true, volume = 0.35 }: SfxOptions = {}): Sfx {
  
  
  const players = new Map<string, AudioLike>();
  let on = enabled;

  return {
    setEnabled(next: unknown) {
      on = !!next;
    },

    play(name: string) {
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
