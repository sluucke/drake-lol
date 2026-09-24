import { MotionConfig } from 'motion/react';
import { NOOP_SFX, SfxContext } from './hooks/useSfx.js';
import { PortalTargetContext } from './hooks/usePortalTarget.js';

export function AppProviders({ sfx, portalTarget = null, children }) {
  return (
    <SfxContext.Provider value={sfx || NOOP_SFX}>
      <PortalTargetContext.Provider value={portalTarget}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </PortalTargetContext.Provider>
    </SfxContext.Provider>
  );
}
