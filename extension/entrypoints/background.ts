import { onMessage, sendMessageToTab } from '../shared/messages';
import { health } from '../net/network';

// MV3 on both browsers: Chrome runs this as a service worker, Firefox as an
// event page (background.scripts, persistent: false — WXT is configured to
// force MV3 for Firefox; see wxt.config.ts).
export default defineBackground(() => {
  onMessage('PING_SERVER', async () => {
    return health();
  });

  onMessage('PING_PAGE', async (message) => {
    const tabId = message.data?.tabId;
    if (typeof tabId !== 'number') {
      throw new Error('PING_PAGE requires a tabId');
    }
    return sendMessageToTab(tabId, 'PING_PAGE', undefined);
  });

  onMessage('START_TASK', async () => {
    // TODO(stage-3): wire this to extension/agent/runAgentLoop.ts
    throw new Error('START_TASK is not implemented until Stage 3');
  });

  onMessage('STOP_TASK', async () => {
    // TODO(stage-3): signal the running agent loop to stop
    throw new Error('STOP_TASK is not implemented until Stage 3');
  });

  if (browser.sidePanel) {
    // Chrome: clicking the toolbar icon opens the side panel.
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.error('[aegis] setPanelBehavior failed', err));
  } else {
    // Firefox: the sidebar opens on toolbar click by default once sidebar_action is declared
    // (see wxt.config.ts). @wxt-dev/browser's WxtBrowser type doesn't model sidebarAction, so
    // fall back to the untyped API only if present at runtime.
    const sidebarAction = (browser as unknown as { sidebarAction?: { open: () => Promise<void> } }).sidebarAction;
    if (sidebarAction) {
      browser.action.onClicked.addListener(() => {
        sidebarAction.open().catch((err: unknown) => console.error('[aegis] sidebarAction.open failed', err));
      });
    }
  }
});
