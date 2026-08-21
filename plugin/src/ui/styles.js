import { CHECKBOX_SPRITE } from './assets.js';












const DISPLAY = `var(--font-display, 'Beaufort for LOL'), serif`;
const BODY = `var(--font-body, 'Spiegel'), 'Segoe UI', system-ui, sans-serif`;

export const CSS = `
:host, * { box-sizing: border-box; }





::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #010a13;
  border-left: 1px solid #1e2328;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #785a28, #463714);
  border: 1px solid #010a13;
  
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
}

::-webkit-scrollbar-thumb:active {
  background: #c8aa6e;
}



::-webkit-scrollbar-button,
::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}



::-webkit-resizer {
  background:
    linear-gradient(135deg, transparent 0 42%, #785a28 42% 52%, transparent 52% 66%),
    linear-gradient(135deg, transparent 0 66%, #785a28 66% 76%, transparent 76%);
  background-color: #010a13;
}

.scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  font-family: ${BODY};


  pointer-events: auto;
}

.window {
  width: 720px;
  max-width: 92vw;
  height: 86vh;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 90% 45% at 50% -10%, rgba(8, 30, 60, 0.55) 0%, transparent 58%),
    #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.8);
}



.titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #1e2328;
  background: linear-gradient(to bottom, rgba(30, 35, 40, 0.6), transparent);
}

.mark {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
  display: block;
}

.title {
  font-family: ${DISPLAY};
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #f0e6d2;
  flex: 1;
}

.hint {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #5c5b57;
  text-transform: uppercase;
}

.close {
  width: 24px;
  height: 24px;
  border: 1px solid #785a28;
  background: transparent;
  color: #c8aa6e;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.close:hover { color: #f0e6d2; border-color: #c8aa6e; }



.body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.nav {
  width: 168px;
  flex-shrink: 0;
  padding: 14px 0;
  border-right: 1px solid #1e2328;
}

.navitem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 18px;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  color: #a09b8c;
  font-family: ${DISPLAY};
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}
.navitem:hover { color: #f0e6d2; }
.navitem[aria-selected='true'] {
  color: #f0e6d2;
  border-left-color: #c8aa6e;
  background: linear-gradient(to right, rgba(200, 170, 110, 0.14), transparent);
}

.content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
  overflow-y: auto;
}

.screen-title {
  font-family: ${DISPLAY};
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #f0e6d2;
  margin: 0 0 4px;
}

.screen-sub {
  font-size: 12px;
  line-height: 1.5;
  color: #a09b8c;
  margin: 0 0 18px;
}

.rule {
  height: 1px;
  background: linear-gradient(to right, #785a28, transparent);
  margin: 18px 0;
}



.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.check-row:disabled { cursor: default; opacity: 0.5; }

.check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background: url('${CHECKBOX_SPRITE}') no-repeat 0 0 / 14px 56px;
}
.check-row:hover:not(:disabled) .check { background-position: 0 -14px; }
.check[data-checked='true'] { background-position: 0 -28px; }
.check-row:hover:not(:disabled) .check[data-checked='true'] { background-position: 0 -42px; }

.check-label {
  font-size: 13px;
  font-weight: 600;
  color: #a09b8c;
}
.check-row:hover:not(:disabled) .check-label { color: #f0e6d2; }

.check-help {
  font-size: 11px;
  line-height: 1.5;
  color: #5c5b57;
  margin: 6px 0 0 24px;
  max-width: 46ch;
}
.reveal-recommend {
  font-size: 11px;
  line-height: 1.5;
  color: #0a8f3c;
  margin: 6px 0 0;
  max-width: 46ch;
}
.reveal-warn {
  font-size: 11px;
  line-height: 1.5;
  color: #c84a4a;
  margin: 6px 0 0;
  max-width: 46ch;
}



.footer {
  padding: 10px 18px;
  border-top: 1px solid #1e2328;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #5c5b57;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}


.hextech-btn, .pill, .navitem, .champ, .skin, .rank, .check-row, .select-wrap {
  transition: filter 90ms ease, color 90ms ease, border-color 90ms ease,
    box-shadow 90ms ease, background 90ms ease, transform 60ms ease;
}
.hextech-btn:active:not(:disabled),
.pill:active,
.champ:active,
.skin:active,
.rank:active {
  transform: translateY(1px);
}

.status-bad { color: #c33c3c; }
.status-good { color: #0acbe6; }



.field { margin-top: 16px; }
.field-off { opacity: 0.45; }

.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #a09b8c;
}

.field-value {
  font-family: ${DISPLAY};
  font-size: 15px;
  color: #f0e6d2;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: linear-gradient(to right, #785a28, #1e2328);
  outline: none;
  cursor: pointer;
}
.slider:disabled { cursor: default; }



.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #c8aa6e;
  border: 1px solid #010a13;
  transform: rotate(45deg);
  cursor: pointer;
}
.slider:disabled::-webkit-slider-thumb { background: #5c5b57; cursor: default; }





.cancel-dock {
  position: fixed;
  left: 50%;
  bottom: 12vh;
  transform: translateX(-50%);
  pointer-events: auto;
  z-index: 1;
}
.cancel-dock[hidden] { display: none; }





.dodge-dock {
  position: fixed;
  pointer-events: auto;
  z-index: 2;
}
.dodge-dock[hidden] { display: none; }

.hextech-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 168px;
  min-height: 32px;
  padding: 5px 1.3em;
  font-family: ${DISPLAY};
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: #1e2328;
  color: #c8aa6e;
  box-shadow: 0 0 1px 1px #010a13, inset 0 0 1px 1px #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  cursor: pointer;
}
.hextech-btn:hover {
  color: #f0e6d2;
  text-shadow: 0 0 5px #ffffff80;
  box-shadow: 0 0 8px 0 #ffffff50;
  background: linear-gradient(to bottom, #1e2328, #433d2b);
}



.status-box {
  display: block;
  width: 100%;
  min-height: 120px;
  max-height: 46vh;
  padding: 10px 12px;
  color: #f0e6d2;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25) inset;
  outline: none;


  resize: vertical;


  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.15;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}
.status-box:focus {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.status-actions-spacer { flex: 1; }

.status-count {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #5c5b57;
}

.hextech-btn-muted {
  min-width: 0;
  padding: 5px 1.1em;
  border-width: 1px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: none;
}

.pill-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.pill {
  padding: 5px 14px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #a09b8c;
  background: #1e2328;
  border: 1px solid #3c3c41;
  cursor: pointer;
}
.pill:hover { color: #f0e6d2; border-color: #785a28; }
.pill[aria-selected='true'] {
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border-color: #c8aa6e;
}

.champ-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 4px;
}
.champ-grid-sm {
  max-height: 180px;
}

.champ {
  position: relative;
  padding: 0;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
  line-height: 0;
  filter: grayscale(0.55) brightness(0.8);
}
.champ img { width: 100%; display: block; }
.champ:hover { filter: none; border-color: #785a28; }
.champ-on {
  filter: none;
  border-color: #c8aa6e;
  box-shadow: 0 0 8px rgba(200, 170, 110, 0.5);
}
.champ-slot {
  position: absolute;
  top: 2px;
  left: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border: 1px solid #c8aa6e;
  border-radius: 2px;
  pointer-events: none;
}

.pick-order {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
}
.pick-order-empty {
  margin: 0 0 10px;
  color: #a09b8c;
  font-size: 12px;
}
.pick-order-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 10px;
  font-size: 12px;
  color: #f0e6d2;
  background: rgba(1, 10, 19, 0.55);
  border: 1px solid #785a28;
  border-radius: 4px;
}
.pick-order-remove.close {
  width: 18px;
  height: 18px;
  border: none;
  font-size: 11px;
  flex-shrink: 0;
}
.pick-order-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 700;
  color: #010a13;
  background: linear-gradient(to bottom, #c8aa6e, #785a28);
  border-radius: 50%;
}
.pick-order-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.hextech-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
  outline: none;
}
.hextech-input:focus {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
  background: linear-gradient(to right, rgba(32, 39, 44, 0.9), rgba(7, 16, 25, 0.7));
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.row .hextech-input { flex: 1; }

select.hextech-input {
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
select.hextech-input option { background: #010a13; color: #f0e6d2; }

.friend-list { display: flex; flex-direction: column; }

.friend {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px solid #1e2328;
  font-size: 12px;
}

.dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  background: #3c3c41;
  transform: rotate(45deg);
}
.dot-on { background: #0acbe6; }

.friend-name { color: #f0e6d2; }
.friend-note {
  color: #5c5b57;
  margin-left: auto;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}



.rank-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}

.rank {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 2px;
  background: none;
  border: 1px solid transparent;
  color: #a09b8c;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  filter: grayscale(0.7) brightness(0.75);
}
.rank img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  object-position: center;
  display: block;
  margin: 0 auto;
}
.rank:hover { filter: none; color: #f0e6d2; border-color: #785a28; }
.rank-on {
  filter: none;
  color: #f0e6d2;
  border-color: #c8aa6e;
  background: linear-gradient(to bottom, rgba(200, 170, 110, 0.16), transparent);
}



.select-wrap {
  position: relative;
  display: flex;
  flex: 1;
  height: 32px;
  background: linear-gradient(to bottom, rgba(7, 16, 25, 0.9), rgba(0, 0, 0, 0.8));
  border: thin solid #785a28;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
}
.select-wrap:focus-within {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;
}

.select-field {
  flex: 1;


  -webkit-appearance: none;
  appearance: none;
  padding: 0 26px 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
}
.select-field {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.select-field option {
  background: #010a13;
  color: #f0e6d2;
  text-transform: none;
  letter-spacing: 0;
}

.select-arrows {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 22px;
  border-left: thin solid #785a28;
  background: linear-gradient(to bottom, #1e2328, #010a13);
  color: #c8aa6e;
  font-size: 6px;
  line-height: 1.3;
  
  pointer-events: none;
}
.select-wrap:hover .select-arrows { color: #f0e6d2; }
.select-wrap:hover { border-color: #c8aa6e; }

.select-field:focus + .select-arrows { color: #f0e6d2; }





.skin-viewport {
  height: 300px;
  overflow-y: auto;
  margin-top: 10px;
  padding-right: 4px;
}

.skin-spacer { position: relative; }

.skin-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  align-content: start;
}



.skin {
  display: flex;
  flex-direction: column;
  height: 84px;
  padding: 0;
  background: #010a13;
  border: 2px solid transparent;
  cursor: pointer;
  color: #a09b8c;
  font-size: 10px;
  text-align: left;
  overflow: hidden;
  filter: grayscale(0.4) brightness(0.8);
}
.skin img {
  width: 100%;
  height: 62px;
  flex: none;
  display: block;


  object-fit: cover;
}
.skin span {
  display: block;
  flex: none;
  padding: 3px 4px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skin:hover { filter: none; border-color: #785a28; color: #f0e6d2; }
.skin-on { filter: none; border-color: #c8aa6e; color: #f0e6d2; }



.split-input {
  display: flex;
  align-items: center;
  height: 32px;
  background-color: rgba(0, 0, 0, 0.7);
  border: thin solid #785a28;
}
.split-input:focus-within {
  border-image: linear-gradient(to bottom, #785a28, #c8aa6e) 1 stretch;


  background: linear-gradient(to right, rgba(32, 39, 44, 0.9), rgba(7, 16, 25, 0.7));
}

.split-name, .split-tag {
  height: 100%;
  padding: 0 8px;
  color: #f0e6d2;
  font-size: 12px;
  background: transparent;
  border: none;
  outline: none;
}
.split-name { flex: 1; }
.split-tag { width: 74px; }

.split-hash {
  width: 9px;
  height: 9px;
  opacity: 0.55;
  flex-shrink: 0;
}

.team-reveal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  pointer-events: auto;
  z-index: 2147483646;
  font-family: ${BODY};
  color: #a09b8c;
}
.team-reveal-overlay[hidden] { display: none; }
.team-reveal-status {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483645;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(320px, calc(100vw - 32px));
  padding: 7px 10px 10px;
  overflow: hidden;
  background: rgba(1, 10, 19, 0.78);
  border: 1px solid rgba(200, 170, 109, 0.32);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: #f0e6d2;
  font-family: ${BODY};
  font-size: 12px;
  letter-spacing: 0.02em;
  pointer-events: auto;
}
.team-reveal-status-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  transform-origin: left center;
  background: #c8aa6d;
  pointer-events: none;
}
@keyframes team-reveal-status-shrink {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}
.team-reveal-status[hidden] { display: none; }
.team-reveal-status-spinner {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #c8aa6d;
  flex-shrink: 0;
}
.team-reveal-spinner-svg {
  display: block;
  animation: team-reveal-spin 0.8s linear infinite;
}
@keyframes team-reveal-spin {
  to { transform: rotate(360deg); }
}
.team-reveal-status-text {
  line-height: 1.25;
}
.team-reveal-status-open {
  appearance: none;
  border: 1px solid rgba(200, 170, 109, 0.55);
  background: rgba(200, 170, 109, 0.12);
  color: #c8aa6d;
  font-family: ${DISPLAY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.team-reveal-status-open:hover {
  background: rgba(200, 170, 109, 0.22);
}
.team-reveal-shell {
  position: relative;
  box-sizing: border-box;
  width: min(980px, 94vw);
  max-height: 86vh;
  padding: 36px 16px 16px;
  background:
    radial-gradient(ellipse 90% 45% at 50% -10%, rgba(8, 30, 60, 0.55) 0%, transparent 58%),
    #010a13;
  border: 2px solid transparent;
  border-image: linear-gradient(to bottom, #c8aa6d, #7a5c29);
  border-image-slice: 1;
  box-shadow: 0 0 32px rgba(0, 0, 0, 0.8);
}
.team-reveal-close {
  position: absolute;
  top: 8px;
  right: 8px;
  appearance: none;
  border: 1px solid rgba(200, 170, 109, 0.4);
  background: rgba(1, 10, 19, 0.65);
  color: #c8aa6d;
  font-family: ${DISPLAY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 4px 8px;
  cursor: pointer;
  z-index: 2;
}
.team-reveal-close:hover {
  background: rgba(200, 170, 109, 0.16);
}
.team-reveal-panel {
  max-height: calc(86vh - 36px);
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}
.team-reveal-card {
  border: 1px solid #3c3c41;
  background: linear-gradient(to bottom, rgba(30, 35, 40, 0.35), rgba(0, 0, 0, 0.45));
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.team-reveal-card.is-you {
  border-color: #785a28;
  box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.18);
}
.team-reveal-card-head {
  padding-bottom: 8px;
  border-bottom: 1px solid #1e2328;
}
.team-reveal-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-reveal-role-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  object-fit: contain;
  opacity: 0.92;
}
.team-reveal-card-title {
  color: #f0e6d2;
  font-family: ${DISPLAY};
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.team-reveal-you {
  color: #c8aa6e;
  font-family: ${BODY};
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: none;
  font-weight: 600;
}
.team-reveal-ranks {
  display: grid;
  gap: 8px;
}
.team-reveal-rank-block {
  padding: 8px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid #1e2328;
}
.team-reveal-rank-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-reveal-rank-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  object-fit: contain;
}
.team-reveal-rank-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.team-reveal-rank-queue {
  color: #5c5b57;
  font-family: ${DISPLAY};
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.team-reveal-rank-tier {
  color: #f0e6d2;
  font-family: ${BODY};
  font-size: 12px;
  font-weight: 600;
}
.team-reveal-card-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
  border-top: 1px solid #1e2328;
}
.team-reveal-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  margin-top: 4px;
  gap: 10px;
}
.team-reveal-card-label {
  color: #5c5b57;
  flex-shrink: 0;
  font-family: ${DISPLAY};
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.team-reveal-card-value {
  color: #a09b8c;
  text-align: right;
  font-family: ${BODY};
}
.team-reveal-champ {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.team-reveal-champ-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
}
.team-reveal-recent-games {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.team-reveal-recent-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 28px;
}
.team-reveal-recent-game .team-reveal-champ-icon {
  width: 22px;
  height: 22px;
  box-shadow: 0 0 0 1px #1e2328;
}
.team-reveal-recent-game.is-win .team-reveal-champ-icon {
  box-shadow: 0 0 0 1px #0acbe6;
}
.team-reveal-recent-game.is-loss .team-reveal-champ-icon {
  box-shadow: 0 0 0 1px #c33c3c;
}
.team-reveal-recent-kda {
  color: #a09b8c;
  font-family: ${BODY};
  font-size: 9px;
  line-height: 1;
  white-space: nowrap;
}
.team-reveal-recent-empty {
  color: #5c5b57;
}
.wl-win { color: #0acbe6; }
.wl-loss { color: #c33c3c; }
.drake-reveal-name {
  color: inherit;
  display: block;
  white-space: nowrap;
}
.drake-reveal-stats {
  color: #a09b8c;
  font-size: 10px;
  display: block;
  line-height: 1.05;
  margin-top: 1px;
  white-space: nowrap;
}

.hextech-btn-danger {
  color: #c33c3c;
  border-image: linear-gradient(to bottom, #c33c3c, #6b1f1f);
  border-image-slice: 1;
}
.hextech-btn-danger:hover {
  color: #ff6b6b;
  background: linear-gradient(to bottom, #1e2328, #3a2020);
  box-shadow: 0 0 8px 0 #c33c3c50;
}
`;
