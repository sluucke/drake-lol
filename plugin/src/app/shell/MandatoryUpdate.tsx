import type { RequiredUpdatePhase } from '../store/sessionSlice';
import { useT } from '../i18n/I18nProvider';
import { useDrake, useDrakeStore } from '../store/StoreContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useLegacyActions } from './LegacyActions';

const BUSY: RequiredUpdatePhase[] = ['installing', 'restarting', 'reloading'];
const ERROR_KEYS: Record<string, string> = {
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
  const errorKey = required.reason ? ERROR_KEYS[required.reason] : undefined;
  const errorText = errorKey
    ? t(errorKey)
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
