import { MotionConfig } from 'motion/react';
import { NOOP_SFX, SfxContext } from './hooks/useSfx.js';
import { PortalTargetContext } from './hooks/usePortalTarget.js';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { StoreContext, useDrake } from './store/StoreContext.jsx';

function LocaleBridge({ children }) {
  const locale = useDrake((state) => state.session.locale);
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export function AppProviders({ sfx, portalTarget = null, store, children }) {
  const content = (
    <SfxContext.Provider value={sfx || NOOP_SFX}>
      <PortalTargetContext.Provider value={portalTarget}>
        <LocaleBridge>
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </LocaleBridge>
      </PortalTargetContext.Provider>
    </SfxContext.Provider>
  );
  return store ? <StoreContext.Provider value={store}>{content}</StoreContext.Provider> : content;
}
