import { describe, it, expect } from 'vitest';
import layout from '../src/renderer/lib/layout.js';

describe('computeLeft', () => {
  it('aligns the drawer left edge with the button left edge', () => {
    expect(layout.computeLeft(100, 400, 1920, 6)).toBe(100);
  });

  it('clamps left when the drawer would overflow the right edge', () => {
    // 1920 - 400 - 6 = 1514
    expect(layout.computeLeft(1800, 400, 1920, 6)).toBe(1514);
  });

  it('never goes below the left margin', () => {
    expect(layout.computeLeft(2, 400, 300, 6)).toBe(6);
  });

  it('defaults the margin to 6', () => {
    expect(layout.computeLeft(100, 50, 1000)).toBe(100);
  });
});

describe('computeHeight', () => {
  it('returns the bar height when nothing is open', () => {
    expect(layout.computeHeight(44, [])).toBe(44);
  });

  it('fits the tallest open drawer below the bar', () => {
    expect(layout.computeHeight(44, [300, 600, 200])).toBe(644);
  });
});

describe('clampSize', () => {
  it('passes through a size within bounds', () => {
    expect(layout.clampSize(500, 400, { minW: 240, minH: 160, maxW: 1900, maxH: 1000 }))
      .toEqual({ width: 500, height: 400 });
  });

  it('enforces the minimum width and height', () => {
    expect(layout.clampSize(100, 50, { minW: 240, minH: 160 }))
      .toEqual({ width: 240, height: 160 });
  });

  it('enforces the maximum width and height', () => {
    expect(layout.clampSize(3000, 3000, { maxW: 1900, maxH: 1000 }))
      .toEqual({ width: 1900, height: 1000 });
  });

  it('uses default minimums (240x160) when no bounds are given', () => {
    expect(layout.clampSize(10, 10)).toEqual({ width: 240, height: 160 });
  });
});

// --- Edge-aware geometry -----------------------------------------------------

const DISPLAY = { x: 0, y: 0, width: 1920, height: 1080 };
// A Mac display: 25px menu bar at the top, 60px Dock at the bottom.
const MAC_BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const MAC_WORK = { x: 0, y: 25, width: 1920, height: 995 };

describe('barRect', () => {
  it('puts a top bar across the full width', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'top', 44, false))
      .toEqual({ x: 0, y: 0, width: 1920, height: 44 });
  });

  it('puts a left bar down the full height', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'left', 44, false))
      .toEqual({ x: 0, y: 0, width: 44, height: 1080 });
  });

  it('anchors a right bar to the right edge', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'right', 44, false))
      .toEqual({ x: 1876, y: 0, width: 44, height: 1080 });
  });

  it('grows a right bar leftwards, keeping its right edge pinned', () => {
    const r = layout.barRect(DISPLAY, DISPLAY, 'right', 44, false, 500);
    expect(r).toEqual({ x: 1420, y: 0, width: 500, height: 1080 });
    expect(r.x + r.width).toBe(1920); // still flush with the screen edge
  });

  it('grows a left bar rightwards from a fixed x', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'left', 44, false, 500))
      .toEqual({ x: 0, y: 0, width: 500, height: 1080 });
  });

  it('grows a top bar downwards', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'top', 44, false, 400))
      .toEqual({ x: 0, y: 0, width: 1920, height: 400 });
  });

  it('never shrinks below the bar thickness', () => {
    expect(layout.barRect(DISPLAY, DISPLAY, 'top', 44, false, 10).height).toBe(44);
  });

  it('keeps clear of the macOS menu bar and Dock when asked', () => {
    // Vertical bars start below the menu bar and stop above the Dock.
    expect(layout.barRect(MAC_BOUNDS, MAC_WORK, 'right', 44, true))
      .toEqual({ x: 1876, y: 25, width: 44, height: 995 });
    // The top bar sits under the menu bar rather than fighting it.
    expect(layout.barRect(MAC_BOUNDS, MAC_WORK, 'top', 44, true).y).toBe(25);
  });

  it('hugs the physical edge elsewhere, even when the work area is smaller', () => {
    expect(layout.barRect(MAC_BOUNDS, MAC_WORK, 'top', 44, false).y).toBe(0);
  });

  it('places bars correctly on a secondary display with an offset origin', () => {
    const second = { x: 1920, y: -200, width: 2560, height: 1440 };
    expect(layout.barRect(second, second, 'right', 44, false))
      .toEqual({ x: 1920 + 2560 - 44, y: -200, width: 44, height: 1440 });
  });
});

describe('atEdge', () => {
  const cur = (x, y) => ({ x, y });

  it('detects the cursor slammed into the right edge', () => {
    expect(layout.atEdge(cur(1919, 500), DISPLAY, 'right')).toBe(true);
    expect(layout.atEdge(cur(1900, 500), DISPLAY, 'right')).toBe(false);
  });

  it('detects the left and top edges', () => {
    expect(layout.atEdge(cur(0, 500), DISPLAY, 'left')).toBe(true);
    expect(layout.atEdge(cur(500, 0), DISPLAY, 'top')).toBe(true);
  });

  it('ignores a cursor on another display', () => {
    expect(layout.atEdge(cur(2500, 500), DISPLAY, 'right')).toBe(false);
    expect(layout.atEdge(cur(1919, 2000), DISPLAY, 'right')).toBe(false);
  });

  it('honours the slack so a fast flick still registers', () => {
    expect(layout.atEdge(cur(1915, 500), DISPLAY, 'right', 5)).toBe(true);
  });
});

describe('wantedBars', () => {
  it('gives each display one bar on the default edge', () => {
    expect(layout.wantedBars([1, 2], {}, 'right')).toEqual([
      { displayId: 1, edge: 'right', key: '1:right' },
      { displayId: 2, edge: 'right', key: '2:right' },
    ]);
  });

  it('lets each display choose its own edge', () => {
    expect(layout.wantedBars([1, 2], { 1: 'left', 2: 'top' }, 'right')).toEqual([
      { displayId: 1, edge: 'left', key: '1:left' },
      { displayId: 2, edge: 'top', key: '2:top' },
    ]);
  });

  it('expands "both" into two bars on the same display', () => {
    expect(layout.wantedBars([1], { 1: 'both' }, 'right')).toEqual([
      { displayId: 1, edge: 'left', key: '1:left' },
      { displayId: 1, edge: 'right', key: '1:right' },
    ]);
  });

  it('falls back to the default for an unknown choice', () => {
    expect(layout.wantedBars([1], { 1: 'diagonal' }, 'right')[0].edge).toBe('right');
  });

  it('returns nothing when no display is selected', () => {
    expect(layout.wantedBars([], {}, 'right')).toEqual([]);
    expect(layout.wantedBars(null, null, 'right')).toEqual([]);
  });
});

describe('barKey / normalizeEdge / isVertical', () => {
  it('keys a bar by display and edge so "both" does not collide', () => {
    expect(layout.barKey(7, 'left')).toBe('7:left');
    expect(layout.barKey(7, 'right')).not.toBe(layout.barKey(7, 'left'));
  });

  it('falls back to the right edge for junk', () => {
    expect(layout.normalizeEdge('nonsense')).toBe('right');
    expect(layout.normalizeEdge(undefined)).toBe('right');
  });

  it('knows which edges are vertical', () => {
    expect(layout.isVertical('left')).toBe(true);
    expect(layout.isVertical('right')).toBe(true);
    expect(layout.isVertical('top')).toBe(false);
  });
});
