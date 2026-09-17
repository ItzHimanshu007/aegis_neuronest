import { AEGIS_CONFIG } from '../../shared/config';
import type { Category } from '../categoryTypes';

export interface KnownDetectionValue { value: string; type: Category }
/** Local vault evidence remains sensitive if a later view drops its label. */
export function findKnownValues(text: string, values: KnownDetectionValue[]): Array<{ category: Category; matchedText: string; start: number }> {
  return values.flatMap(({ value, type }) => {
    const floor = /^\d+$/.test(value) ? AEGIS_CONFIG.LEAK_MIN_DIGITS : AEGIS_CONFIG.LEAK_MIN_LEN;
    if (value.length < floor) return [];
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [escaped];
    const digits = value.replace(/\D/g, '');
    // Match the numeric representation checked by the firewall too. This intentionally
    // protects substrings even inside longer numbers; it is a conservative known-value rule.
    if (digits.length >= AEGIS_CONFIG.LEAK_MIN_DIGITS) patterns.push(digits.split('').join('[\\s,./()-]*'));
    const covered: Array<{ start: number; end: number }> = [];
    return patterns.flatMap(pattern => [...text.matchAll(new RegExp(pattern, 'giu'))].flatMap(m => {
      const end = m.index + m[0].length;
      if (covered.some(r => r.start <= m.index && r.end >= end)) return [];
      covered.push({ start: m.index, end });
      return [{ category: type, matchedText: m[0], start: m.index }];
    }));
  });
}
