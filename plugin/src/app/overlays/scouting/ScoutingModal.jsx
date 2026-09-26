import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { Modal } from '../../ui/Modal.jsx';
import { Tabs } from '../../ui/Tabs.jsx';
import { BuildTab } from '../build/BuildTab.jsx';
import { ScoutCard } from './ScoutCard.jsx';

const TAB_IDS = ['scouting', 'build'];

export function ScoutingModal() {
  const t = useT();
  const actions = useLegacyActions();
  const view = useDrake((state) => state.teamReveal);
  const scouting = view.activeTab !== 'build';

  const header = (
    <div className="drk-scout__head">
      <Tabs
        tabs={TAB_IDS.map((id) => ({ id, label: t(`overlays.scouting.tabs.${id}`) }))}
        value={scouting ? 'scouting' : 'build'}
        onChange={(tab) => actions.setScoutingTab(tab)}
      />
      {scouting && (
        <div className="drk-scout__meta">
          {view.side && (
            <span className={`drk-side is-${view.side.color}`}>{t(`overlays.scouting.side.${view.side.side}`)}</span>
          )}
          <Button
            size="sm"
            variant={view.muteStatus === 'muted' ? 'ghost' : 'secondary'}
            disabled={view.muteStatus === 'muting'}
            onClick={() => actions.muteScouting()}
          >
            {t(`overlays.scouting.mute.${view.muteStatus}`)}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      open={view.open}
      onClose={() => actions.closeScouting()}
      header={header}
      ariaLabel={t('overlays.scouting.title')}
      width={1180}
      className="drk-scout"
    >
      {!scouting ? (
        <BuildTab />
      ) : view.rows.length ? (
        <div className="drk-scout__grid">
          {view.rows.map((row, index) => (
            <ScoutCard key={row.cellId ?? index} row={row} index={index} />
          ))}
        </div>
      ) : (
        <p className="drk-help">{t('overlays.scouting.empty')}</p>
      )}
    </Modal>
  );
}
