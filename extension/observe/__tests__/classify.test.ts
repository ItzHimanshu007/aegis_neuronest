import { describe, expect, it } from 'vitest';
import { classifyMedia, getPrivacyAttrs, hasInteractiveAncestor, isCandidate, isCandidateShallow, isDialogElement, isLandmarkOrForm, isSkippable } from '../classify';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

describe('isSkippable', () => {
  it('skips script/style/template/noscript', () => {
    expect(isSkippable(el('<script></script>'))).toBe(true);
    expect(isSkippable(el('<style></style>'))).toBe(true);
    expect(isSkippable(el('<template></template>'))).toBe(true);
    expect(isSkippable(el('<noscript></noscript>'))).toBe(true);
  });

  it('skips the Aegis overlay host', () => {
    expect(isSkippable(el('<div data-aegis-overlay="true"></div>'))).toBe(true);
  });

  it('does not skip ordinary elements', () => {
    expect(isSkippable(el('<div></div>'))).toBe(false);
  });
});

describe('isCandidateShallow / isCandidate', () => {
  it('accepts the standard interactive tags', () => {
    for (const html of ['<a href="/x">x</a>', '<button></button>', '<input />', '<select></select>', '<textarea></textarea>', '<summary></summary>']) {
      expect(isCandidateShallow(el(html))).toBe(true);
    }
  });

  it('rejects an <a> without href', () => {
    expect(isCandidateShallow(el('<a>not a link</a>'))).toBe(false);
  });

  it('accepts contenteditable', () => {
    expect(isCandidateShallow(el('<div contenteditable="true"></div>'))).toBe(true);
  });

  it('rejects contenteditable="false"', () => {
    expect(isCandidateShallow(el('<div contenteditable="false"></div>'))).toBe(false);
  });

  it('accepts tabindex except -1', () => {
    expect(isCandidateShallow(el('<div tabindex="0"></div>'))).toBe(true);
    expect(isCandidateShallow(el('<div tabindex="-1"></div>'))).toBe(false);
  });

  it('accepts interactive ARIA roles', () => {
    for (const role of ['button', 'link', 'checkbox', 'combobox', 'searchbox']) {
      expect(isCandidateShallow(el(`<div role="${role}"></div>`))).toBe(true);
    }
  });

  it('rejects non-interactive ARIA roles', () => {
    expect(isCandidateShallow(el('<div role="heading"></div>'))).toBe(false);
  });

  it('treats cursor:pointer with no interactive ancestor as a candidate, given a cursor reader', () => {
    const div = el('<div></div>');
    document.body.appendChild(div);
    expect(isCandidate(div, { getCursor: () => 'pointer' })).toBe(true);
    expect(isCandidate(div, { getCursor: () => 'auto' })).toBe(false);
  });

  it('does not treat cursor:pointer as a candidate when it has an interactive ancestor', () => {
    document.body.innerHTML = '<button><span id="inner"></span></button>';
    const inner = document.getElementById('inner')!;
    expect(isCandidate(inner, { getCursor: () => 'pointer' })).toBe(false);
  });
});

describe('hasInteractiveAncestor', () => {
  it('finds a <button> ancestor', () => {
    document.body.innerHTML = '<button><span><em id="deep"></em></span></button>';
    expect(hasInteractiveAncestor(document.getElementById('deep')!)).toBe(true);
  });

  it('returns false with no interactive ancestor', () => {
    document.body.innerHTML = '<div><span id="deep"></span></div>';
    expect(hasInteractiveAncestor(document.getElementById('deep')!)).toBe(false);
  });
});

describe('isDialogElement', () => {
  it('detects role=dialog and role=alertdialog', () => {
    expect(isDialogElement(el('<div role="dialog"></div>'))).toBe(true);
    expect(isDialogElement(el('<div role="alertdialog"></div>'))).toBe(true);
  });

  it('detects aria-modal=true', () => {
    expect(isDialogElement(el('<div aria-modal="true"></div>'))).toBe(true);
  });

  it('detects an open <dialog>', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    expect(isDialogElement(dialog)).toBe(true);
  });

  it('does not flag a plain div', () => {
    expect(isDialogElement(el('<div></div>'))).toBe(false);
  });
});

describe('classifyMedia', () => {
  it('classifies img/canvas/video/embed/object', () => {
    expect(classifyMedia(el('<img />'))).toBe('img');
    expect(classifyMedia(el('<canvas></canvas>'))).toBe('canvas');
    expect(classifyMedia(el('<video></video>'))).toBe('video');
    expect(classifyMedia(el('<embed />'))).toBe('embed');
    expect(classifyMedia(el('<object></object>'))).toBe('object');
  });

  it('classifies iframe as iframe-unmapped by default', () => {
    expect(classifyMedia(el('<iframe></iframe>'))).toBe('iframe-unmapped');
  });

  it('returns null for a non-media element', () => {
    expect(classifyMedia(el('<div></div>'))).toBeNull();
  });
});

describe('getPrivacyAttrs', () => {
  it('detects each known privacy attribute', () => {
    expect(getPrivacyAttrs(el('<div data-private="true"></div>'))).toContain('data-private');
    expect(getPrivacyAttrs(el('<div data-pii="true"></div>'))).toContain('data-pii');
    expect(getPrivacyAttrs(el('<div data-hj-suppress></div>'))).toContain('data-hj-suppress');
    expect(getPrivacyAttrs(el('<div data-clarity-mask></div>'))).toContain('data-clarity-mask');
    expect(getPrivacyAttrs(el('<div rr-mask="true"></div>'))).toContain('rr-mask');
    expect(getPrivacyAttrs(el('<div rr-block="true"></div>'))).toContain('rr-block');
    expect(getPrivacyAttrs(el('<div sentry-mask></div>'))).toContain('sentry-mask');
  });

  it('detects autocomplete=cc-* as autocomplete-cc', () => {
    expect(getPrivacyAttrs(el('<input autocomplete="cc-number" />'))).toContain('autocomplete-cc');
  });

  it('detects type=password as type-password', () => {
    expect(getPrivacyAttrs(el('<input type="password" />'))).toContain('type-password');
  });

  it('returns an empty array for a plain element', () => {
    expect(getPrivacyAttrs(el('<input type="text" />'))).toEqual([]);
  });
});

describe('isLandmarkOrForm', () => {
  it('treats <form> as a landmark', () => {
    expect(isLandmarkOrForm(el('<form></form>'))).toBe(true);
  });

  it('treats known landmark roles as landmarks', () => {
    expect(isLandmarkOrForm(el('<div role="navigation"></div>'))).toBe(true);
    expect(isLandmarkOrForm(el('<div role="main"></div>'))).toBe(true);
  });

  it('rejects a plain div', () => {
    expect(isLandmarkOrForm(el('<div></div>'))).toBe(false);
  });
});
