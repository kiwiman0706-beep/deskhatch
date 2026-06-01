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
