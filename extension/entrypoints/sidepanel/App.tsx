import { useEffect, useState } from 'react';
import { sendMessage, type HealthResult, type ObserveResult } from '../../shared/messages';
import { hasSiteAccess, requestSiteAccess } from '../../shared/permissions';
import type { RawElement } from '../../observe/types';

type ServerStatus = 'checking' | 'online' | 'offline';
type Tab = 'agent' | 'judge';

/** Informational note shown until the capture permission (see shared/permissions.ts) has been
 * granted at least once — re-checked after every Observe attempt, not just on mount, since
 * granting happens from inside the Observe click handler itself. */
function useCapturePermissionNote(recheckKey: number): string | null {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasSiteAccess()
      .then((granted) => {
        if (!cancelled && !granted) {
          setNote(
            'Aegis will ask for screen-capture access the first time you click Observe. On Firefox, you can also ' +
              'grant it upfront via about:addons → Aegis → Permissions.',
          );
        } else if (!cancelled) {
          setNote(null);
        }
      })
      .catch(() => {
        // permissions.contains itself can be unavailable in some contexts; not fatal.
      });
    return () => {
      cancelled = true;
    };
  }, [recheckKey]);

  return note;
}

function ServerStatusDot({ status }: { status: ServerStatus }) {
  const cls = status === 'online' ? 'online' : status === 'offline' ? 'offline' : '';
  return <span className={`status-dot ${cls}`} title={`Server: ${status}`} />;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('agent');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [observeResult, setObserveResult] = useState<ObserveResult | null>(null);
  const [observeError, setObserveError] = useState<string | null>(null);
  const [observing, setObserving] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [permissionRecheckKey, setPermissionRecheckKey] = useState(0);
  const capturePermissionNote = useCapturePermissionNote(permissionRecheckKey);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await sendMessage('PING_SERVER', undefined);
        if (cancelled) return;
        setHealth(result);
        setServerStatus('online');
      } catch {
        if (cancelled) return;
        setServerStatus('offline');
        setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // F2: requestSiteAccess must be called synchronously from this click handler's own gesture —
  // see shared/permissions.ts's docblock. No `await` happens before the permissions.request call.
  const handleObserve = async () => {
    setObserveError(null);
    setObserving(true);
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || !activeTab.url) throw new Error('No active tab (or its URL is not visible yet — click the Aegis toolbar icon once on this tab first)');

      const access = await requestSiteAccess(activeTab.url);
      if (!access.granted) {
        throw new Error(`Screen-capture access was denied (needed to observe ${access.origin}). Click Observe again and choose Allow to continue.`);
      }

      const result = await sendMessage('OBSERVE', { tabId: activeTab.id });
      setObserveResult(result);
      // Test-only hook for Playwright e2e (e2e/calibration.spec.ts etc.) to read the full,
      // already-rendered-to-the-DOM ObserveResult without needing to scrape/reconstruct it from
      // text — nothing here is data that isn't already visible in the panel. Never read by any
      // non-test code path.
      (window as unknown as { __aegisLastObserveResult?: ObserveResult }).__aegisLastObserveResult = result;
    } catch (err) {
      setObserveError(err instanceof Error ? err.message : String(err));
      setObserveResult(null);
    } finally {
      setObserving(false);
      setPermissionRecheckKey((k) => k + 1);
    }
  };

  return (
    <div>
      <h1>
        <ServerStatusDot status={serverStatus} />
        Aegis
      </h1>

      {capturePermissionNote && <div className="warning">{capturePermissionNote}</div>}

      <div className="tabs">
        <button className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}>
          Agent
        </button>
        <button className={tab === 'judge' ? 'active' : ''} onClick={() => setTab('judge')} disabled>
          Judge Mode (Stage 4)
        </button>
      </div>

      {tab === 'agent' && (
        <>
          <section>
            <label>Server</label>
            <pre>
              {serverStatus === 'checking' && 'checking...'}
              {serverStatus === 'offline' && 'offline — is `pnpm server` running?'}
              {serverStatus === 'online' && health && JSON.stringify(health, null, 2)}
            </pre>
          </section>

          <section>
            <label>Observe (local only — never sent to the server)</label>
            <button className="action" onClick={handleObserve} disabled={observing}>
              {observing ? 'Observing…' : 'Observe'}
            </button>
            {observeError && <pre>{observeError}</pre>}
            {observeResult && <ObservationView result={observeResult} showOverlay={showOverlay} onToggleOverlay={() => setShowOverlay((v) => !v)} />}
          </section>

          <section>
            <label>Task (Stage 3)</label>
            <input type="text" disabled placeholder="Task input arrives in Stage 3" />
          </section>
        </>
      )}

      {tab === 'judge' && (
        <section>
          <p>Judge Mode lands in Stage 4. It will show the exact sanitized payload leaving the browser.</p>
        </section>
      )}
    </div>
  );
}

function ObservationView({
  result,
  showOverlay,
  onToggleOverlay,
}: {
  result: ObserveResult;
  showOverlay: boolean;
  onToggleOverlay: () => void;
}) {
  const { observation, change } = result;

  return (
    <div>
      <pre>
        {JSON.stringify(
          {
            change: `${change.decision} (${change.reason})`,
            counts: observation.counts,
            timings: observation.timings,
          },
          null,
          2,
        )}
      </pre>

      <label>
        <input type="checkbox" checked={showOverlay} onChange={onToggleOverlay} /> Show mark overlay
      </label>

      <div className="screenshot-scroll">
        <div
          className="screenshot-wrap"
          style={{ width: observation.screenshot.pxW, height: observation.screenshot.pxH }}
        >
          <img src={observation.screenshot.dataUrl} alt="captured screen" width={observation.screenshot.pxW} height={observation.screenshot.pxH} />
          {showOverlay && (
            <MarkOverlay elements={observation.elements} scaleX={observation.screenshot.scaleX} scaleY={observation.screenshot.scaleY} />
          )}
        </div>
      </div>

      <label>Marks ({observation.elements.length})</label>
      {/* Values are never rendered here — only structural fields (AGENTS.md invariant 1 / Part E: no "Show values" toggle exists). */}
      <div className="marks-list">
        {observation.elements.map((el) => (
          <div key={`${el.mark_id}`} className="mark-row">
            #{el.mark_id} <b>{el.role}</b> "{el.name || el.labelText || '(no name)'}" {el.visible ? '' : `hidden(${el.visibilityReason})`}{' '}
            {el.hitOk === false ? 'hitOk=false' : ''} fp={el.fp}
            {el.fpOrdinal > 0 ? `#${el.fpOrdinal}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkOverlay({ elements, scaleX, scaleY }: { elements: RawElement[]; scaleX: number; scaleY: number }) {
  return (
    <>
      {elements.map((el) => (
        <div
          key={el.mark_id}
          className={`overlay-mark ${el.visible ? '' : 'overlay-mark-hidden'} ${el.hitOk === false ? 'overlay-mark-blocked' : ''}`}
          style={{
            left: el.bbox.x * scaleX,
            top: el.bbox.y * scaleY,
            width: el.bbox.width * scaleX,
            height: el.bbox.height * scaleY,
          }}
        >
          <span>{el.mark_id}</span>
        </div>
      ))}
    </>
  );
}
