/**
 * Debug overlay (Stage 1 Part E.1). Draws each mark's bbox with its `mark_id`, coloured by kind,
 * in a closed shadow root so page CSS/JS can't see or style it, with `pointer-events: none` so it
 * never intercepts clicks. It is local-only debug UI — nothing here is sent anywhere.
 *
 * MUST be hidden before every capture and restored after (Part E.1) — `hideForCapture()` /
 * `restoreAfterCapture()` are the two calls the capture pipeline (observe/capture.ts) brackets
 * `tabs.captureVisibleTab` with; see observe/__tests__/overlay.test.ts for the hide/restore
 * contract test.
 */

import type { RawElement, RawMedia, RawTextBlock } from './types';

const HOST_ATTR = 'data-aegis-overlay';
const HOST_ID = 'aegis-observe-overlay-host';

type MarkKind = 'interactive' | 'text' | 'media' | 'dialog';

interface OverlayMark {
  id: number;
  bbox: { x: number; y: number; width: number; height: number };
  kind: MarkKind;
  label: string;
  hidden: boolean;
  hitOk: boolean | undefined;
}

const KIND_COLOR: Record<MarkKind, string> = {
  interactive: '#2ecc71',
  text: '#3498db',
  media: '#9b59b6',
  dialog: '#e67e22',
};

const HIT_NOT_OK_COLOR = '#e74c3c';

export class DebugOverlay {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private previousDisplay = '';

  private ensureHost(doc: Document): ShadowRoot {
    if (this.shadow) return this.shadow;
    const host = doc.createElement('div');
    host.id = HOST_ID;
    host.setAttribute(HOST_ATTR, 'true');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    // Closed so page scripts (including MutationObservers on `documentElement`) can't reach in.
    const shadow = host.attachShadow({ mode: 'closed' });
    (doc.body ?? doc.documentElement).appendChild(host);
    this.host = host;
    this.shadow = shadow;
    return shadow;
  }

  render(doc: Document, elements: RawElement[], media: RawMedia[], textBlocks: RawTextBlock[]): void {
    const shadow = this.ensureHost(doc);
    shadow.replaceChildren();

    const marks: OverlayMark[] = [
      ...elements.map((el) => ({
        id: el.mark_id,
        bbox: el.bbox,
        kind: 'interactive' as const,
        label: `${el.mark_id}`,
        hidden: !el.visible,
        hitOk: el.hitOk,
      })),
      ...media.map((m, i) => ({
        id: 1_000_000 + i,
        bbox: m.bbox,
        kind: 'media' as const,
        label: m.kind,
        hidden: !m.visible,
        hitOk: undefined,
      })),
      ...textBlocks.map((t, i) => ({
        id: 2_000_000 + i,
        bbox: t.bbox,
        kind: 'text' as const,
        label: '',
        hidden: false,
        hitOk: undefined,
      })),
    ];

    for (const mark of marks) {
      shadow.appendChild(this.renderMark(doc, mark));
    }
  }

  private renderMark(doc: Document, mark: OverlayMark): HTMLElement {
    const box = doc.createElement('div');
    const color = mark.hitOk === false ? HIT_NOT_OK_COLOR : KIND_COLOR[mark.kind];
    box.style.cssText = [
      'position:absolute',
      `left:${mark.bbox.x}px`,
      `top:${mark.bbox.y}px`,
      `width:${Math.max(0, mark.bbox.width)}px`,
      `height:${Math.max(0, mark.bbox.height)}px`,
      `border:1.5px ${mark.hidden ? 'dashed' : 'solid'} ${color}`,
      'box-sizing:border-box',
    ].join(';');
    if (mark.kind === 'interactive' && mark.label) {
      const badge = doc.createElement('span');
      badge.textContent = mark.label;
      badge.style.cssText = `position:absolute;top:-16px;left:-1.5px;background:${color};color:#fff;font:10px/14px monospace;padding:0 3px;white-space:nowrap;`;
      box.appendChild(badge);
    }
    return box;
  }

  /** MUST be called immediately before `tabs.captureVisibleTab`. */
  hideForCapture(): void {
    if (!this.host) return;
    this.previousDisplay = this.host.style.display;
    this.host.style.display = 'none';
  }

  /** MUST be called immediately after `tabs.captureVisibleTab` resolves. */
  restoreAfterCapture(): void {
    if (!this.host) return;
    this.host.style.display = this.previousDisplay;
  }

  get isHidden(): boolean {
    return this.host?.style.display === 'none';
  }

  clear(): void {
    this.shadow?.replaceChildren();
  }
}

export const debugOverlay = new DebugOverlay();
