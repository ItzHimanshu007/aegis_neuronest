import { describe, expect, it } from 'vitest';
import { computeNameAndRole, getAssociatedLabelText } from '../accessibleName';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div.firstElementChild!;
}

describe('computeNameAndRole', () => {
  it('computes the accessible name from a label[for] association', () => {
    document.body.innerHTML = '<label for="e1">Email address</label><input id="e1" type="email" />';
    const input = document.getElementById('e1')!;
    const { name, role } = computeNameAndRole(input);
    expect(name).toBe('Email address');
    expect(role).toBe('textbox');
  });

  it('computes the accessible name from a wrapping label', () => {
    document.body.innerHTML = '<label>Full name <input id="e2" type="text" /></label>';
    const input = document.getElementById('e2')!;
    expect(computeNameAndRole(input).name).toBe('Full name');
  });

  it('prefers aria-label over visible text', () => {
    const button = el('<button aria-label="Close dialog">X</button>');
    expect(computeNameAndRole(button).name).toBe('Close dialog');
  });

  it('gives buttons the button role', () => {
    const button = el('<button>Submit</button>');
    expect(computeNameAndRole(button).role).toBe('button');
    expect(computeNameAndRole(button).name).toBe('Submit');
  });

  it('gives links with href the link role', () => {
    const link = el('<a href="/x">Learn more</a>');
    expect(computeNameAndRole(link).role).toBe('link');
  });

  it('falls back to the explicit role attribute', () => {
    const div = el('<div role="switch" aria-label="Dark mode"></div>');
    expect(computeNameAndRole(div).role).toBe('switch');
  });

  it('gives a password input the textbox role', () => {
    const input = el('<input type="password" aria-label="Password" />');
    expect(computeNameAndRole(input).role).toBe('textbox');
  });
});

describe('getAssociatedLabelText', () => {
  it('finds a label[for] association', () => {
    document.body.innerHTML = '<label for="e3">Phone number</label><input id="e3" type="tel" />';
    expect(getAssociatedLabelText(document.getElementById('e3')!)).toBe('Phone number');
  });

  it('finds a wrapping label', () => {
    document.body.innerHTML = '<label>Address <textarea id="e4"></textarea></label>';
    expect(getAssociatedLabelText(document.getElementById('e4')!)).toBe('Address');
  });

  it('returns empty string when there is no <label>, even if aria-label is set', () => {
    const input = el('<input aria-label="Has an aria-label but no <label> element" />');
    expect(getAssociatedLabelText(input)).toBe('');
  });

  it('collapses internal whitespace', () => {
    document.body.innerHTML = '<label for="e5">\n  Full   Name  \n</label><input id="e5" />';
    expect(getAssociatedLabelText(document.getElementById('e5')!)).toBe('Full Name');
  });
});
