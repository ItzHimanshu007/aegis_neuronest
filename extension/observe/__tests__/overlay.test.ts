import { beforeEach, describe, expect, it } from 'vitest';
import { DebugOverlay } from '../overlay';
import type { RawElement } from '../types';

function makeEl(id: number, visible = true, hitOk: boolean | undefined = true): RawElement {
  return {
    eid: `E${id}`,
    fp: 'a',
    fpOrdinal: 0,
    frameId: 0,
    tag: 'input',
    role: 'textbox',
    name: '',
    labelText: '',
    hasValue: false,
    states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 10, y: 10, width: 20, height: 20 },
    lineRects: [],
    visible,
    visibilityReason: visible ? 'visible' : 'display-none',
    hiddenInteractive: !visible,
    hitOk,
    privacyAttrs: [],
    inShadow: 'none',
  };
}

describe('DebugOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders marks into a host element marked as the Aegis overlay', () => {
    const overlay = new DebugOverlay();
    overlay.render(document, [makeEl(0)], [], []);
    const host = document.querySelector('[data-aegis-overlay]');
    expect(host).not.toBeNull();
  });

  it('is hidden before capture and restored after (the mandatory hide/restore contract)', () => {
    const overlay = new DebugOverlay();
    overlay.render(document, [makeEl(0)], [], []);
    expect(overlay.isHidden).toBe(false);

    overlay.hideForCapture();
    expect(overlay.isHidden).toBe(true);

    overlay.restoreAfterCapture();
    expect(overlay.isHidden).toBe(false);
  });

  it('hideForCapture is a no-op if the overlay was never rendered (does not throw)', () => {
    const overlay = new DebugOverlay();
    expect(() => overlay.hideForCapture()).not.toThrow();
    expect(() => overlay.restoreAfterCapture()).not.toThrow();
  });

  it('renders a mix of hidden and hitOk:false marks without throwing', () => {
    // The overlay's shadow root is intentionally 'closed' (see overlay.ts's docblock) — real
    // browsers make `host.shadowRoot` return null for it by design, so asserting on its rendered
    // *content* from outside isn't meaningful here. What Vitest can and does check is that
    // rendering a realistic mix of states doesn't throw; the actual dashed-border/red-outline
    // styling is verified visually via Playwright e2e (screenshot) / manual verification.
    const overlay = new DebugOverlay();
    expect(() => overlay.render(document, [makeEl(0, false), makeEl(1, true, false)], [], [])).not.toThrow();
  });
});
