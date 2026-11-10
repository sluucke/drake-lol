import { useEffect, useRef, useState } from 'react';
import { visibleWindow } from '../../../ui/virtualGrid';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import type { Skin } from '../../store/types';

export const SKIN_TILE = { perRow: 5, rowHeight: 92, viewportHeight: 300 };

type FrameHandle = number | ReturnType<typeof setTimeout>;

const nextFrame = (fn: () => void): FrameHandle => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

export interface SkinGridProps {
  skins: Skin[];
  selectedId: number;
  onPick: (id: number) => void;
}

export function SkinGrid({ skins, selectedId, onPick }: SkinGridProps) {
  const sfx = useSfx();
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<FrameHandle>(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [skins]);

  const win = visibleWindow({ total: skins.length, ...SKIN_TILE, scrollTop });

  return (
    <div
      ref={viewportRef}
      className="drk-skin-viewport"
      onScroll={() => {
        if (frameRef.current) return;
        frameRef.current = nextFrame(() => {
          frameRef.current = 0;
          if (viewportRef.current) setScrollTop(viewportRef.current.scrollTop);
        });
      }}
    >
      <div className="drk-skin-spacer" style={{ height: win.totalHeight }}>
        <div className="drk-skin-grid" style={{ transform: `translateY(${win.offsetY}px)` }}>
          {skins.slice(win.start, win.end).map((skin) => {
            const on = skin.id === selectedId;
            return (
              <button
                key={skin.id}
                type="button"
                className={['drk-skin', on && 'is-on'].filter(Boolean).join(' ')}
                title={skin.name}
                aria-label={skin.name}
                aria-pressed={on}
                onMouseEnter={() => sfx.play(SFX.cardHover)}
                onClick={() => {
                  sfx.play(SFX.card);
                  onPick(skin.id);
                }}
              >
                <img src={skin.tile} alt="" loading="lazy" />
                <span>{skin.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
