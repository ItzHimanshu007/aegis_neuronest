import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputWatcher } from '../inputWatcher';

describe('InputWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="name" type="text" /><input id="pw" type="password" />';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never includes the raw value in its report', async () => {
    const reports: Array<{ fp: string; hasValue: boolean; valueLenBucket?: string }> = [];
    const watcher = new InputWatcher((el) => (el.id === 'name' ? 'fp-name' : undefined), (r) => reports.push(r), 250);
    watcher.attach(document);

    const input = document.getElementById('name') as HTMLInputElement;
    input.value = 'a secret sounding value';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(250);

    expect(reports).toHaveLength(1);
    expect(JSON.stringify(reports[0])).not.toContain('secret');
    expect(reports[0]).toEqual({ fp: 'fp-name', hasValue: true, valueLenBucket: 'medium' });
  });

  it('omits valueLenBucket for password fields', async () => {
    const reports: Array<{ fp: string; hasValue: boolean; valueLenBucket?: string }> = [];
    const watcher = new InputWatcher(() => 'fp-pw', (r) => reports.push(r), 250);
    watcher.attach(document);

    const input = document.getElementById('pw') as HTMLInputElement;
    input.value = 'hunter2';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(250);

    expect(reports[0]).toEqual({ fp: 'fp-pw', hasValue: true, valueLenBucket: undefined });
  });

  it('debounces rapid keystrokes into a single report', async () => {
    const reports: unknown[] = [];
    const watcher = new InputWatcher(() => 'fp-name', (r) => reports.push(r), 250);
    watcher.attach(document);
    const input = document.getElementById('name') as HTMLInputElement;

    for (const ch of ['a', 'ab', 'abc']) {
      input.value = ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(100); // less than the 250ms debounce window
    }
    await vi.advanceTimersByTimeAsync(250);

    expect(reports).toHaveLength(1);
  });

  it('does not report for an element not present in the last harvest', async () => {
    const reports: unknown[] = [];
    const watcher = new InputWatcher(() => undefined, (r) => reports.push(r), 250);
    watcher.attach(document);
    const input = document.getElementById('name') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(reports).toHaveLength(0);
  });

  it('reports hasValue:false and bucket "empty" when the field is cleared', async () => {
    const reports: Array<{ fp: string; hasValue: boolean; valueLenBucket?: string }> = [];
    const watcher = new InputWatcher(() => 'fp-name', (r) => reports.push(r), 250);
    watcher.attach(document);
    const input = document.getElementById('name') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(reports[0]).toEqual({ fp: 'fp-name', hasValue: false, valueLenBucket: 'empty' });
  });
});
