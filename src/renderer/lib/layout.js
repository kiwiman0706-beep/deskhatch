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

  const api = { computeLeft, computeHeight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SSLayout = api;
})(typeof window !== 'undefined' ? window : null);
