import { useEffect, useRef } from 'react';
import type { TimelineEntry } from '../../agent/runAgentLoop';
import { STEP_ACTION, STEP_VERDICT, levelBand } from './labels';

/** Buckets the seven HistoryEntry verdicts (schema/payload.v2) into the three visual tones the
 * timeline actually needs to distinguish at a glance. */
function verdictTone(verdict: TimelineEntry['verdict']): 'pass' | 'fail' | 'pending' {
  if (verdict === 'PASS') return 'pass';
  if (verdict === 'USER_REQUIRED' || verdict === 'STOPPED') return 'pending';
  return 'fail';
}

function totalMs(timings: TimelineEntry['timings']): number {
  return Object.values(timings).reduce((sum, ms) => sum + ms, 0);
}

/**
 * One row per agent-loop step, in plain words: what it did, to which element, how much authority
 * that needed, how it ended, and how long it took. Sits above the collapsed full record
 * (TaskPanel.tsx) so the reasoning trail is watchable, not just exportable.
 *
 * The raw vocabulary — the plan action name, the history verdict, the failure code — stays in the
 * full record and in the `title` tooltips; the row itself reads as a sentence. While a task is
 * running the newest row is marked and scrolled to, so "where am I now" needs no counting.
 */
export function StepTimeline({ entries, running = false }: { entries: TimelineEntry[]; running?: boolean }) {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (running && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries.length, running]);

  if (entries.length === 0) {
    return <p className="hint">Nothing yet. Each step Aegis takes shows up here as it happens.</p>;
  }
  return (
    <ol className="timeline" aria-label="Step timeline" ref={list}>
      {entries.map((entry, i) => {
        const tone = verdictTone(entry.verdict);
        return (
          <li
            key={i}
            className="timeline-row"
            data-verdict={tone}
            data-latest={running && i === entries.length - 1 ? 'true' : undefined}
          >
            <span className="timeline-step">{entry.step}</span>
            <span className="timeline-action">{STEP_ACTION[entry.action]}</span>
            <span className="timeline-eid" title="How Aegis and the server refer to this element">
              {entry.eid ?? ''}
            </span>
            <span className="level-badge" data-level={entry.level} title={`Authority level ${entry.level} — ${levelBand(entry.level)}`}>
              {entry.level}
            </span>
            <span
              className={`timeline-verdict timeline-verdict-${tone}`}
              title={entry.code ? `Reason: ${entry.code}` : undefined}
            >
              {STEP_VERDICT[entry.verdict]}
            </span>
            <span className="timeline-time">{Math.round(totalMs(entry.timings))} ms</span>
          </li>
        );
      })}
    </ol>
  );
}
