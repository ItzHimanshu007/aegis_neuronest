import { useEffect, useState } from 'react';
import { sendMessage, type HealthResult, type PingPageResult } from '../../shared/messages';

type ServerStatus = 'checking' | 'online' | 'offline';
type Tab = 'agent' | 'judge';

/** Detects whether this browser exposes chrome.sidePanel (Chrome) vs sidebarAction (Firefox). */
function useMissingHostPermissionWarning(): string | null {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    browser.permissions
      .contains({ origins: ['<all_urls>'] })
      .then((granted) => {
        if (!cancelled && !granted) {
          setWarning(
            'Aegis needs host permission for the pages you want it to help on. On Firefox, grant it via ' +
              'about:addons → Aegis → Permissions, or click "Allow" when prompted after installing.',
          );
        }
      })
      .catch(() => {
        // permissions.contains itself can be unavailable in some contexts; not fatal for Stage 0.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return warning;
}

function ServerStatusDot({ status }: { status: ServerStatus }) {
  const cls = status === 'online' ? 'online' : status === 'offline' ? 'offline' : '';
  return <span className={`status-dot ${cls}`} title={`Server: ${status}`} />;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('agent');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [pageResult, setPageResult] = useState<PingPageResult | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const hostPermissionWarning = useMissingHostPermissionWarning();

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

  const checkPage = async () => {
    setPageError(null);
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab');
      const result = await sendMessage('PING_PAGE', { tabId: activeTab.id });
      setPageResult(result);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err));
      setPageResult(null);
    }
  };

  return (
    <div>
      <h1>
        <ServerStatusDot status={serverStatus} />
        Aegis
      </h1>

      {hostPermissionWarning && <div className="warning">{hostPermissionWarning}</div>}

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
            <label>Page check (local only — never sent to the server)</label>
            <button className="action" onClick={checkPage}>
              Check page
            </button>
            {pageError && <pre>{pageError}</pre>}
            {pageResult && <pre>{JSON.stringify(pageResult, null, 2)}</pre>}
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
