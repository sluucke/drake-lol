import { describe, it, expect } from 'vitest';
import { makeSfx, SFX, soundUrl, sfxFor } from '../src/ui/sfx.js';

function fakeAudio() {
  const made = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.currentTime = 0;
      this.plays = 0;
      made.push(this);
    }
    play() {
      this.plays += 1;
      return Promise.resolve();
    }
    pause() {}
  }
  return { FakeAudio, made };
}

describe('soundUrl', () => {
  it("points at the client's own asset, so sounds cost no bundle size", () => {


    expect(soundUrl(SFX.click)).toBe(
      '/fe/lol-static-assets/sounds/sfx-uikit-button-gold-click.ogg',
    );
  });
});

describe('makeSfx', () => {
  it('plays a named sound', () => {
    const { FakeAudio, made } = fakeAudio();
    makeSfx({ AudioImpl: FakeAudio }).play(SFX.click);
    expect(made).toHaveLength(1);
    expect(made[0].plays).toBe(1);
  });

  it('reuses one element per sound instead of leaking one per event', () => {


    const { FakeAudio, made } = fakeAudio();
    const sfx = makeSfx({ AudioImpl: FakeAudio });
    sfx.play(SFX.hover);
    sfx.play(SFX.hover);
    sfx.play(SFX.hover);
    expect(made).toHaveLength(1);
    expect(made[0].plays).toBe(3);
  });

  it('rewinds a sound still playing, so rapid clicks retrigger', () => {
    const { FakeAudio, made } = fakeAudio();
    const sfx = makeSfx({ AudioImpl: FakeAudio });
    sfx.play(SFX.click);
    made[0].currentTime = 0.4;
    sfx.play(SFX.click);
    expect(made[0].currentTime).toBe(0);
  });

  it('constructs nothing at all when muted', () => {
    const { FakeAudio, made } = fakeAudio();
    makeSfx({ AudioImpl: FakeAudio, enabled: false }).play(SFX.click);
    expect(made).toHaveLength(0);
  });

  it('can be muted and unmuted at runtime', () => {
    const { FakeAudio, made } = fakeAudio();
    const sfx = makeSfx({ AudioImpl: FakeAudio });
    sfx.setEnabled(false);
    sfx.play(SFX.click);
    expect(made).toHaveLength(0);
    sfx.setEnabled(true);
    sfx.play(SFX.click);
    expect(made).toHaveLength(1);
  });

  it('never throws when playback is refused', () => {


    class Hostile {
      play() {
        return Promise.reject(new Error('NotAllowedError'));
      }
      pause() {}
    }
    expect(() => makeSfx({ AudioImpl: Hostile }).play(SFX.click)).not.toThrow();
  });

  it('ignores a sound name that was never confirmed to exist', () => {


    const { FakeAudio, made } = fakeAudio();
    expect(() => makeSfx({ AudioImpl: FakeAudio }).play('sfx-uikit-checkbox-click')).not.toThrow();
    expect(made).toHaveLength(0);
  });
});

function el(...classes) {
  return { classList: { contains: (c) => classes.includes(c) } };
}

describe('sfxFor', () => {
  it('uses the gold pair for a primary hextech button, the way Play does', () => {
    expect(sfxFor(el('hextech-btn'))).toEqual({
      click: 'sfx-uikit-button-gold-click',
      hover: 'sfx-uikit-button-gold-hover',
    });
  });

  it('uses the quieter generic click for muted and danger buttons', () => {
    expect(sfxFor(el('hextech-btn', 'hextech-btn-muted')).click).toBe(
      'sfx-uikit-button-generic-click',
    );
    expect(sfxFor(el('hextech-btn', 'hextech-btn-danger')).click).toBe(
      'sfx-uikit-button-generic-click',
    );
  });

  it('uses the circle-X click for the close button', () => {
    expect(sfxFor(el('close')).click).toBe('sfx-uikit-button-circlex-click');
  });

  it('uses the text-button click for credit links', () => {
    expect(sfxFor(el('credit-link')).click).toBe('sfx-uikit-button-text-click');
  });

  it('uses the text-button click for nav tabs', () => {
    expect(sfxFor(el('navitem')).click).toBe('sfx-uikit-button-text-click');
  });

  it('uses the circle-gold pair for pills, which behave like radios', () => {
    expect(sfxFor(el('pill'))).toEqual({
      click: 'sfx-uikit-button-circlegold-click',
      hover: 'sfx-uikit-button-circlegold-hover',
    });
  });

  it('uses the small generic click for checkboxes', () => {
    expect(sfxFor(el('check-row')).click).toBe('sfx-uikit-generic-click-small');
  });

  it('uses the flyout-open click for selects', () => {
    expect(sfxFor(el('select-field')).click).toBe('sfx-uikit-button-flyout-open-click');
  });

  it('uses the collection-grid pair for champ and skin cards', () => {
    expect(sfxFor(el('champ'))).toEqual({
      click: 'sfx-uikit-grid-big-click',
      hover: 'sfx-uikit-grid-big-hover',
    });
    expect(sfxFor(el('skin')).click).toBe('sfx-uikit-grid-big-click');
  });

  it('uses the smaller grid pair for rank tiles', () => {
    expect(sfxFor(el('rank'))).toEqual({
      click: 'sfx-uikit-grid-click',
      hover: 'sfx-uikit-grid-hover',
    });
  });

  it('ticks the slider without a hover sound, so dragging it does not chatter', () => {
    expect(sfxFor(el('slider'))).toEqual({
      click: 'sfx-uikit-generic-click-small',
      hover: null,
    });
  });
});
