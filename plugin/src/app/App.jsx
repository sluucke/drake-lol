import { AppProviders } from './AppProviders.jsx';
import { DevShowcase } from './dev/Showcase.jsx';

export function App({ sfx, portalTarget, store }) {
  return (
    <AppProviders sfx={sfx} portalTarget={portalTarget} store={store}>
      <div className="drake-app" data-drake-app="">
        {__DRAKE_DEV__ ? <DevShowcase /> : null}
      </div>
    </AppProviders>
  );
}
