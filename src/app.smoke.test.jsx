// @vitest-environment jsdom
// Smoke test: the full app mounts, all three tabs render, and core controls
// exist. Engine correctness is covered by the §15 acceptance tests.

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import App from './App.jsx';

beforeAll(() => {
  // jsdom shims for Recharts (ResizeObserver) and framer-motion (matchMedia).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    });
  }
});

describe('app shell', () => {
  it('mounts with the Trajectory tab and shared profile form', async () => {
    render(<App />);
    expect(screen.getAllByText('Compass').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /return to charlie polito's portfolio/i }).getAttribute('href')).toBe('https://charliepolito.com/');
    expect(screen.getByText('Your baseline')).toBeTruthy();
    expect(screen.getByText('Net-worth trajectory')).toBeTruthy();
    expect(screen.getByText('Life events')).toBeTruthy();
    // Data vintage footer (§2 principle 3)
    expect(screen.getByText(/Tax & cost-of-living data: 2026/)).toBeTruthy();
    cleanup();
  });

  it('switches to Budget and Compare tabs', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Budget' }));
    });
    expect(await screen.findByText(/percentiles are among all US households/i)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    });
    expect(await screen.findByText('Cost-of-living face-off')).toBeTruthy();
    cleanup();
  });

  it('opens the life-event picker with all 16 event types', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add event' }));
    });
    for (const label of ['New job', 'Promotion / raise', 'House purchase', 'Child born', 'Inheritance / windfall', 'Large expense', 'New debt', 'Pay off debt', 'Move', 'Constant change', 'Sell home', 'New asset', 'Sell asset', 'Lifestyle (COL) change', 'Marriage', 'Divorce']) {
      expect(screen.getAllByText(new RegExp(label.replace(/[()/]/g, '.'))).length).toBeGreaterThan(0);
    }
    cleanup();
  });
});
