// Windowing for the skin grid.
//
// 2146 skins, each with a splash tile, is far too much DOM to build at once --
// and every tile would start an image request inside somebody else's client.
// Only the rows on screen are rendered; a spacer of the full height keeps the
// scrollbar honest, and the rendered slice is pushed down to where it belongs.

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

  // Overscan renders a couple of rows beyond the viewport in each direction,
  // so a fast scroll does not flash empty space before the next paint.
  //
  // Clamped to the last row as well as to zero: a scrollTop past the end (the
  // list shrinking under a search while scrolled down, or a momentum overshoot)
  // would otherwise produce a start index past the end of the array and render
  // nothing at all.
  const firstRow = Math.min(
    Math.max(0, rows - 1),
    Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
  );
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;

  const start = firstRow * perRow;
  const end = Math.min(total, (firstRow + visibleRows) * perRow);

  return { start, end, offsetY: firstRow * rowHeight, totalHeight };
}
