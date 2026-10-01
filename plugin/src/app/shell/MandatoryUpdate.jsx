import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { useLegacyActions } from './LegacyActions.jsx';

const BUSY = ['installing', 'restarting', 'reloading'];
const ERROR_KEYS = {
  'same-version': 'mandatoryUpdate.cancelled',
  timeout: 'mandatoryUpdate.timeout',
};

export function MandatoryUpdate() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const required = useDrake((state) => state.session.updateRequired);
  if (!required) return null;

  const busy = BUSY.includes(required.phase);
  const failed = required.phase === 'error';
  const errorText = ERROR_KEYS[required.reason]
    ? t(ERROR_KEYS[required.reason])
    : t('mandatoryUpdate.failed', { reason: required.message || '' });

  return (
    <Modal
      open={required.phase !== 'dismissed'}
      dismissible={false}
      title={t('mandatoryUpdate.title')}
      width={460}
      className="drk-mandatory-update"
    >
      <p className="drk-mandatory-update__body">{t('mandatoryUpdate.body', { version: required.version })}</p>
      {busy ? (
        <p className="drk-mandatory-update__status" role="status">
          <span className="drk-mandatory-update__spinner" aria-hidden="true" />
          {t(`mandatoryUpdate.${required.phase}`)}
        </p>
      ) : (
        <p className="drk-mandatory-update__note">{t('mandatoryUpdate.note')}</p>
      )}
      {failed ? (
        <p className="drk-mandatory-update__error" role="alert">
          {errorText}
        </p>
      ) : null}
      <div className="drk-mandatory-update__actions">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => store.getState().setSession({ updateRequired: { ...required, phase: 'dismissed' } })}
        >
          {t('mandatoryUpdate.later')}
        </Button>
        <Button disabled={busy} onClick={() => void actions.installRequiredUpdate()}>
          {failed ? t('mandatoryUpdate.retry') : t('mandatoryUpdate.update')}
        </Button>
      </div>
    </Modal>
  );
}
