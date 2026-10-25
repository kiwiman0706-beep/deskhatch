// Pure layout math for drawer placement. No DOM — unit-testable in Node.
// Loaded as a plain <script> in the renderer (exposes window.SSLayout) and
// required directly by Vitest (module.exports).
;(function (root) {
  'use strict';

  // Where should a drawer's left edge sit?
  // Align it with the button's left edge; if that would push the drawer off the
  // right of the viewport, clamp it left so it stays fully visible (option 1).
  function computeLeft(buttonLeft, drawerWidth, viewportWidth, margin) {
    if (margin == null) margin = 6;
    let left = buttonLeft;
    if (left + drawerWidth > viewportWidth - margin) {
      left = viewportWidth - drawerWidth - margin;
    }
    return Math.max(margin, left);
  }

  // How tall must the overlay window be to fit the open drawers?
  function computeHeight(barHeight, drawerHeights) {
    let h = barHeight;
    for (const dh of drawerHeights || []) h = Math.max(h, barHeight + dh);
    return h;
  }

  // Clamp a drawer size to sensible min/max bounds (used while resizing).
  function clampSize(width, height, bounds) {
    const b = bounds || {};
    const minW = b.minW == null ? 240 : b.minW;
    const minH = b.minH == null ? 160 : b.minH;
    const maxW = b.maxW == null ? Infinity : b.maxW;
    const maxH = b.maxH == null ? Infinity : b.maxH;
    return {
      width: Math.max(minW, Math.min(width, maxW)),
      height: Math.max(minH, Math.min(height, maxH)),
    };
  }

  // --- Edge-aware geometry --------------------------------------------------
  // The bar can hug any screen edge. 'top' is the original horizontal strip;
  // 'left'/'right' are vertical strips, which is what macOS needs — the top edge
  // there belongs to the system menu bar and is an unwinnable fight.
  //
  // Everything below is written in terms of a "main axis" (the one the buttons
  // run along) and a "cross axis" (the bar's thickness, which the drawer grows
  // into), so the same maths serves every edge.

  const EDGES = ['top', 'left', 'right'];
  function isVertical(edge) { return edge === 'left' || edge === 'right'; }
  function normalizeEdge(edge) { return EDGES.includes(edge) ? edge : 'right'; }

  // The bar window's rect on a display.
  //   bounds    the display's full rect (the physical edge — the Fitts's-law
  //             slam target)
  //   workArea  the rect minus OS furniture (menu bar, Dock, taskbar)
  //   thickness the bar's depth in px: height when horizontal, width when vertical
  //   avoidOsFurniture  true on macOS, where hugging the physical edge means
  //             fighting the menu bar or sitting under the Dock
  //
  // `extent` is how far the window currently reaches across the cross axis;
  // it starts at `thickness` and grows as drawers open.
  function barRect(bounds, workArea, edge, thickness, avoidOsFurniture, extent) {
    const r = avoidOsFurniture ? (workArea || bounds) : bounds;
    const depth = Math.max(thickness, extent == null ? thickness : extent);
    if (edge === 'left') return { x: r.x, y: r.y, width: depth, height: r.height };
    // A right-edge bar grows leftwards, so its x moves as it widens.
    if (edge === 'right') return { x: r.x + r.width - depth, y: r.y, width: depth, height: r.height };
    return { x: r.x, y: r.y, width: r.width, height: depth }; // 'top'
  }

  // Where a drawer's leading edge sits along the MAIN axis: aligned with its
  // button, clamped so the drawer stays fully on screen. Same rule the
  // horizontal bar always used — computeLeft is this function's 'top' case.
  const computeStart = computeLeft;

  // How far the window must reach across the CROSS axis to fit the open
  // drawers. computeHeight is this function's 'top' case.
  const computeExtent = computeHeight;

  // Is the cursor on the bar's edge of this display? Drives the auto-hide
  // reveal: "slam the mouse at the edge and the bar appears". `slack` is how
  // many px from the edge still counts.
  function atEdge(cursor, bounds, edge, slack) {
    const s = slack == null ? 1 : slack;
    if (!cursor || !bounds) return false;
    // The cursor has to be ON this display first. Checking only the axis the
    // edge runs along would claim a cursor sitting on the neighbouring display:
    // with screens side by side, x=2500 is "past the right edge" of a display
    // that ends at 1920, but it is somebody else's cursor.
    const inX = cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width;
    const inY = cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
    if (!inX || !inY) return false;
    if (edge === 'left') return cursor.x <= bounds.x + s;
    if (edge === 'right') return cursor.x >= bounds.x + bounds.width - 1 - s;
    return cursor.y <= bounds.y + s; // 'top'
  }

  // One bar per display per edge, so a display set to 'both' carries two.
  function barKey(displayId, edge) { return String(displayId) + ':' + normalizeEdge(edge); }

  // Expand a per-display edge choice into the bars that should exist.
  // `edges` maps displayId -> 'top' | 'left' | 'right' | 'both'.
  function wantedBars(displayIds, edges, fallback) {
    const def = normalizeEdge(fallback);
    const out = [];
    for (const id of displayIds || []) {
      const choice = (edges || {})[id] || def;
      for (const e of (choice === 'both' ? ['left', 'right'] : [normalizeEdge(choice)])) {
        out.push({ displayId: id, edge: e, key: barKey(id, e) });
      }
    }
    return out;
  }

  const api = {
    computeLeft, computeHeight, clampSize,
    EDGES, isVertical, normalizeEdge, barRect, computeStart, computeExtent,
    atEdge, barKey, wantedBars,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SSLayout = api;
})(typeof window !== 'undefined' ? window : null);
