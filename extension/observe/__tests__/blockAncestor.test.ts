import { describe, expect, it } from 'vitest';
import { findBlockAncestor } from '../blockAncestor';

describe('findBlockAncestor', () => {
  it('finds a <p> ancestor for inline text', () => {
    document.body.innerHTML = '<p>Hello <em id="inline">world</em></p>';
    const result = findBlockAncestor(document.getElementById('inline')!.parentElement!);
    expect(result.tagName).toBe('P');
  });

  it('recognizes headings, list items, table cells and labels as blocks', () => {
    // Built with createElement + a proper container (ul/table), not innerHTML, so the HTML
    // parser's table/list insertion-mode quirks (e.g. a stray <td> outside <table><tr> gets
    // dropped) can't interfere with the test.
    for (const tag of ['h1', 'li', 'td', 'label']) {
      document.body.innerHTML = '';
      const block = document.createElement(tag);
      block.id = 'block';
      const span = document.createElement('span');
      span.id = 'inline';
      span.textContent = 'x';
      block.appendChild(span);

      if (tag === 'li') {
        const list = document.createElement('ul');
        list.appendChild(block);
        document.body.appendChild(list);
      } else if (tag === 'td') {
        const table = document.createElement('table');
        const row = document.createElement('tr');
        row.appendChild(block);
        table.appendChild(row);
        document.body.appendChild(table);
      } else {
        document.body.appendChild(block);
      }

      const result = findBlockAncestor(document.getElementById('inline')!);
      expect(result.id).toBe('block');
    }
  });

  it('uses the display reader when no tag match is found', () => {
    document.body.innerHTML = '<div id="flexy"><span id="inline">x</span></div>';
    const inline = document.getElementById('inline')!;
    const result = findBlockAncestor(inline, { getDisplay: (el) => (el.id === 'flexy' ? 'flex' : 'inline') });
    expect(result.id).toBe('flexy');
  });

  it('falls back to the ancestor at maxDepth if nothing matches', () => {
    document.body.innerHTML = '<div id="a"><div id="b"><div id="c"><span id="inline">x</span></div></div></div>';
    const inline = document.getElementById('inline')!;
    const result = findBlockAncestor(inline, { maxDepth: 1, getDisplay: () => 'inline' });
    // depth 0 = the span itself, depth 1 = its parent #c — maxDepth=1 means we stop climbing
    // after checking #c, one level up from the start element.
    expect(result.id).toBe('c');
  });
});
