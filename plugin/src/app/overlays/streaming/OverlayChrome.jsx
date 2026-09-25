import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DRAKE_ICON } from '../../../ui/assets.js';
import { useStreaming } from '../../hooks/useStreaming.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Layer } from '../../ui/Layer.jsx';
import { DURATION, EASE_OUT } from '../../ui/motion.js';
import { OVERLAY_SIZES, clampToClient, overlayPieces, toRelative } from './overlayLayout.js';

const DODGE_LABELS = { idle: 'dodgeButton', busy: 'dodging', done: 'dodged', failed: 'dodgeFailed' };
const DRAG_THRESHOLD = 4;
const HINT_LIFETIME_MS = 12000;

const FADE = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

function screenScale() {
  return window.devicePixelRatio || 1;
}

function windowOrigin() {
  const scale = screenScale();
  return { x: Math.round((window.screenX || 0) * scale), y: Math.round((window.screenY || 0) * scale) };
}

function place(point, size) {
  const scale = screenScale();
  const origin = windowOrigin();
  return {
    left: `${Math.round((point.x - origin.x) / scale)}px`,
    top: `${Math.round((point.y - origin.y) / scale)}px`,
    width: `${Math.round(size.width / scale)}px`,
    height: `${Math.round(size.height / scale)}px`,
  };
}

function useDrag({ client, at, size, onTap, onDrop }) {
  const actions = useLegacyActions();
  const drag = useRef(null);
  const [dragAt, setDragAt] = useState(null);

  function finish(event, cancelled) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragAt(null);
    const release = () => actions.setOverlayDragging?.(false);
    if (!cancelled && current.moved) {
      Promise.resolve(onDrop(toRelative(client, current.last, size))).finally(release);
      return;
    }
    release();
    if (!cancelled) onTap();
  }

  return {
    at: dragAt || at,
    dragging: !!dragAt,
    handlers: {
      onPointerDown(event) {
        if (event.button !== 0 || !client) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const scale = screenScale();
        drag.current = {
          start: { x: event.screenX * scale, y: event.screenY * scale },
          from: at,
          last: at,
          moved: false,
        };
        actions.setOverlayDragging?.(true);
      },
      onPointerMove(event) {
        const current = drag.current;
        if (!current) return;
        const scale = screenScale();
        const dx = event.screenX * scale - current.start.x;
        const dy = event.screenY * scale - current.start.y;
        if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        current.moved = true;
        current.last = clampToClient(client, { x: current.from.x + dx, y: current.from.y + dy }, size);
        setDragAt(current.last);
      },
      onPointerUp(event) {
        finish(event, false);
      },
      onPointerCancel(event) {
        finish(event, true);
      },
      onClick(event) {
        if (event.detail === 0) onTap();
      },
    },
  };
}

function DraggableButton({ client, at, size, onTap, onDrop, className, style, children, ...rest }) {
  const drag = useDrag({ client, at, size, onTap, onDrop });
  return (
    <motion.button
      type="button"
      className={[className, drag.dragging && 'is-dragging'].filter(Boolean).join(' ')}
      style={{ ...place(drag.at, size), ...style }}
      {...drag.handlers}
      {...rest}
      {...FADE}
    >
      {children}
    </motion.button>
  );
}

export function OverlayChrome() {
  const t = useT();
  const actions = useLegacyActions();
  const streaming = useStreaming();
  const panelOpen = useDrake((s) => s.ui.panelOpen);
  const geometry = useDrake((s) => s.session.overlayGeometry);
  const champSelect = useDrake((s) => s.champSelect);
  const dodgeEnabled = useDrake((s) => s.settings.values?.queue_dodge_in_client !== false);
  const positions = useDrake((s) => s.settings.values?.overlay_positions);
  const hintSeen = useDrake((s) => s.settings.values?.overlay_hint_seen === true);
  const hintRetired = useRef(false);
  const overlayHost = streaming.host === 'overlay';
  const client = geometry?.client || null;
  const showHint = overlayHost && !panelOpen && !!client && !hintSeen;
  const pieces = overlayPieces(client, positions, { hint: showHint });
  const visible = overlayHost && !panelOpen && !!pieces;

  const retireHint = () => {
    if (hintSeen || hintRetired.current) return;
    hintRetired.current = true;
    void actions.setSettings({ overlay_hint_seen: true });
  };

  useEffect(() => {
    if (!showHint) return undefined;
    const timer = window.setTimeout(retireHint, HINT_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  if (!overlayHost) return null;

  const save = (kind) => async (rel) => {
    await actions.setSettings({
      overlay_positions: { fab: positions?.fab || null, dodge: positions?.dodge || null, [kind]: rel },
    });
    retireHint();
  };

  return (
    <Layer>
      <AnimatePresence>
        {visible && showHint ? (
          <motion.div
            key="hint"
            role="note"
            className="drk-overlay-hint"
            style={place(pieces.hint, OVERLAY_SIZES.hint)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: [0, -4, 0] }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ opacity: { duration: DURATION.base }, y: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <span className="drk-overlay-hint__text">{t('overlays.hint.text')}</span>
            <button type="button" className="drk-overlay-hint__close" onClick={retireHint}>
              {t('overlays.hint.dismiss')}
            </button>
          </motion.div>
        ) : null}
        {visible ? (
          <DraggableButton
            key="fab"
            className="drk-overlay-fab"
            client={client}
            at={pieces.fab}
            size={OVERLAY_SIZES.fab}
            onTap={() => actions.togglePanel()}
            onDrop={save('fab')}
            aria-label={t('overlays.socialToggle.open')}
            title="Drake (Ctrl+D)"
          >
            <img src={DRAKE_ICON} alt="" draggable={false} />
          </DraggableButton>
        ) : null}
        {visible && champSelect.cancelable ? (
          <motion.button
            key="cancel"
            type="button"
            className="drk-overlay-dock drk-overlay-dock--danger"
            style={place(pieces.cancel, OVERLAY_SIZES.cancel)}
            onClick={() => void actions.cancelQueue()}
            {...FADE}
          >
            {t('overlays.docks.cancelQueue')}
          </motion.button>
        ) : null}
        {visible && champSelect.active && dodgeEnabled ? (
          <DraggableButton
            key="dodge"
            className="drk-overlay-dock drk-overlay-dock--danger drk-overlay-dock--compact"
            client={client}
            at={pieces.dodge}
            size={OVERLAY_SIZES.dodge}
            disabled={champSelect.dodge === 'busy'}
            onTap={() => void actions.dodge()}
            onDrop={save('dodge')}
          >
            {t(`screens.queue.${DODGE_LABELS[champSelect.dodge] || DODGE_LABELS.idle}`)}
          </DraggableButton>
        ) : null}
      </AnimatePresence>
    </Layer>
  );
}
