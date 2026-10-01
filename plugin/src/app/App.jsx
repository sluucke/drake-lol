import { AppProviders } from './AppProviders.jsx';
import { DevShowcase } from './dev/Showcase.jsx';
import { PanelFrame } from './shell/PanelFrame.jsx';
import { ScoutingModal } from './overlays/scouting/ScoutingModal.jsx';
import { ScoutingToast } from './overlays/scouting/ScoutingToast.jsx';
import { ClientDocks } from './overlays/docks/ClientDocks.jsx';
import { SocialToggle } from './overlays/docks/SocialToggle.jsx';
import { OverlayChrome } from './overlays/streaming/OverlayChrome.jsx';
import { MandatoryUpdate } from './shell/MandatoryUpdate.jsx';
import { useDrake } from './store/StoreContext.jsx';

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
