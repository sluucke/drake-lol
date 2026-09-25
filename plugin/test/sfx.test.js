import { describe, it, expect } from 'vitest';
import { makeSfx, SFX, soundUrl } from '../src/ui/sfx.js';

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
