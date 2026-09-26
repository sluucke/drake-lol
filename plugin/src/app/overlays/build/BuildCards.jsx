import { itemIconUrl, itemName, spellIconUrl, spellName } from '../../../features/gameAssets.js';
import { perkIconUrl, perkName, perkStyleIconUrl, perkStyleName } from '../../../features/runes.js';
import { useFormat, useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/Card.jsx';
import { pct, statusKey, WinRate } from './format.jsx';

const SKILL_KEYS = ['Q', 'W', 'E', 'R'];
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

function useBuild() {
  return useDrake((s) => s.build);
}

function PickRate({ entry }) {
  const format = useFormat();
  const games = Number(entry?.play) > 0 ? ` (${format.number(entry.play)})` : '';
  return <span className="drk-build-pr">{`${pct(entry?.pickRate)}${games}`}</span>;
}

function ItemIcons({ ids, hextechFirst = false }) {
  return (
    <div className="drk-build-icons">
      {ids.map((id, index) => (
        <span key={`${id}-${index}`} className="drk-build-icons__slot">
          {index > 0 && <span className="drk-build-arrow">›</span>}
          <img
            className={['drk-build-icon', hextechFirst && index === 0 && 'is-hextech'].filter(Boolean).join(' ')}
            src={itemIconUrl(id)}
            alt={itemName(id)}
            title={itemName(id)}
          />
        </span>
      ))}
    </div>
  );
}

function ActionButton({ status, idleKey, onClick }) {
  const t = useT();
  return (
    <Button size="sm" variant="secondary" disabled={status === 'applying'} onClick={onClick}>
      {t(statusKey(status, idleKey))}
    </Button>
  );
}

export function RunesCard() {
  const t = useT();
  const actions = useLegacyActions();
  const state = useBuild();
  const pages = state.build?.runePages || [];
  return (
    <Card title={t('overlays.build.cards.runes')}>
      {pages.length === 0 ? (
        <p className="drk-help">{t('overlays.build.empty.runes')}</p>
      ) : (
        pages.map((page, index) => {
          const ids = page.selectedPerkIds || [];
          const shards = ids.filter((id) => id >= 5000 && id < 6000);
          const perks = ids.filter((id) => !(id >= 5000 && id < 6000));
          const [keystone, ...rest] = perks;
          const primary = rest.slice(0, 3);
          const secondary = rest.slice(3);
          return (
            <div key={index} className="drk-build-row drk-build-rune-row">
              <div className="drk-build-row__lead">
                <span className="drk-build-num">{`${index + 1}.`}</span>
                <img className="drk-build-style" src={perkStyleIconUrl(page.primaryStyleId)} alt={perkStyleName(page.primaryStyleId)} title={perkStyleName(page.primaryStyleId)} />
                {keystone ? <img className="drk-build-keystone" src={perkIconUrl(keystone)} alt={perkName(keystone)} title={perkName(keystone)} /> : null}
                {primary.map((id) => (
                  <img key={id} className="drk-build-perk" src={perkIconUrl(id)} alt={perkName(id)} title={perkName(id)} />
                ))}
                <span className="drk-build-divider" />
                <img className="drk-build-style" src={perkStyleIconUrl(page.subStyleId)} alt={perkStyleName(page.subStyleId)} title={perkStyleName(page.subStyleId)} />
                {secondary.map((id) => (
                  <img key={id} className="drk-build-perk" src={perkIconUrl(id)} alt={perkName(id)} title={perkName(id)} />
                ))}
              </div>
              <div className="drk-build-row__stats">
                {shards.map((id, i) => (
                  <img key={`${id}-${i}`} className="drk-build-shard" src={perkIconUrl(id)} alt={perkName(id)} title={perkName(id)} />
                ))}
                <WinRate value={page.winRate} suffix=" WR" />
                <PickRate entry={page} />
                <ActionButton status={state.runeStatus} idleKey="overlays.build.actions.apply" onClick={() => actions.applyBuildRunes(index)} />
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}

function PhaseRow({ label, entry }) {
  if (!entry?.ids?.length) return null;
  return (
    <div className="drk-build-phase">
      <span className="drk-build-phase__label">{label}</span>
      <ItemIcons ids={entry.ids} />
      <span className="drk-build-row__stats">
        <WinRate value={entry.winRate} suffix=" WR" />
        <PickRate entry={entry} />
      </span>
    </div>
  );
}

export function ItemsCard() {
  const t = useT();
  const actions = useLegacyActions();
  const state = useBuild();
  const items = state.build?.items || { starter: [], boots: [], core: [], last: [] };
  const empty = !items.starter?.length && !items.boots?.length && !items.core?.length && !items.last?.length;
  return (
    <Card
      title={t('overlays.build.cards.items')}
      actions={
        <ActionButton status={state.itemSetStatus} idleKey="overlays.build.actions.createItemSet" onClick={() => actions.applyBuildItems()} />
      }
    >
      {empty ? (
        <p className="drk-help">{t('overlays.build.empty.items')}</p>
      ) : (
        <>
          <PhaseRow label={t('overlays.build.phases.starter')} entry={items.starter?.[0]} />
          <PhaseRow label={t('overlays.build.phases.boots')} entry={items.boots?.[0]} />
          {items.core?.length > 0 && (
            <>
              <span className="drk-build-phase__label">{t('overlays.build.phases.core')}</span>
              {items.core.map((entry, index) => (
                <div key={index} className={['drk-build-row', 'drk-build-core-row', index === 0 && 'is-hextech'].filter(Boolean).join(' ')}>
                  <div className="drk-build-row__lead">
                    <span className="drk-build-num">{`${index + 1}.`}</span>
                    <ItemIcons ids={entry.ids} hextechFirst={index === 0} />
                  </div>
                  <div className="drk-build-row__stats">
                    <WinRate value={entry.winRate} suffix=" WR" />
                    <PickRate entry={entry} />
                    <span className="drk-build-bar">
                      <i style={{ width: `${Math.min(100, Number(entry.pickRate) || 0)}%` }} />
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
          {items.last?.length > 0 && (
            <div className="drk-build-phase">
              <span className="drk-build-phase__label">{t('overlays.build.phases.situational')}</span>
              <div className="drk-build-trend">
                {items.last.map((entry, index) => (
                  <div key={index} className="drk-build-trend__cell">
                    <span>{pct(entry.pickRate)}</span>
                    <img className="drk-build-icon" src={itemIconUrl(entry.ids[0])} alt={itemName(entry.ids[0])} title={itemName(entry.ids[0])} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function SpellsCard() {
  const t = useT();
  const actions = useLegacyActions();
  const state = useBuild();
  const spells = state.build?.spells || [];
  return (
    <Card title={t('overlays.build.cards.spells')}>
      {spells.length === 0 ? (
        <p className="drk-help">{t('overlays.build.empty.spells')}</p>
      ) : (
        spells.map((entry, index) => (
          <div key={index} className="drk-build-row">
            <div className="drk-build-row__lead">
              <span className="drk-build-num">{`${index + 1}.`}</span>
              <div className="drk-build-icons">
                {entry.ids.map((id) => (
                  <img key={id} className="drk-build-icon" src={spellIconUrl(id)} alt={spellName(id)} title={spellName(id)} />
                ))}
              </div>
            </div>
            <div className="drk-build-row__stats">
              <WinRate value={entry.winRate} suffix=" WR" />
              <PickRate entry={entry} />
              <ActionButton status={state.spellStatus} idleKey="overlays.build.actions.apply" onClick={() => actions.applyBuildSpells(index)} />
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

export function SkillOrderCard() {
  const t = useT();
  const format = useFormat();
  const state = useBuild();
  const skills = state.build?.skills || { order: [], masteries: [] };
  const order = skills.order || [];
  if (!order.length && !(skills.masteries || []).length) return null;
  return (
    <Card title={t('overlays.build.cards.skills')}>
      <div className="drk-skill-wrap">
        <table className="drk-skill-table">
          <tbody>
            {SKILL_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row">
                  <span className="drk-skill-key">{key}</span>
                </th>
                {LEVELS.map((level) => {
                  const active = order[level - 1] === key;
                  return (
                    <td key={level} className={['drk-skill-cell', active && 'is-active'].filter(Boolean).join(' ')}>
                      {active ? level : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="drk-build-row__stats">
        {skills.winRate != null && (
          <span>
            <WinRate value={skills.winRate} /> {t('overlays.build.winRate')}
          </span>
        )}
        {skills.play ? (
          <span>
            <b>{format.number(skills.play)}</b> {t('overlays.build.games')}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
