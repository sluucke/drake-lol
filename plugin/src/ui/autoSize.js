



export function fittedHeight({ scrollHeight, min, max }) {
  return Math.min(Math.max(scrollHeight, min), max);
}






export function autoSize(el, { min, max }) {
  if (!el) return;
  
  
  if (el.dataset && el.dataset[MANUAL]) return;
  el.style.height = 'auto';
  el.style.height = `${fittedHeight({ scrollHeight: el.scrollHeight, min, max })}px`;
}

const MANUAL = 'manualHeight';



export function markManual(el) {
  if (!el || !el.dataset) return;
  el.dataset[MANUAL] = '1';
}
