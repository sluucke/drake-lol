import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { useLegacyActions } from './LegacyActions.jsx';

export function MandatoryUpdate() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const required = useDrake((state) => state.session.updateRequired);
  if (!required) return null;

  const set = (patch) => store.getState().setSession({ updateRequired: { ...required, ...patch } });
  const installing = required.phase === 'installing';

  async function install() {
    set({ phase: 'installing', message: '' });
    const result = await actions.installUpdate();
    if (!result?.ok) set({ phase: 'error', message: result?.reason || '' });
  }

  return (
    <Modal
      open={required.phase !== 'dismissed'}
      dismissible={false}
      title={t('mandatoryUpdate.title')}
      width={460}
      className="drk-mandatory-update"
    >
      <p className="drk-mandatory-update__body">{t('mandatoryUpdate.body', { version: required.version })}</p>
      <p className="drk-mandatory-update__note">{t('mandatoryUpdate.note')}</p>
      {required.phase === 'error' ? (
        <p className="drk-mandatory-update__error" role="alert">
          {t('mandatoryUpdate.failed', { reason: required.message || '' })}
        </p>
      ) : null}
      <div className="drk-mandatory-update__actions">
        <Button variant="secondary" disabled={installing} onClick={() => set({ phase: 'dismissed' })}>
          {t('mandatoryUpdate.later')}
        </Button>
        <Button disabled={installing} onClick={() => void install()}>
          {installing ? t('mandatoryUpdate.installing') : t('mandatoryUpdate.update')}
        </Button>
      </div>
    </Modal>
  );
}
