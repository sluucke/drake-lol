export const LEAGUE_FONT_FAMILIES = ['beaufort for lol', 'lol display', 'spiegel', 'lol body'];

const FONT_FACE_RULE = 5;
const IMPORT_RULE = 3;
const MAX_FONTS = 12;

function unquote(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function readRules(sheet) {
  try {
    return Array.from(sheet?.cssRules || []);
  } catch {
    return [];
  }
}

function firstUrl(src) {
  const match = /url\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(String(src || ''));
  return match ? match[2] : '';
}

export function collectFontFaces(doc, { families = LEAGUE_FONT_FAMILIES, baseUrl } = {}) {
  const faces = [];
  const seen = new Set();
  const visit = (sheet, depth) => {
    if (!sheet || depth > 4) return;
    for (const rule of readRules(sheet)) {
      if (rule.type === IMPORT_RULE) {
        visit(rule.styleSheet, depth + 1);
        continue;
      }
      if (rule.type !== FONT_FACE_RULE) continue;
      const family = unquote(rule.style.getPropertyValue('font-family'));
      if (!families.includes(family.toLowerCase())) continue;
      const raw = firstUrl(rule.style.getPropertyValue('src'));
      if (!raw) continue;
      let url;
      try {
        url = new URL(raw, sheet.href || baseUrl).href;
      } catch {
        continue;
      }
      const weight = rule.style.getPropertyValue('font-weight') || 'normal';
      const style = rule.style.getPropertyValue('font-style') || 'normal';
      const key = `${family.toLowerCase()}|${weight}|${style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      faces.push({ family, weight, style, url });
    }
  };
  for (const sheet of Array.from(doc?.styleSheets || [])) visit(sheet, 0);
  return faces;
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function guessMime(url) {
  const ext = String(url).split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'woff2') return 'font/woff2';
  if (ext === 'woff') return 'font/woff';
  if (ext === 'otf') return 'font/otf';
  if (ext === 'ttf') return 'font/ttf';
  return 'application/octet-stream';
}

export async function harvestClientFonts(doc, { fetchImpl = fetch, baseUrl = doc?.baseURI } = {}) {
  const faces = collectFontFaces(doc, { baseUrl }).slice(0, MAX_FONTS);
  const fonts = [];
  for (const face of faces) {
    try {
      const res = await fetchImpl(face.url);
      if (!res.ok) continue;
      const data = toBase64(await res.arrayBuffer());
      if (!data) continue;
      const mime = res.headers?.get?.('content-type') || guessMime(face.url);
      fonts.push({ family: face.family, weight: face.weight, style: face.style, mime, data });
    } catch {
      continue;
    }
  }
  return fonts;
}

export async function applyOverlayFonts(
  list,
  { base, doc = document, FontFaceImpl = globalThis.FontFace, loaded = new Set() } = {},
) {
  if (!FontFaceImpl || !doc?.fonts) return;
  for (const font of list || []) {
    const key = `${font.family}|${font.weight}|${font.style}|${font.url}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    try {
      const face = new FontFaceImpl(font.family, `url("${base}${font.url}")`, {
        weight: font.weight,
        style: font.style,
      });
      doc.fonts.add(await face.load());
    } catch {
      loaded.delete(key);
    }
  }
}
