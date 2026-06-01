import { describe, it, expect } from 'vitest';
import drawers from '../src/renderer/lib/drawers.js';

describe('resolveClick', () => {
  it('opens a new drawer and closes other unpinned drawers', () => {
    const state = { mail: { pinned: false }, cal: { pinned: true } };
    expect(drawers.resolveClick(state, 'todo')).toEqual({ action: 'open', toClose: ['mail'] });
  });

  it('toggles an open, unpinned drawer shut', () => {
    expect(drawers.resolveClick({ mail: { pinned: false } }, 'mail'))
      .toEqual({ action: 'close', toClose: [] });
  });

  it('focuses (does not close) an open, pinned drawer', () => {
    expect(drawers.resolveClick({ mail: { pinned: true } }, 'mail'))
      .toEqual({ action: 'focus', toClose: [] });
  });

  it('keeps every pinned drawer open when opening another', () => {
    const state = { mail: { pinned: true }, cal: { pinned: true } };
    expect(drawers.resolveClick(state, 'todo')).toEqual({ action: 'open', toClose: [] });
  });

  it('opens with nothing to close when no drawers are open', () => {
    expect(drawers.resolveClick({}, 'mail')).toEqual({ action: 'open', toClose: [] });
  });
});
