// @ts-nocheck
import { AppProviders } from './AppProviders';
import { DevShowcase } from './dev/Showcase';
import { PanelFrame } from './shell/PanelFrame';
import { ScoutingModal } from './overlays/scouting/ScoutingModal';
import { ScoutingToast } from './overlays/scouting/ScoutingToast';
import { ClientDocks } from './overlays/docks/ClientDocks';
import { SocialToggle } from './overlays/docks/SocialToggle';
import { OverlayChrome } from './overlays/streaming/OverlayChrome';
import { MandatoryUpdate } from './shell/MandatoryUpdate';
import { useDrake } from './store/StoreContext';

function AppContent() {
  const updateRequired = useDrake((state) => !!state.session.updateRequired);
  if (updateRequired) return <MandatoryUpdate />;
  return (
    <>
      <PanelFrame />
      <ScoutingModal />
      <ScoutingToast />
      <ClientDocks />
      <SocialToggle />
      <OverlayChrome />
      {__DRAKE_DEV__ ? <DevShowcase /> : null}
    </>
  );
}

export function App({ sfx, portalTarget, store, actions }) {
  return (
    <AppProviders sfx={sfx} portalTarget={portalTarget} store={store} actions={actions}>
      <div className="drake-app" data-drake-app="">
        <AppContent />
      </div>
    </AppProviders>
  );
}
