import { useState } from 'react';
import { motion } from 'motion/react';
import { useT } from '../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Modal } from '../ui/Modal.jsx';
import { DURATION, staggerDelay } from '../ui/motion.js';
import { Help, ScreenHeader } from './common.jsx';

export function FriendsScreen() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const friends = useDrake((state) => state.session.friends);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const online = friends.filter((f) => f.online).length;

  async function removeAll() {
    setRemoving(true);
    const result = await actions.removeAllFriends();
    setRemoving(false);
    setConfirming(false);
    store.getState().setStatusLine(
      result.failed
        ? { text: t('screens.friends.removedPartial', { removed: result.removed, failed: result.failed }), tone: 'bad' }
        : { text: t('screens.friends.removed', { count: result.removed }), tone: 'good' },
    );
  }

  if (friends.length === 0) {
    return (
      <div className="drk-screen__stack">
        <ScreenHeader title={t('screens.friends.title')} subtitle={t('screens.friends.empty')} />
      </div>
    );
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader
        title={t('screens.friends.title')}
        subtitle={t('screens.friends.summary', { online, total: friends.length })}
      />
      <Card>
        <ul className="drk-friend-list">
          {friends.map((friend, index) => (
            <motion.li
              key={friend.id}
              className="drk-friend"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: staggerDelay(index), duration: DURATION.base }}
            >
              <span className={['drk-friend__dot', friend.online && 'is-online'].filter(Boolean).join(' ')} />
              <span className="drk-friend__name">{friend.riotId}</span>
              <span className="drk-friend__note">{friend.note || friend.statusMessage || ''}</span>
            </motion.li>
          ))}
        </ul>
        <div className="drk-actions">
          <Help>{t('screens.friends.warning')}</Help>
          <span className="drk-actions__spacer" />
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('screens.friends.removeAll')}
          </Button>
        </div>
      </Card>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t('screens.friends.confirmTitle')} width={420}>
        <p className="drk-help">{t('screens.friends.confirm', { count: friends.length })}</p>
        <div className="drk-actions">
          <span className="drk-actions__spacer" />
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={removing} onClick={removeAll}>
            {t('screens.friends.removeAll')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
