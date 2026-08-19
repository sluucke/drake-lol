import { watchAnchor } from './dodgeDock.js';
import spriteUrl from '../../assets/drake-spritesheet.png';

export const SOCIAL_BAR_SELECTOR = '.lol-social-version-bar';
export const TOGGLE_SELECTOR = 'button[data-drake-toggle]';
export const STYLE_ID = 'drake-social-toggle-style';
const BUG_BTN_SELECTOR =
  'button[data-dd-action-name="button.social.report_bug"], button.bug-report-button:not([data-drake-toggle])';

export function socialToggleCss() {
  return `
button.bug-report-button[data-drake-toggle] {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  min-height: 34px !important;
  margin: 0 0 0 4px;
  padding: 0 !important;
  border: none !important;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 0 !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  background-color: transparent !important;
  background-image: url("${spriteUrl}") !important;
  background-repeat: no-repeat !important;
  background-size: 100% 400% !important;
  background-position: 0 0 !important;
}
button.bug-report-button[data-drake-toggle]:hover,
button.bug-report-button[data-drake-toggle][aria-pressed="true"] {
  background-position: 0 33.333% !important;
}
button.bug-report-button[data-drake-toggle]:active {
  background-position: 0 66.666% !important;
}
button.bug-report-button[data-drake-toggle]:disabled {
  background-position: 0 100% !important;
}`;
}

function isVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
}

function searchSocialBar(root) {
  if (!root?.querySelector) return null;
  const bar = isVisible(root.querySelector(SOCIAL_BAR_SELECTOR));
  if (bar) return bar;
  const bug = root.querySelector(BUG_BTN_SELECTOR);
  if (bug?.parentElement) return isVisible(bug.parentElement);
  return null;
}

function searchIframes(doc) {
  if (typeof doc.querySelectorAll !== 'function') return null;
  for (const iframe of doc.querySelectorAll('iframe')) {
    try {
      const found = searchSocialBar(iframe.contentDocument);
      if (found) return found;
    } catch {
      /* cross-origin */
    }
  }
  return null;
}

export function findSocialBar(doc) {
  return searchSocialBar(doc) || searchIframes(doc);
}

export function injectSocialToggleStyles(doc) {
  if (!doc?.createElement) return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = socialToggleCss();
  (doc.head || doc.documentElement)?.appendChild(style);
}

export function syncSocialToggle(doc, open) {
  const bar = findSocialBar(doc);
  const btn =
    bar?.querySelector?.('[data-drake-toggle]') ||
    doc.querySelector?.(TOGGLE_SELECTOR);
  if (!btn) return;
  btn.setAttribute('aria-label', open ? 'Close Drake' : 'Open Drake');
  btn.setAttribute('aria-pressed', String(open));
}

export function mountSocialToggle(doc, { onToggle, isOpen }) {
  const bar = findSocialBar(doc);
  if (!bar) return false;

  const owner = bar.ownerDocument || doc;
  injectSocialToggleStyles(owner);

  let btn = bar.querySelector('[data-drake-toggle]');
  if (btn && btn.parentNode !== bar) {
    bar.appendChild(btn);
  }
  if (!btn) {
    btn = owner.createElement('button');
    btn.type = 'button';
    btn.className = 'bug-report-button';
    btn.innerHTML = '';
    btn.setAttribute('data-drake-toggle', 'true');
    btn.setAttribute('data-dd-action-name', 'button.social.drake');
    btn.setAttribute('title', 'Drake');
    btn.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      },
      true,
    );
    const bugBtn = bar.querySelector(BUG_BTN_SELECTOR);
    if (bugBtn?.nextSibling) bar.insertBefore(btn, bugBtn.nextSibling);
    else bar.appendChild(btn);
  }

  syncSocialToggle(doc, isOpen());
  if (!mountSocialToggle.logged) {
    mountSocialToggle.logged = true;
    console.log('[Drake] social toggle mounted in', bar.className || SOCIAL_BAR_SELECTOR);
  }
  return true;
}

export function watchSocialToggle(doc, win, cb) {
  injectSocialToggleStyles(doc);
  return watchAnchor(doc, win, cb);
}
