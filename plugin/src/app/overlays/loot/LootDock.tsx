import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useInClientChromeHidden } from '../../hooks/useStreaming';
import { useT } from '../../i18n/I18nProvider';
import { useDrake, useDrakeStore } from '../../store/StoreContext';
import { Layer } from '../../ui/Layer';
import { DURATION, EASE_OUT } from '../../ui/motion';
import { OVERLAY_SIZES, lootPiece } from '../streaming/overlayLayout';
import type { OverlayPoint, OverlaySize } from '../streaming/overlayLayout';
import { DisenchantModal } from './DisenchantModal';
import { EssenceIcon } from './Essence';
import { lootButtonStyle, useLootScreen } from './useLootScreen';

const FADE = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

function useLootOpen(active: boolean): [boolean, (open: boolean) => void] {
  const store = useDrakeStore();
  const open = useDrake((s) => s.ui.lootOpen);
  const setOpen = (next: boolean) => store.getState().setUi({ lootOpen: next });
  useEffect(() => {
    if (!active && store.getState().ui.lootOpen) store.getState().setUi({ lootOpen: false });
  }, [active, store]);
  return [open && active, setOpen];
}

function overlayPlace(point: OverlayPoint, size: OverlaySize): CSSProperties {
  const scale = window.devicePixelRatio || 1;
  const originX = Math.round((window.screenX || 0) * scale);
  const originY = Math.round((window.screenY || 0) * scale);
  return {
    left: Math.round((point.x - originX) / scale),
    top: Math.round((point.y - originY) / scale),
    width: Math.round(size.width / scale),
    height: Math.round(size.height / scale),
  };
}

interface LaunchButtonProps {
  className?: string;
  onOpen: () => void;
}

function LaunchButton({ className = '', onOpen }: LaunchButtonProps) {
  const t = useT();
  const sfx = useSfx();
  return (
    <button
      type="button"
      className={['drk-hextech-btn', 'drk-loot-launch', className].filter(Boolean).join(' ')}
      data-drake-loot="true"
      onMouseEnter={() => sfx.play(SFX.goldHover)}
      onClick={() => {
        sfx.play(SFX.click);
        onOpen();
      }}
    >
      <EssenceIcon essence="blue" />
      <span className="drk-loot-launch__label">{t('overlays.loot.button')}</span>
    </button>
  );
}

function ClientLootDock() {
  const inGame = useDrake((s) => !!s.session.idle);
  const chromeHidden = useInClientChromeHidden();
  const active = !inGame && !chromeHidden;
  const anchor = useLootScreen(active);
  const [open, setOpen] = useLootOpen(active);

  if (!active) return null;

  return (
    <>
      <Layer>
        <AnimatePresence>
          {anchor && !open ? (
            <motion.div key="loot" className="drk-dock drk-dock--loot" style={lootButtonStyle(anchor)} {...FADE}>
              <LaunchButton onOpen={() => setOpen(true)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Layer>
      <DisenchantModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function OverlayLootDock() {
  const inGame = useDrake((s) => !!s.session.idle);
  const panelOpen = useDrake((s) => s.ui.panelOpen);
  const client = useDrake((s) => s.session.overlayGeometry?.client || null);
  const anchor = useDrake((s) => s.session.overlayLoot);
  const active = !inGame;
  const [open, setOpen] = useLootOpen(active);
  const at = client && anchor ? lootPiece(client, anchor) : null;

  if (!active) return null;

  return (
    <>
      <Layer>
        <AnimatePresence>
          {at && !open && !panelOpen ? (
            <motion.div
              key="loot"
              className="drk-dock drk-dock--loot drk-dock--overlay-loot"
              style={overlayPlace(at, OVERLAY_SIZES.loot)}
              {...FADE}
            >
              <LaunchButton className="drk-loot-launch--overlay" onOpen={() => setOpen(true)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Layer>
      <DisenchantModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LootDock() {
  const overlayHost = useDrake((s) => s.session.streaming?.host === 'overlay');
  return overlayHost ? <OverlayLootDock /> : <ClientLootDock />;
}
