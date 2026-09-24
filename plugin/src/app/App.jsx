import { AppProviders } from './AppProviders.jsx';
import { DevShowcase } from './dev/Showcase.jsx';
import { PanelFrame } from './shell/PanelFrame.jsx';
import { ScoutingModal } from './overlays/scouting/ScoutingModal.jsx';
import { ScoutingToast } from './overlays/scouting/ScoutingToast.jsx';
import { ClientDocks } from './overlays/docks/ClientDocks.jsx';
import { SocialToggle } from './overlays/docks/SocialToggle.jsx';

export function App({ sfx, portalTarget, store, actions }) {
  return (
    <AppProviders sfx={sfx} portalTarget={portalTarget} store={store} actions={actions}>
      <div className="drake-app" data-drake-app="">
        <PanelFrame />
        <ScoutingModal />
        <ScoutingToast />
        <ClientDocks />
        <SocialToggle />
        {__DRAKE_DEV__ ? <DevShowcase /> : null}
      </div>
    </AppProviders>
  );
}
