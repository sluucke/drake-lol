



export interface HeightBounds {
  min: number;
  max: number;
}

export function fittedHeight({ scrollHeight, min, max }: HeightBounds & { scrollHeight: number }): number {
  return Math.min(Math.max(scrollHeight, min), max);
}






export function autoSize(el: HTMLElement | null | undefined, { min, max }: HeightBounds): void {
  if (!el) return;
  
  
  if (el.dataset && el.dataset[MANUAL]) return;
  el.style.height = 'auto';
  el.style.height = `${fittedHeight({ scrollHeight: el.scrollHeight, min, max })}px`;
}

const MANUAL = 'manualHeight';



export function markManual(el: HTMLElement | null | undefined): void {
  if (!el || !el.dataset) return;
  el.dataset[MANUAL] = '1';
}
