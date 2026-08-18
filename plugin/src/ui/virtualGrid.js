






export function visibleWindow({
  total,
  perRow,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan = 2,
}) {
  const rows = Math.ceil(total / perRow);
  const totalHeight = rows * rowHeight;

  if (total === 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: 0 };
  }

  
  
  
  
  
  
  
  const firstRow = Math.min(
    Math.max(0, rows - 1),
    Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
  );
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;

  const start = firstRow * perRow;
  const end = Math.min(total, (firstRow + visibleRows) * perRow);

  return { start, end, offsetY: firstRow * rowHeight, totalHeight };
}
