import { useLayoutEffect, useRef } from 'react';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';

export function LegacyBuildTab({ buildSig }) {
  const ref = useRef(null);
  const actions = useLegacyActions();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.innerHTML = actions.renderBuildHtml();
    actions.wireBuildSelects(node);
  }, [buildSig, actions]);

  return (
    <div
      ref={ref}
      className="team-reveal-shell drk-scout__legacy"
      onChange={(event) => actions.buildChange(event.nativeEvent)}
      onClick={(event) => {
        if (event.target.closest?.('[data-build-close]')) {
          actions.closeScouting();
          return;
        }
        actions.buildClick(event.nativeEvent);
      }}
    />
  );
}
