import type { ContextType, ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { NOOP_SFX, SfxContext } from './hooks/useSfx';
import type { SfxPlayer } from './hooks/useSfx';
import { PortalTargetContext } from './hooks/usePortalTarget';
import { I18nProvider } from './i18n/I18nProvider';
import { AVAILABLE_LOCALES } from './i18n/locales/index';
import { pickLocale } from './i18n/runtime';
import { StoreContext, useDrake } from './store/StoreContext';
import { LegacyActionsContext, NOOP_ACTIONS } from './shell/LegacyActions';
import type { DrakeStore } from './store/types';

export type AppActions = ContextType<typeof LegacyActionsContext>;

export interface AppProvidersProps {
  sfx?: SfxPlayer | null;
  portalTarget?: Element | DocumentFragment | null;
  store?: DrakeStore | null;
  actions?: AppActions | null;
  children?: ReactNode;
}

function LocaleBridge({ children }: { children?: ReactNode }) {
  const locale = useDrake((state) =>
    pickLocale(state.settings.values?.ui_language, state.session.locale, AVAILABLE_LOCALES),
  );
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export function AppProviders({ sfx, portalTarget = null, store, actions, children }: AppProvidersProps) {
  const content = (
    <SfxContext.Provider value={sfx || NOOP_SFX}>
      <PortalTargetContext.Provider value={portalTarget}>
        <LegacyActionsContext.Provider value={actions || NOOP_ACTIONS}>
          <LocaleBridge>
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
          </LocaleBridge>
        </LegacyActionsContext.Provider>
      </PortalTargetContext.Provider>
    </SfxContext.Provider>
  );
  return store ? <StoreContext.Provider value={store}>{content}</StoreContext.Provider> : content;
}
