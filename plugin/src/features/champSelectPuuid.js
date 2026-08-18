export const CHAMP_SELECT_PUUID_MASK = [
  129, 112, 118, 169, 244, 81, 80, 155, 149, 152, 104, 19, 206, 145, 23, 231,
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deobfuscateChampSelectPuuid(obfuscatedPuuid) {
  const normalized = String(obfuscatedPuuid || '')
    .trim()
    .toLowerCase();
  if (!UUID_PATTERN.test(normalized)) return '';

  const sourceHex = normalized.replace(/-/g, '');
  let resultHex = '';

  for (let index = 0; index < CHAMP_SELECT_PUUID_MASK.length; index += 1) {
    const sourceByte = Number.parseInt(sourceHex.slice(index * 2, index * 2 + 2), 16);
    resultHex += (sourceByte ^ CHAMP_SELECT_PUUID_MASK[index]).toString(16).padStart(2, '0');
  }

  return [
    resultHex.slice(0, 8),
    resultHex.slice(8, 12),
    resultHex.slice(12, 16),
    resultHex.slice(16, 20),
    resultHex.slice(20),
  ].join('-');
}

export function resolveChampSelectPuuid(player) {
  if (!player) return '';
  if (player.puuid) return player.puuid;
  if (player.nameVisibilityType !== 'HIDDEN' || !player.obfuscatedPuuid) return '';
  return deobfuscateChampSelectPuuid(player.obfuscatedPuuid);
}

export function obfuscateChampSelectPuuid(puuid) {
  const normalized = String(puuid || '')
    .trim()
    .toLowerCase();
  if (!UUID_PATTERN.test(normalized)) return '';

  const sourceHex = normalized.replace(/-/g, '');
  let resultHex = '';

  for (let index = 0; index < CHAMP_SELECT_PUUID_MASK.length; index += 1) {
    const sourceByte = Number.parseInt(sourceHex.slice(index * 2, index * 2 + 2), 16);
    resultHex += (sourceByte ^ CHAMP_SELECT_PUUID_MASK[index]).toString(16).padStart(2, '0');
  }

  return [
    resultHex.slice(0, 8),
    resultHex.slice(8, 12),
    resultHex.slice(12, 16),
    resultHex.slice(16, 20),
    resultHex.slice(20),
  ].join('-');
}
