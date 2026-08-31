export const BUILD_PANEL_CSS = `
.build-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.72); pointer-events: auto; z-index: 20; }
.build-panel { width: min(1180px, 94vw); max-height: 88vh; overflow-y: auto; background: linear-gradient(180deg, #0a1428 0%, #06101f 100%); border: 1px solid #785a28; border-radius: 4px; color: #f0e6d2; font-family: var(--font-body, 'Spiegel'), 'Segoe UI', system-ui, sans-serif; }

.build-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid #1e2328; position: relative; }
.build-identity { display: flex; align-items: center; gap: 10px; }
.build-champ-icon { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #c8aa6e; }
.build-champ-name { font-family: var(--font-display, 'Beaufort for LOL'), serif; font-size: 18px; color: #f0e6d2; }
.build-identity-sub { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a09b8c; }
.build-mode-tag, .build-patch { border: 1px solid #463714; padding: 1px 6px; border-radius: 2px; }

.build-filters { display: flex; gap: 10px; margin-left: auto; }
.build-filter { display: flex; flex-direction: column; gap: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #a09b8c; }
.build-filter select { background: #1e2328; color: #f0e6d2; border: 1px solid #785a28; padding: 4px 8px; font-size: 12px; }

.build-stats { display: flex; gap: 14px; width: 100%; font-size: 12px; color: #a09b8c; }
.build-stat b { color: #f0e6d2; margin-right: 4px; }
.build-close { position: absolute; top: 10px; right: 12px; background: none; border: none; color: #a09b8c; font-size: 20px; cursor: pointer; }
.build-close:hover { color: #f0e6d2; }

.build-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; padding: 14px 18px; }
.build-card { background: rgba(30,35,40,0.5); border: 1px solid #1e2328; border-radius: 3px; padding: 10px 12px; }
.build-card-title { display: flex; align-items: center; justify-content: space-between; font-family: var(--font-display, 'Beaufort for LOL'), serif; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #c8aa6e; margin-bottom: 8px; }

.build-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(30,35,40,0.8); }
.build-row:last-child { border-bottom: none; }
.build-icons { display: flex; align-items: center; gap: 4px; }
.build-item-icon, .build-spell-icon, .build-keystone-icon { width: 30px; height: 30px; border-radius: 2px; border: 1px solid #463714; }
.build-perk-icon, .build-shard-icon { width: 20px; height: 20px; }
.build-style-icon { width: 22px; height: 22px; }
.build-arrow { color: #785a28; font-size: 13px; }

.build-row-stats { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a09b8c; white-space: nowrap; }
.build-wr { color: #0acbe6; }
.build-bar { display: inline-block; width: 54px; height: 4px; background: #1e2328; }
.build-bar i { display: block; height: 100%; background: #c8aa6e; }

.build-action { background: linear-gradient(180deg, #1e2328, #0a1428); border: 1px solid #785a28; color: #f0e6d2; font-size: 11px; padding: 3px 9px; cursor: pointer; }
.build-action:hover:not([disabled]) { border-color: #c8aa6e; }
.build-action[disabled] { opacity: .5; cursor: default; }

.build-trend { display: flex; gap: 8px; overflow-x: auto; }
.build-trend-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; color: #0acbe6; }
.build-skill-priority { display: flex; align-items: center; gap: 5px; margin-bottom: 6px; }
.build-skill { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid #785a28; color: #f0e6d2; font-size: 11px; }
.build-skill-order { display: flex; gap: 2px; flex-wrap: wrap; }
.build-skill-step { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: #1e2328; font-size: 10px; color: #a09b8c; }

.build-counters { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.build-counter-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
.build-counter-head.is-strong { color: #0acbe6; }
.build-counter-head.is-weak { color: #e84057; }
.build-counter { display: flex; align-items: center; gap: 7px; padding: 3px 0; font-size: 11px; }
.build-counter-icon { width: 24px; height: 24px; border-radius: 50%; }
.build-counter-name { flex: 1; color: #f0e6d2; }
.build-counter.is-strong .build-counter-wr { color: #0acbe6; }
.build-counter.is-weak .build-counter-wr { color: #e84057; }
.build-counter-play { color: #5b5a56; }

.build-players { width: 100%; border-collapse: collapse; font-size: 11px; }
.build-players th { text-align: left; color: #a09b8c; font-weight: normal; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px; border-bottom: 1px solid #1e2328; }
.build-players td { padding: 4px 6px; border-bottom: 1px solid rgba(30,35,40,0.6); }
.build-viewing-chip { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #c8aa6e; padding: 5px 0; }

.build-placeholder { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px 18px; color: #a09b8c; font-size: 13px; }
.build-placeholder.is-error { color: #e84057; }
.build-empty { color: #5b5a56; font-size: 11px; padding: 8px 0; }
.build-loading { display: flex; align-items: center; gap: 8px; color: #a09b8c; font-size: 12px; padding: 12px 0; }
.build-spinner { animation: build-spin 1s linear infinite; }
@keyframes build-spin { to { transform: rotate(360deg); } }
`;
