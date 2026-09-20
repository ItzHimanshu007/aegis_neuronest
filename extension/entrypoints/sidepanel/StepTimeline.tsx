import type { TimelineEntry } from '../../agent/runAgentLoop';

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

/** One row per agent-loop step: action, EID, authority level, verdict and total time. Sits above
 * the collapsed raw JSON dump (TaskPanel.tsx) so the reasoning trail is watchable, not just
 * exportable. */
export function StepTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="hint">No steps yet.</p>;
  return (
    <ol className="timeline" aria-label="Step timeline">
      {entries.map((entry, i) => {
        const tone = verdictTone(entry.verdict);
        return (
          <li key={i} className="timeline-row" data-verdict={tone}>
            <span className="timeline-step">#{entry.step}</span>
            <span className="timeline-action">{entry.action}</span>
            <span className="timeline-eid">{entry.eid ?? '—'}</span>
            <span className="level-badge" data-level={entry.level}>
              {entry.level}
            </span>
            <span className={`timeline-verdict timeline-verdict-${tone}`}>
              {entry.verdict}
              {entry.code ? ` · ${entry.code}` : ''}
            </span>
            <span className="timeline-time">{Math.round(totalMs(entry.timings))} ms</span>
          </li>
        );
      })}
    </ol>
  );
}
