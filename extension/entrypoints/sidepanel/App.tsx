import { TaskPanel } from './TaskPanel';
import { useEffect, useRef, useState } from 'react';
import { sendMessage, type HealthResult, type ObserveResult } from '../../shared/messages';
import { hasSiteAccess, requestSiteAccess } from '../../shared/permissions';
import { processObservation, type ProcessResult } from '../../agentHost';
import { PrivacySession } from '../../agentHost/session';
import { PrivacyPreview } from './PrivacyPreview';
import { send } from '../../net/network';
import type { Mode } from '../../privacy/redactor';
import type { RawElement } from '../../observe/types';
import { AEGIS_CONFIG } from '../../shared/config';

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

  // Stage 2: the privacy session (vault + identity state) lives here, in the panel document —
  // never in the background service worker, which can be evicted mid-task. Closing the panel
  // tears this whole context down, which IS the session end (see agentHost/session.ts).
  const sessionRef = useRef<PrivacySession | null>(null);
  if (!sessionRef.current) sessionRef.current = new PrivacySession();

  const [taskText, setTaskText] = useState('');
  const [mode, setMode] = useState<Mode>('balanced');
  const [somEnabled, setSomEnabled] = useState<boolean>(AEGIS_CONFIG.SOM_ENABLED);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [sanitizing, setSanitizing] = useState(false);
  const [sendState, setSendState] = useState<{ digest: string; size: number; at: string } | null>(null);

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

  /** Capture transport has no independent numbering. Only the session registry issues EIDs. */
  const identifyObservation = async (result: ObserveResult) => {
    sessionRef.current!.registry.reconcile(result.observation);
    await browser.tabs.sendMessage(result.tabId, { type: 'RENDER_OVERLAY', data: {
      elements: result.observation.elements.map(({ eid, bbox, visible, hitOk }) => ({ eid, bbox, visible, hitOk })),
      media: result.observation.media,
    } }, { frameId: 0 }).catch(() => { /* Debug overlay failure cannot affect privacy capture. */ });
  };

  // F2: requestSiteAccess must be called synchronously from this click handler's own gesture —
  // see shared/permissions.ts's docblock. No `await` happens before the permissions.request call.
  const handleObserve = async () => {
    setObserveError(null);
    setObserving(true);
    try {
      const [access, [activeTab]] = await Promise.all([
        requestSiteAccess(),
        browser.tabs.query({ active: true, currentWindow: true }),
      ]);
      if (!activeTab?.id || !activeTab.url) throw new Error('No active tab (or its URL is not visible yet — click the Aegis toolbar icon once on this tab first)');

      if (!access.granted) {
        throw new Error(`Screen-capture access was denied (needed to observe ${new URL(activeTab.url).origin}). Click Observe again and choose Allow to continue.`);
      }

      const result = await sendMessage('OBSERVE', { tabId: activeTab.id });
      await identifyObservation(result);
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

  /** Observe & Sanitize: runs the whole Stage 2 pipeline locally and shows the Privacy Preview.
   * Nothing is sent — `send()` is a separate, explicit button. */
  const handleObserveAndSanitize = async () => {
    setObserveError(null);
    setSanitizing(true);
    setSendState(null);
    try {
      const [access, [activeTab]] = await Promise.all([
        requestSiteAccess(),
        browser.tabs.query({ active: true, currentWindow: true }),
      ]);
      if (!activeTab?.id || !activeTab.url) throw new Error('No active tab (click the Aegis toolbar icon once on this tab first)');

      if (!access.granted) throw new Error(`Screen-capture access was denied (needed to observe ${new URL(activeTab.url).origin}).`);

      const observeResponse = await sendMessage('OBSERVE', { tabId: activeTab.id });
      await identifyObservation(observeResponse);
      setObserveResult(observeResponse);
      (window as unknown as { __aegisLastObserveResult?: ObserveResult }).__aegisLastObserveResult = observeResponse;

      const session = sessionRef.current!;
      // Stage 2 preview treats the observed origin as consented; Stage 3's consent screen will
      // populate this properly from an explicit user decision.
      session.consentedOrigins.add(new URL(observeResponse.observation.url).origin);

      const result = await processObservation({
        observation: observeResponse.observation,
        task: taskText,
        mode,
        somEnabled,
        session,
        stateToken: observeResponse.stateToken,
        screen: observeResponse.change,
        requestSpanRects: async (request) => {
          const envelope = (await browser.tabs.sendMessage(observeResponse.tabId, { type: 'SPAN_RECTS', data: request }, { frameId: 0 })) as
            | { ok: true; response: { stale: boolean; results?: Array<{ blockRef: string; rects: Array<{ x: number; y: number; width: number; height: number }>; notFound?: boolean }> } }
            | { ok: false; error: string };
          if (!envelope?.ok) throw new Error(envelope?.error ?? 'SPAN_RECTS failed');
          return envelope.response;
        },
      });
      setProcessResult(result);
      (window as unknown as { __aegisLastProcessResult?: ProcessResult }).__aegisLastProcessResult = result;
    } catch (err) {
      setObserveError(err instanceof Error ? err.message : String(err));
      setProcessResult(null);
    } finally {
      setSanitizing(false);
      setPermissionRecheckKey((k) => k + 1);
    }
  };

  const handleSend = async () => {
    if (!processResult) return;
    setObserveError(null);
    try {
      const result = await send(processResult.payload);
      setSendState({ digest: result.digest, size: result.size, at: new Date().toISOString() });
      // The payload is single-use — clear it so the UI can't offer a replay that would throw.
      setProcessResult({ ...processResult, payload: processResult.payload });
    } catch (err) {
      setObserveError(err instanceof Error ? err.message : String(err));
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
          <TaskPanel />
          <section>
            <label>Server</label>
            <pre>
              {serverStatus === 'checking' && 'checking...'}
              {serverStatus === 'offline' && 'offline — is `pnpm run server` running?'}
              {serverStatus === 'online' && health && JSON.stringify(health, null, 2)}
            </pre>
          </section>

          <section>
            <label>Task (tokenized locally before anything is sent)</label>
            <input
              type="text"
              value={taskText}
              placeholder="e.g. Fill in the KYC form for asha@example.com"
              onChange={(e) => setTaskText(e.target.value)}
            />
            <label>
              Mode{' '}
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="fast">fast</option>
                <option value="balanced">balanced</option>
                <option value="accurate">accurate</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={somEnabled} onChange={(e) => setSomEnabled(e.target.checked)} />{' '}
              Element ID marks
            </label>
            <div className="button-row">
              <button className="action" onClick={handleObserveAndSanitize} disabled={sanitizing}>
                {sanitizing ? 'Sanitizing…' : 'Observe & Sanitize'}
              </button>
              <button className="action" onClick={handleSend} disabled={!processResult}>
                Send to server (mock)
              </button>
            </div>
            {observeError && <pre className="error">{observeError}</pre>}
            {sendState && (
              <pre>
                {`sent\ndigest ${sendState.digest}\nbytes  ${sendState.size}\nat     ${sendState.at}`}
              </pre>
            )}
          </section>

          {processResult && <PrivacyPreview result={processResult} />}

          <section>
            <label>Observation only (local, no sanitization)</label>
            <button className="action" onClick={handleObserve} disabled={observing}>
              {observing ? 'Observing…' : 'Observe'}
            </button>
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
          <div key={`${el.eid}`} className="mark-row">
            {el.eid} <b>{el.role}</b> "{el.name || el.labelText || '(no name)'}" {el.visible ? '' : `hidden(${el.visibilityReason})`}{' '}
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
          key={el.eid}
          className={`overlay-mark ${el.visible ? '' : 'overlay-mark-hidden'} ${el.hitOk === false ? 'overlay-mark-blocked' : ''}`}
          style={{
            left: el.bbox.x * scaleX,
            top: el.bbox.y * scaleY,
            width: el.bbox.width * scaleX,
            height: el.bbox.height * scaleY,
          }}
        >
          <span>{el.eid}</span>
        </div>
      ))}
    </>
  );
}
