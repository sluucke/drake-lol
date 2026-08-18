










export const UNLOCKS = {
  statusMessage: {
    
    
    selector: 'input.social-status-change-input',
    measuredMaxLength: 25,
    
    
    
    
    height: null,
  },
};

const MARK = 'drakeUnlocked';

export function isUnlockTarget(el) {
  return el.matches(UNLOCKS.statusMessage.selector);
}







export function unlockIn(root) {
  let fields;
  try {
    fields = root.querySelectorAll('input, textarea');
  } catch {
    
    
    return 0;
  }

  let count = 0;
  for (const f of fields) {
    if (!isUnlockTarget(f)) continue;
    if (f.dataset[MARK]) continue;
    f.dataset[MARK] = '1';
    f.removeAttribute('maxlength');
    if (UNLOCKS.statusMessage.height) f.style.height = UNLOCKS.statusMessage.height;
    count += 1;
  }
  return count;
}
