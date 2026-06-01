// Pure decision logic for what a button click should do. No DOM.
// state shape: { [id]: { pinned: boolean } }  (the currently open drawers)
;(function (root) {
  'use strict';

  // Given the open drawers and the clicked id, decide the action:
  //   'focus'  -> the drawer is already open and pinned; just raise it
  //   'close'  -> the drawer is open and unpinned; toggle it shut
  //   'open'   -> open it, after closing the unpinned drawers in `toClose`
  // Default behaviour is "one drawer at a time": opening closes other unpinned
  // drawers, but pinned drawers stay (that's the "everything pinned" layout).
  function resolveClick(state, id) {
    const cur = state[id];
    if (cur) {
      return cur.pinned
        ? { action: 'focus', toClose: [] }
        : { action: 'close', toClose: [] };
    }
    const toClose = Object.keys(state).filter((k) => k !== id && !state[k].pinned);
    return { action: 'open', toClose };
  }

  const api = { resolveClick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SSDrawers = api;
})(typeof window !== 'undefined' ? window : null);
