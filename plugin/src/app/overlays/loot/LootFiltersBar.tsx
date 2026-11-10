import { useT } from '../../i18n/I18nProvider';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { TextInput } from '../../ui/TextInput';
import { Toggle } from '../../ui/Toggle';
import { RARITIES } from '../../../features/loot';
import type { LootCategory, LootFilters, RarityFilter } from '../../../features/loot';

type Scope = 'shards' | 'all';

const RARITY_FILTERS: readonly RarityFilter[] = ['all', ...RARITIES];

export interface LootFiltersBarProps {
  category: LootCategory;
  filters: LootFilters;
  keepOne: boolean;
  onChange: (patch: Partial<LootFilters>) => void;
  onKeepOne: (keepOne: boolean) => void;
}

export function LootFiltersBar({ category, filters, keepOne, onChange, onKeepOne }: LootFiltersBarProps) {
  const t = useT();
  const skins = category === 'skin';
  return (
    <div className="drk-loot-filters">
      <div className="drk-loot-filters__row">
        <div className="drk-loot-filters__search">
          <TextInput
            value={filters.query}
            placeholder={t('overlays.loot.search')}
            ariaLabel={t('overlays.loot.search')}
            onChange={(query) => onChange({ query })}
          />
        </div>
        <Segmented<Scope>
          ariaLabel={t('overlays.loot.filters.scope')}
          value={filters.includePermanents ? 'all' : 'shards'}
          options={[
            { value: 'shards', label: t('overlays.loot.filters.shardsOnly') },
            { value: 'all', label: t('overlays.loot.filters.includePermanents') },
          ]}
          onChange={(scope) => onChange({ includePermanents: scope === 'all' })}
        />
        {skins ? (
          <Select<RarityFilter>
            className="drk-loot-filters__rarity"
            ariaLabel={t('overlays.loot.filters.rarity')}
            value={filters.rarity}
            options={RARITY_FILTERS.map((value) => ({ value, label: t(`overlays.loot.rarity.${value}`) }))}
            onChange={(rarity) => onChange({ rarity })}
          />
        ) : null}
      </div>
      <div className="drk-loot-filters__row drk-loot-filters__toggles">
        <Toggle
          checked={filters.ownedOnly}
          label={t(skins ? 'overlays.loot.filters.ownedSkins' : 'overlays.loot.filters.ownedChampions')}
          onChange={(ownedOnly) => onChange({ ownedOnly })}
        />
        {skins ? (
          <Toggle
            checked={filters.legacyOnly}
            label={t('overlays.loot.filters.legacyOnly')}
            onChange={(legacyOnly) => onChange({ legacyOnly })}
          />
        ) : null}
        <Toggle checked={keepOne} label={t('overlays.loot.filters.keepOne')} onChange={onKeepOne} />
      </div>
    </div>
  );
}
