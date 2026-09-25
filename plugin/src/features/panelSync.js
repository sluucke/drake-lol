export function createPanelSync({ now = () => Date.now(), ignoreMs = 1500 } = {}) {
  let ignoreOpenUntil = 0;
  return {
    localChange(open) {
      ignoreOpenUntil = open ? 0 : now() + ignoreMs;
    },
    remote(wantOpen, panelOpen) {
      if (!!wantOpen === !!panelOpen) return 'noop';
      if (wantOpen && now() < ignoreOpenUntil) return 'reject';
      return 'apply';
    },
  };
}
