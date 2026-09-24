import { createPortal } from 'react-dom';
import { useSocialHost } from '../../hooks/useSocialHost.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';

export function SocialToggle() {
  const t = useT();
  const actions = useLegacyActions();
  const idle = useDrake((s) => !!s.session.idle);
  const open = useDrake((s) => s.ui.panelOpen);
  const host = useSocialHost(!idle);
  if (!host) return null;
  return createPortal(
    <button
      type="button"
      className="bug-report-button"
      data-drake-toggle="true"
      data-dd-action-name="button.social.drake"
      title="Drake"
      aria-label={t(open ? 'overlays.socialToggle.close' : 'overlays.socialToggle.open')}
      aria-pressed={open ? 'true' : 'false'}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        actions.togglePanel();
      }}
    />,
    host,
  );
}
