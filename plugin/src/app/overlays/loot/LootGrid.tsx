import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useFormat, useT } from '../../i18n/I18nProvider';
import { Skeleton } from '../../ui/Skeleton';
import { Tooltip } from '../../ui/Tooltip';
import { disenchantCount } from '../../../features/loot';
import type { Essence, LootItem } from '../../../features/loot';

const SKELETON_TILES = 12;

export function EssenceGem({ essence }: { essence: Essence }) {
  return <span className={`drk-essence drk-essence--${essence}`} aria-hidden="true" />;
}

interface LootTileProps {
  item: LootItem;
  selected: boolean;
  keepOne: boolean;
  onToggle: (lootId: string) => void;
}

function LootTile({ item, selected, keepOne, onToggle }: LootTileProps) {
  const t = useT();
  const format = useFormat();
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
        {item.tile ? <img src={item.tile} alt="" loading="lazy" draggable={false} /> : null}
        <span className="drk-loot-tile__count">{t('overlays.loot.tile.count', { amount: item.count })}</span>
        {item.legacy ? <span className="drk-loot-tile__legacy">{t('overlays.loot.tile.legacy')}</span> : null}
        {item.owned ? (
          <span className="drk-loot-tile__owned" data-owned="true">
            <Tooltip content={t('overlays.loot.tile.owned')}>
              <span className="drk-loot-tile__owned-mark" />
            </Tooltip>
          </span>
        ) : null}
        <span className="drk-loot-tile__check" aria-hidden="true" />
      </span>
      <span className="drk-loot-tile__name">{item.name}</span>
      <span className="drk-loot-tile__value">
        <EssenceGem essence={item.essence} />
        {format.number(item.value * copies)}
      </span>
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
