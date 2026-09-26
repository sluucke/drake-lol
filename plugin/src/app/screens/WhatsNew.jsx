import { useState } from 'react';
import { motion } from 'motion/react';
import { WHATS_NEW, pickWhatsNew } from '../../ui/whatsNew.js';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { whatsNewText } from '../onboarding/content.js';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { DURATION, staggerDelay } from '../ui/motion.js';
import { Help, ScreenHeader } from './common.jsx';

export function WhatsNewScreen() {
  const t = useT();
  const sfx = useSfx();
  const actions = useLegacyActions();
  const version = useDrake((state) => state.session.appVersion);
  const [busy, setBusy] = useState(false);
  const entry = pickWhatsNew(WHATS_NEW, version);
  const shown = version || entry?.version || '';
  const items = entry?.items || [];

  async function go(target) {
    if (busy) return;
    setBusy(true);
    try {
      await actions.dismissWhatsNew(target);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader
        title={t('screens.whatsNew.title')}
        subtitle={shown ? t('screens.whatsNew.subtitle', { version: shown }) : t('screens.whatsNew.recent')}
      />
      <Card>
        {items.length === 0 ? (
          <Help>{t('screens.whatsNew.empty')}</Help>
        ) : (
          <ul className="drk-whats-new">
            {items.map((item, index) => {
              const title = whatsNewText(t, entry.version, index, item, 'title');
              const body = whatsNewText(t, entry.version, index, item, 'body');
              return (
                <motion.li
                  key={index}
                  className="drk-whats-new__item"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: staggerDelay(index), duration: DURATION.base }}
                >
                  {item.screen ? (
                    <button
                      type="button"
                      className="drk-whats-new__link"
                      disabled={busy}
                      onMouseEnter={() => sfx.play(SFX.hover)}
                      onClick={() => {
                        sfx.play(SFX.click);
                        go(item.screen);
                      }}
                    >
                      {title}
                      <span className="drk-whats-new__arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  ) : (
                    <span className="drk-whats-new__title">{title}</span>
                  )}
                  <p className="drk-whats-new__body">{body}</p>
                </motion.li>
              );
            })}
          </ul>
        )}
        <div className="drk-actions">
          <Button disabled={busy} onClick={() => go()}>
            {t('screens.whatsNew.continue')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
