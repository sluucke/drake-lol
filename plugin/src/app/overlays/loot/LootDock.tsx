import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useInClientChromeHidden } from '../../hooks/useStreaming';
import { useT } from '../../i18n/I18nProvider';
import { useDrake } from '../../store/StoreContext';
import { Layer } from '../../ui/Layer';
import { DURATION, EASE_OUT } from '../../ui/motion';
import { DisenchantModal } from './DisenchantModal';
import { lootButtonStyle, useLootScreen } from './useLootScreen';

const FADE = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

export function LootDock() {
  const t = useT();
  const sfx = useSfx();
  const inGame = useDrake((s) => !!s.session.idle);
  const chromeHidden = useInClientChromeHidden();
  const overlayHost = useDrake((s) => s.session.streaming?.host === 'overlay');
  const active = !inGame && !chromeHidden && !overlayHost;
  const anchor = useLootScreen(active);
  const [open, setOpen] = useState(false);

  if (!active) return null;

  return (
    <>
      <Layer>
        <AnimatePresence>
          {anchor && !open ? (
            <motion.div key="loot" className="drk-dock drk-dock--loot" style={lootButtonStyle(anchor)} {...FADE}>
              <button
                type="button"
                className="drk-hextech-btn drk-loot-launch"
                data-drake-loot="true"
                onMouseEnter={() => sfx.play(SFX.goldHover)}
                onClick={() => {
                  sfx.play(SFX.click);
                  setOpen(true);
                }}
              >
                <span className="drk-essence drk-essence--blue" aria-hidden="true" />
                {t('overlays.loot.button')}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Layer>
      <DisenchantModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
