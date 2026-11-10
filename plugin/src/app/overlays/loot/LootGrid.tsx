import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { LEGACY_ICON } from '../../../ui/assets';
import { useT } from '../../i18n/I18nProvider';
import { Skeleton } from '../../ui/Skeleton';
import { disenchantCount } from '../../../features/loot';
import type { LootItem } from '../../../features/loot';
import { EssenceAmount } from './Essence';

const SKELETON_TILES = 12;

interface LootTileProps {
  item: LootItem;
  selected: boolean;
  keepOne: boolean;
  onToggle: (lootId: string) => void;
}

function LootTile({ item, selected, keepOne, onToggle }: LootTileProps) {
  const t = useT();
  const sfx = useSfx();
  const copies = disenchantCount(item, keepOne);
  const classes = ['drk-loot-tile', `is-${item.essence}`, item.shard ? 'is-shard' : 'is-permanent', selected && 'is-on'];
  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      aria-pressed={selected}
      aria-label={item.name}
      data-loot-id={item.lootId}
      onMouseEnter={() => sfx.play(SFX.tileHover)}
      onClick={() => {
        sfx.play(SFX.tile);
        onToggle(item.lootId);
      }}
    >
      <span className="drk-loot-tile__art">
        {item.tile ? <img className="drk-loot-tile__photo" src={item.tile} alt="" loading="lazy" draggable={false} /> : null}
        <span className="drk-loot-tile__count">{t('overlays.loot.tile.count', { amount: item.count })}</span>
        {item.legacy ? (
          <img
            className="drk-loot-tile__legacy"
            src={LEGACY_ICON}
            alt={t('overlays.loot.tile.legacy')}
            title={t('overlays.loot.tile.legacy')}
            draggable={false}
          />
        ) : null}
        {item.owned ? (
          <span className="drk-loot-tile__owned" data-owned="true" title={t('overlays.loot.tile.ownedHint')}>
            {t('overlays.loot.tile.owned')}
          </span>
        ) : null}
        <span className="drk-loot-tile__check" aria-hidden="true" />
      </span>
      <span className="drk-loot-tile__name" title={item.name}>
        {item.name}
      </span>
      <EssenceAmount className="drk-loot-tile__value" essence={item.essence} amount={item.value * copies} />
    </button>
  );
}

export interface LootGridProps {
  items: readonly LootItem[];
  selected: ReadonlySet<string>;
  keepOne: boolean;
  onToggle: (lootId: string) => void;
}

export function LootGrid({ items, selected, keepOne, onToggle }: LootGridProps) {
  return (
    <div className="drk-loot-grid" role="group">
      {items.map((item) => (
        <LootTile key={item.lootId} item={item} selected={selected.has(item.lootId)} keepOne={keepOne} onToggle={onToggle} />
      ))}
    </div>
  );
}

export function LootGridSkeleton() {
  return (
    <div className="drk-loot-grid" data-loading="true">
      {Array.from({ length: SKELETON_TILES }, (_, i) => (
        <div key={i} className="drk-loot-tile is-skeleton">
          <Skeleton height={96} />
          <Skeleton height={10} width="70%" />
          <Skeleton height={10} width="40%" />
        </div>
      ))}
    </div>
  );
}
