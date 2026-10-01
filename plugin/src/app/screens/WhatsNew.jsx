import { useState } from 'react';
import { motion } from 'motion/react';
import { WHATS_NEW, pickWhatsNew, whatsNewHistory } from '../../ui/whatsNew.js';
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
  const seenVersion = useDrake((state) => state.settings.values?.whats_new_seen_version || '');
  const [seenAtOpen] = useState(seenVersion);
  const [busy, setBusy] = useState(false);
  const entry = pickWhatsNew(WHATS_NEW, version);
  const history = whatsNewHistory(WHATS_NEW, version, seenAtOpen);
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
      {history.entries.length > 0 ? (
        <Card
          title={t(history.kind === 'missed' ? 'screens.whatsNew.missedTitle' : 'screens.whatsNew.earlierTitle')}
          actions={
            history.kind === 'missed' ? (
              <span className="drk-whats-history__count">
                {t('screens.whatsNew.missedCount', { count: history.entries.length })}
              </span>
            ) : null
          }
        >
          <div className="drk-whats-history">
            {history.entries.map((past, versionIndex) => (
              <motion.section
                key={past.version}
                className="drk-whats-history__version"
                aria-label={`v${past.version}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: staggerDelay(versionIndex + items.length), duration: DURATION.base }}
              >
                <span className="drk-whats-history__badge">v{past.version}</span>
                <ul className="drk-whats-history__list">
                  {past.items.map((item, index) => {
                    const title = whatsNewText(t, past.version, index, item, 'title');
                    return (
                      <li
                        key={index}
                        className={['drk-whats-history__item', item.highlight && 'is-highlight'].filter(Boolean).join(' ')}
                      >
                        {item.screen ? (
                          <button
                            type="button"
                            className="drk-whats-history__link"
                            disabled={busy}
                            onMouseEnter={() => sfx.play(SFX.hover)}
                            onClick={() => {
                              sfx.play(SFX.click);
                              go(item.screen);
                            }}
                          >
                            {title}
                          </button>
                        ) : (
                          <span className="drk-whats-history__title">{title}</span>
                        )}
                        {item.highlight ? (
                          <p className="drk-whats-history__body">{whatsNewText(t, past.version, index, item, 'body')}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
