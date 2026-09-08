export const BUILD_PANEL_CSS = `
.build-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.72); pointer-events: auto; z-index: 20; }
.build-panel { width: min(1180px, 94vw); max-height: 88vh; overflow-y: auto; background: linear-gradient(180deg, #0a1428 0%, #06101f 100%); border: 1px solid #785a28; border-radius: 4px; color: #f0e6d2; font-family: var(--font-body, 'Spiegel'), 'Segoe UI', system-ui, sans-serif; position: relative; }

.build-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid #1e2328; position: relative; }
.build-identity { display: flex; align-items: center; gap: 12px; }
.build-champ-icon { width: 48px; height: 48px; border-radius: 50%; border: 2px solid #c8aa6e; flex-shrink: 0; }
.build-identity-meta { display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.build-champ-name { font-family: var(--font-display, 'Beaufort for LOL'), serif; font-size: 18px; color: #f0e6d2; line-height: 1.2; }
.build-identity-sub { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a09b8c; }
.build-role { display: inline-flex; align-items: center; gap: 4px; color: #c8aa6e; }
.build-role-icon { width: 15px; height: 15px; object-fit: contain; }
.build-mode-tag, .build-patch { border: 1px solid #463714; padding: 1px 6px; border-radius: 2px; }

.build-filters { display: flex; gap: 10px; margin-left: auto; position: relative; z-index: 5; overflow: visible; }
.build-filter { display: flex; flex-direction: column; gap: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #a09b8c; overflow: visible; }
.build-filter .drake-select { width: 150px; }
.build-select-wrap { display: flex; align-items: center; gap: 6px; overflow: visible; }
.build-filter-rank-icon { width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }

.build-stats { display: flex; gap: 14px; width: 100%; font-size: 12px; color: #a09b8c; }
.build-stat b { color: #f0e6d2; margin-right: 4px; }
.build-close { position: absolute; top: 10px; right: 12px; background: none; border: none; color: #a09b8c; font-size: 20px; cursor: pointer; }
.build-close:hover { color: #f0e6d2; }

.build-viewing-toast {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: linear-gradient(90deg, rgba(200, 170, 110, 0.25) 0%, rgba(1, 10, 19, 0.95) 100%);
  border-bottom: 1px solid #c8aa6e;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-size: 12px;
  color: #f0e6d2;
  margin-bottom: 12px;
}
.build-viewing-toast-icon { font-size: 14px; }
.build-viewing-toast-text b { color: #c8aa6e; }
.build-viewing-toast-close {
  background: rgba(30, 35, 40, 0.8);
  border: 1px solid #785a28;
  color: #f0e6d2;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 2px;
}
.build-viewing-toast-close:hover {
  border-color: #c8aa6e;
  background: #1e2328;
}

.build-body { display: flex; align-items: flex-start; gap: 16px; padding: 14px 18px 20px; }
.build-sidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
.build-main { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; align-content: start; }
.build-main-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.build-card { background: rgba(30,35,40,0.5); border: 1px solid #1e2328; border-radius: 3px; padding: 10px 12px; }
@media (max-width: 860px) {
  .build-body { flex-direction: column; }
  .build-sidebar { width: 100%; }
}
.build-card-title { display: flex; align-items: center; justify-content: space-between; font-family: var(--font-display, 'Beaufort for LOL'), serif; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #c8aa6e; margin-bottom: 8px; }

.build-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(30,35,40,0.8); }
.build-row:last-child { border-bottom: none; }
.build-row-lead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.build-row-num { font-size: 12px; font-weight: bold; color: #a09b8c; min-width: 14px; }
.build-row-num.hextech-badge { color: #0acbe6; text-shadow: 0 0 6px rgba(10, 203, 230, 0.6); }
.build-icons { display: flex; align-items: center; gap: 4px; }
.build-item { display: inline-flex; position: relative; }
.build-item.hextech-item {
  position: relative;
  border-radius: 3px;
  box-shadow: 0 0 10px rgba(10, 203, 230, 0.45), inset 0 0 4px rgba(10, 203, 230, 0.4);
}
.build-item.hextech-item::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 4px;
  border: 1px solid #0acbe6;
  pointer-events: none;
  animation: hextech-pulse 2.2s ease-in-out infinite alternate;
}
.build-item-icon.hextech-icon {
  border-color: #0acbe6;
  box-shadow: 0 0 8px rgba(10, 203, 230, 0.5);
}
@keyframes hextech-pulse {
  0% { opacity: 0.6; box-shadow: 0 0 4px rgba(10, 203, 230, 0.3); }
  100% { opacity: 1; box-shadow: 0 0 12px rgba(10, 203, 230, 0.8), 0 0 4px #c8aa6e; }
}
.build-item-icon, .build-spell-icon { width: 30px; height: 30px; border-radius: 2px; border: 1px solid #463714; }
.build-keystone-icon { width: 28px; height: 28px; border-radius: 3px; border: 1px solid #785a28; box-sizing: border-box; }
.build-perk-icon { width: 22px; height: 22px; border-radius: 50%; }
.build-shard-icon { width: 18px; height: 18px; border-radius: 50%; }
.build-style-icon { width: 24px; height: 24px; }
.build-arrow { color: #785a28; font-size: 13px; }

.build-item-phase { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(30,35,40,0.8); }
.build-item-phase-label { flex-shrink: 0; width: 56px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #a09b8c; }
.build-item-phase-label-core { border-bottom: none; padding-top: 4px; font-size: 12px; font-weight: bold; color: #a09b8c; text-transform: uppercase; letter-spacing: .06em; }
.build-item-phase-situational { align-items: flex-start; border-bottom: none; }
.build-item-phase-situational .build-item-phase-label { padding-top: 2px; }

.build-rune-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 0;
}
.build-rune-top-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.build-rune-bottom-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-left: 22px;
}
.build-rune-strip { display: flex; align-items: center; gap: 8px; }
.build-rune-tree-group { display: flex; align-items: center; gap: 5px; }
.build-rune-divider { display: inline-block; width: 1px; height: 22px; background: #3c3c41; margin: 0 4px; }
.build-rune-shards-group { display: flex; align-items: center; gap: 5px; min-height: 20px; }

.build-row-stats { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #a09b8c; white-space: nowrap; }
.build-wr { color: #0acbe6; }
.build-wr.is-positive { color: #2de071; }
.build-wr.is-negative { color: #e84057; }
.build-bar { display: inline-block; width: 54px; height: 4px; background: #1e2328; }
.build-bar i { display: block; height: 100%; background: #c8aa6e; }

.build-action { background: linear-gradient(180deg, #1e2328, #0a1428); border: 1px solid #785a28; color: #f0e6d2; font-size: 11px; padding: 3px 9px; cursor: pointer; }
.build-action:hover:not([disabled]) { border-color: #c8aa6e; }
.build-action[disabled] { opacity: .5; cursor: default; }

.build-trend { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0; }
.build-trend-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10px; color: #0acbe6; }

.build-skill-table-wrap { overflow-x: auto; margin-top: 4px; }
.build-skill-table { border-collapse: separate; border-spacing: 3px; }
.build-skill-key-th { padding: 0 6px 0 0; text-align: center; width: 28px; }
.build-skill-key-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #1e2328;
  border: 1px solid #785a28;
  color: #f0e6d2;
  font-family: var(--font-display, 'Beaufort for LOL'), serif;
  font-size: 12px;
  font-weight: bold;
}
.build-skill-grid-cell {
  width: 24px;
  height: 24px;
  text-align: center;
  vertical-align: middle;
  background: rgba(1, 10, 19, 0.7);
  border: 1px solid rgba(60, 60, 65, 0.6);
  color: transparent;
  font-size: 11px;
  font-weight: 600;
}
.build-skill-grid-cell.is-active {
  background: rgba(10, 203, 230, 0.28);
  border-color: #0acbe6;
  color: #f0e6d2;
}
.build-skill-stats-note {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: #a09b8c;
  margin-top: 8px;
}
.build-skill-games b { color: #f0e6d2; }

.build-counters { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.build-sidebar .build-counters { grid-template-columns: 1fr; gap: 10px; }
.build-counter-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
.build-counter-head.is-strong { color: #2de071; }
.build-counter-head.is-weak { color: #e84057; }
.build-counter { display: flex; align-items: center; gap: 7px; padding: 3px 0; font-size: 11px; }
.build-counter-icon { width: 24px; height: 24px; border-radius: 50%; }
.build-counter-name { flex: 1; color: #f0e6d2; }
.build-counter-play { color: #5b5a56; }

.build-toplist { display: flex; flex-direction: column; }
.build-toplist-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 2px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(30,35,40,0.6);
  color: inherit;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.build-toplist-row:last-child { border-bottom: none; }
.build-toplist-row:hover { background: rgba(200, 170, 110, 0.08); }
.build-toplist-rank { flex-shrink: 0; width: 18px; color: #a09b8c; }
.build-toplist-tier-icon { width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }
.build-toplist-name { flex: 1; min-width: 0; color: #f0e6d2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.build-placeholder { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 48px 18px; color: #a09b8c; font-size: 13px; }
.build-placeholder.is-error { color: #e84057; }
.build-empty { color: #5b5a56; font-size: 11px; padding: 8px 0; }
.build-loading { display: flex; align-items: center; gap: 8px; color: #a09b8c; font-size: 12px; padding: 12px 0; }
.build-spinner { animation: build-spin 1s linear infinite; }
@keyframes build-spin { to { transform: rotate(360deg); } }

.team-reveal-shell .build-panel {
  width: 100%;
  max-height: none;
  overflow-y: visible;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  color: inherit;
  font-family: inherit;
}
.team-reveal-shell .build-header {
  padding: 0 0 14px;
  border-bottom: 1px solid #1e2328;
  margin-bottom: 14px;
  overflow: visible;
  z-index: 6;
}
.team-reveal-shell .build-body {
  padding: 0;
}
.team-reveal-shell .build-close {
  display: none;
}
`;
