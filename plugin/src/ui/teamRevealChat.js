export const CHAT_MAP_ATTR = 'data-drake-chat-map';
export const CHAT_AUTHOR_ORIGINAL_KEY = 'drakeChatOriginal';
export const CHAT_AUTHOR_APPLIED_KEY = 'drakeChatApplied';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export function buildChatNameEntries(pairs) {
  if (!Array.isArray(pairs)) return [];
  const out = [];
  const seen = new Set();
  for (const pair of pairs) {
    const from = String(pair?.from || '').trim();
    const to = String(pair?.to || '').trim();
    if (!from || !to) continue;
    if (normalizeName(from) === normalizeName(to)) continue;
    const key = `${normalizeName(from)}=>${normalizeName(to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out;
}

export function formatChatMapMessage(entries) {
  return buildChatNameEntries(entries)
    .map((entry) => `${entry.from} → ${entry.to}`)
    .join('\n');
}

export function collectRevealChatPairs(boundLabels, rows, originalKey = 'drakeTeamRevealOriginal') {
  if (!boundLabels || typeof boundLabels.entries !== 'function') return [];
  const byCell = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [Number(row?.cellId), row]),
  );
  const pairs = [];
  for (const [cellId, label] of boundLabels.entries()) {
    const from = String(label?.dataset?.[originalKey] || '').trim();
    const to = String(byCell.get(Number(cellId))?.riotId || '').trim();
    if (!from || !to) continue;
    pairs.push({ from, to });
  }
  return buildChatNameEntries(pairs);
}

function matchesClassContains(node, token) {
  return String(node?.className || '').includes(token);
}

function isChatRoot(node) {
  if (!node) return false;
  if (matchesClassContains(node, 'chat-window')) return true;
  if (matchesClassContains(node, 'chat-room')) return true;
  if (matchesClassContains(node, 'ChatWindow')) return true;
  if (matchesClassContains(node, 'conversation')) return true;
  return false;
}

function findChatRoot(doc) {
  const selectors = [
    '.chat-window',
    '[class*="chat-window"]',
    '[class*="ChatWindow"]',
    '[class*="chat-room"]',
    '[class*="conversation-window"]',
  ];
  for (const selector of selectors) {
    const node = doc.querySelector?.(selector);
    if (node) return node;
  }
  for (const node of doc.querySelectorAll?.('[class*="chat"]') || []) {
    if (isChatRoot(node)) return node;
  }
  return null;
}

function isMapNode(node) {
  if (!node) return false;
  if (node.dataset?.drakeChatMap != null) return true;
  return node.getAttribute?.(CHAT_MAP_ATTR) != null;
}

function isAuthorLike(node) {
  if (!node || isMapNode(node)) return false;
  const cls = String(node.className || '');
  if (!cls) return false;
  const lower = cls.toLowerCase();
  if (!lower.includes('name')) return false;
  if (lower.includes('username') || lower.includes('filename') || lower.includes('cname')) return false;
  const text = String(node.textContent || '').trim();
  return Boolean(text) && text.length <= 48;
}

function walkNodes(root, visit) {
  if (!root) return;
  visit(root);
  for (const child of root.children || []) walkNodes(child, visit);
}

function readAuthorCandidates(doc) {
  const roots = [];
  const chatRoot = findChatRoot(doc);
  if (chatRoot) roots.push(chatRoot);
  if (!roots.length && doc.body) roots.push(doc.body);

  const seen = new Set();
  const out = [];
  for (const root of roots) {
    walkNodes(root, (node) => {
      if (seen.has(node) || !isAuthorLike(node)) return;
      seen.add(node);
      out.push(node);
    });
  }
  return out;
}

function lookupEntry(entriesByFrom, text) {
  const key = normalizeName(text);
  if (!key) return null;
  return entriesByFrom.get(key) || null;
}

function applyAuthor(node, entry) {
  if (!node || !entry) return;
  if (!node.dataset) node.dataset = {};
  const current = String(node.textContent || '').trim();
  if (normalizeName(current) === normalizeName(entry.to)) {
    if (!node.dataset[CHAT_AUTHOR_ORIGINAL_KEY]) {
      node.dataset[CHAT_AUTHOR_ORIGINAL_KEY] = entry.from;
    }
    node.dataset[CHAT_AUTHOR_APPLIED_KEY] = '1';
    node.setAttribute?.('data-drake-chat-applied', '1');
    return;
  }
  if (!node.dataset[CHAT_AUTHOR_ORIGINAL_KEY]) {
    node.dataset[CHAT_AUTHOR_ORIGINAL_KEY] = current || entry.from;
  }
  node.textContent = entry.to;
  node.dataset[CHAT_AUTHOR_APPLIED_KEY] = '1';
  node.setAttribute?.('data-drake-chat-applied', '1');
}

function restoreAuthor(node) {
  if (!node?.dataset) return;
  if (node.dataset[CHAT_AUTHOR_ORIGINAL_KEY] != null) {
    node.textContent = node.dataset[CHAT_AUTHOR_ORIGINAL_KEY];
  }
  delete node.dataset[CHAT_AUTHOR_ORIGINAL_KEY];
  delete node.dataset[CHAT_AUTHOR_APPLIED_KEY];
  node.removeAttribute?.('data-drake-chat-applied');
}

export function makeTeamRevealChat({
  doc,
  MutationObserverImpl = typeof MutationObserver !== 'undefined' ? MutationObserver : null,
  pollMs = 500,
  setIntervalImpl = typeof setInterval !== 'undefined' ? setInterval : null,
  clearIntervalImpl = typeof clearInterval !== 'undefined' ? clearInterval : null,
} = {}) {
  let entries = [];
  let entriesByFrom = new Map();
  let mapNode = null;
  let observer = null;
  let pollTimer = null;

  function indexEntries(list) {
    entries = buildChatNameEntries(list);
    entriesByFrom = new Map(entries.map((entry) => [normalizeName(entry.from), entry]));
  }

  function ensureMapNode(root) {
    if (mapNode?.isConnected) {
      if (mapNode.parentNode === root) return mapNode;
      mapNode.remove?.();
      mapNode = null;
    }
    const existing = root.querySelector?.(`[${CHAT_MAP_ATTR}]`) || doc.querySelector?.(`[${CHAT_MAP_ATTR}]`);
    if (existing) {
      if (existing.parentNode !== root) {
        existing.remove?.();
      } else {
        mapNode = existing;
        return mapNode;
      }
    }
    const node = doc.createElement('div');
    node.className = 'drake-chat-map';
    node.setAttribute(CHAT_MAP_ATTR, '1');
    node.dataset.drakeChatMap = '1';
    if (node.style) {
      node.style.whiteSpace = 'pre-wrap';
      node.style.opacity = '0.85';
      node.style.fontSize = '12px';
      node.style.padding = '6px 8px';
    }
    root.appendChild(node);
    mapNode = node;
    return mapNode;
  }

  function syncMapMessage() {
    const root = findChatRoot(doc);
    if (!root) return false;
    if (!entries.length) {
      removeMapMessage();
      return false;
    }
    const node = ensureMapNode(root);
    const next = formatChatMapMessage(entries);
    if (node.textContent !== next) node.textContent = next;
    return true;
  }

  function rewriteAuthors() {
    if (!entries.length) return;
    for (const node of readAuthorCandidates(doc)) {
      if (isMapNode(node)) continue;
      const original = node.dataset?.[CHAT_AUTHOR_ORIGINAL_KEY];
      const current = String(node.textContent || '').trim();
      const entry =
        lookupEntry(entriesByFrom, original) ||
        lookupEntry(entriesByFrom, current);
      if (!entry) continue;
      applyAuthor(node, entry);
    }
  }

  function restoreAuthors() {
    const seen = new Set();
    const visit = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      if (node.dataset?.[CHAT_AUTHOR_APPLIED_KEY] || node.dataset?.[CHAT_AUTHOR_ORIGINAL_KEY]) {
        restoreAuthor(node);
      }
    };
    for (const node of doc.querySelectorAll?.('[data-drake-chat-applied]') || []) visit(node);
    for (const node of readAuthorCandidates(doc)) visit(node);
  }

  function removeMapMessage() {
    if (mapNode?.remove) mapNode.remove();
    mapNode = null;
    for (const node of doc.querySelectorAll?.(`[${CHAT_MAP_ATTR}]`) || []) {
      node.remove?.();
    }
  }

  function sync() {
    const mapped = syncMapMessage();
    rewriteAuthors();
    if (mapped && mapNode?.isConnected) stopPoll();
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect?.();
    observer = null;
  }

  function stopPoll() {
    if (pollTimer == null) return;
    clearIntervalImpl?.(pollTimer);
    pollTimer = null;
  }

  function startPoll() {
    if (!setIntervalImpl || pollTimer != null || !(pollMs > 0)) return;
    pollTimer = setIntervalImpl(() => {
      if (!entries.length) {
        stopPoll();
        return;
      }
      sync();
    }, pollMs);
  }

  function startObserver() {
    if (!MutationObserverImpl || observer) return;
    const root = doc.body || findChatRoot(doc);
    if (!root) return;
    observer = new MutationObserverImpl(() => {
      sync();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  function setEntries(next) {
    indexEntries(next);
    if (!entries.length) {
      restoreAuthors();
      removeMapMessage();
      stopObserver();
      stopPoll();
      return;
    }
    sync();
    startObserver();
    if (!mapNode?.isConnected) startPoll();
  }

  function clear() {
    stopObserver();
    stopPoll();
    restoreAuthors();
    removeMapMessage();
    indexEntries([]);
  }

  return {
    setEntries,
    clear,
    sync,
  };
}
