import { AppProviders } from './AppProviders.jsx';

export function App({ sfx, portalTarget }) {
  return (
    <AppProviders sfx={sfx} portalTarget={portalTarget}>
      <div className="drake-app" data-drake-app="" />
    </AppProviders>
  );
}
