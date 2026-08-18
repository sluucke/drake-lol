




const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA']);





function isTextEntry(target) {
  if (!target) return false;
  return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable === true;
}

export function matchesToggle(event) {
  if (!event.ctrlKey) return false;
  
  
  if (event.key !== 'd' && event.key !== 'D') return false;
  return !isTextEntry(event.target);
}

export function matchesClose(event) {
  return event.key === 'Escape';
}
