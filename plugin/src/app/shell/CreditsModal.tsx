import type { ReactNode } from 'react';
import { CREDITS } from './shellData';
import type { CreditEntry } from './shellData';
import { SFX } from '../../ui/sfx';
import { useSfx } from '../hooks/useSfx';
import { useT } from '../i18n/I18nProvider';
import { useDrake, useDrakeStore } from '../store/StoreContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useLegacyActions } from './LegacyActions';

interface CreditLinkProps {
  entry: CreditEntry;
  large?: boolean;
}

function CreditLink({ entry, large = false }: CreditLinkProps) {
  const sfx = useSfx();
  const actions = useLegacyActions();
  return (
    <button
      type="button"
      className={['drk-credits__link', large && 'is-large'].filter(Boolean).join(' ')}
      onMouseEnter={() => sfx.play(SFX.hover)}
      onClick={() => {
        sfx.play(SFX.tab);
        actions.openUrl(entry.href);
      }}
    >
      {entry.label}
    </button>
  );
}

interface CreditRowProps {
  label: string;
  children?: ReactNode;
}

function CreditRow({ label, children }: CreditRowProps) {
  return (
    <div className="drk-credits__row">
      <dt className="drk-credits__label">{label}</dt>
      <dd className="drk-credits__value">{children}</dd>
    </div>
  );
}

export function CreditsModal() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const open = useDrake((state) => state.ui.creditsOpen);

  return (
    <Modal open={open} onClose={() => store.getState().setCreditsOpen(false)} title={t('shell.credits.title')} width={440}>
      <p className="drk-credits__disclaimer">{t('shell.credits.disclaimer')}</p>
      <dl className="drk-credits__list">
        <CreditRow label={t('shell.credits.createdBy')}>
          <CreditLink entry={CREDITS.createdBy} large />
        </CreditRow>
        <CreditRow label={t('shell.credits.specialThanks')}>
          <CreditLink entry={CREDITS.specialThanks} large />
        </CreditRow>
        <CreditRow label={t('shell.credits.inspiredBy')}>
          {CREDITS.inspiredBy.map((entry) => (
            <CreditLink key={entry.href} entry={entry} />
          ))}
        </CreditRow>
        <CreditRow label={t('shell.credits.assets')}>
          <CreditLink entry={CREDITS.assets} />
        </CreditRow>
      </dl>
      <div className="drk-credits__actions">
        <Button onClick={() => actions.openUrl(CREDITS.repoUrl)}>{t('shell.credits.github')}</Button>
      </div>
    </Modal>
  );
}
