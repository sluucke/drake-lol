import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { DURATION } from '../ui/motion.js';

export function ShellFooter() {
  const t = useT();
  const hostLabel = useDrake((state) => state.session.hostLabel);
  const line = useDrake((state) => state.session.statusLine);
  const trayDown = useDrake((state) => state.settings.trayDown);
  const text = line ? line.text : t(trayDown ? 'shell.footer.trayDown' : 'shell.footer.trayUp');
  const tone = line ? line.tone : trayDown ? 'bad' : 'good';

  return (
    <footer className="drk-footer">
      <span className="drk-footer__host">{hostLabel || '—'}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${tone}:${text}`}
          role="status"
          className={`drk-footer__status is-${tone}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DURATION.fast }}
        >
          <span className="drk-footer__dot" aria-hidden="true" />
          {text}
        </motion.span>
      </AnimatePresence>
    </footer>
  );
}
