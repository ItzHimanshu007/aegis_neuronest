/**
 * Typed message bus between background, content scripts and the side panel.
 *
 * This is the ONLY message contract in the extension. Nothing here transmits page data to the
 * server — that boundary is `net/network.ts`. Content-script → background messages carry only
 * local display data (see PING_PAGE).
 */

export interface PingPageResult {
  url: string;
  title: string;
  elementCount: number;
}

export interface HealthResult {
  status: string;
  version: string;
  model_adapter: string;
}

/** Message payload/response map. Add new message types here, never ad hoc. */
export interface MessageMap {
  /** Background -> server health check (proxies net/network.ts health()). No page data. */
  PING_SERVER: { data: undefined; response: HealthResult };
  /** Side panel -> background -> content script. Local-only page summary for display in the panel. */
  PING_PAGE: { data: { tabId: number } | undefined; response: PingPageResult };
  /** TODO(stage-3): starts extension/agent/runAgentLoop.ts for the active tab. */
  START_TASK: { data: { task: string }; response: void };
  /** TODO(stage-3): stops the running agent loop. */
  STOP_TASK: { data: undefined; response: void };
}

export type MessageType = keyof MessageMap;

export interface Message<T extends MessageType = MessageType> {
  type: T;
  data: MessageMap[T]['data'];
}

type Sender = 'background' | 'content' | 'sidepanel';

type Handler<T extends MessageType> = (
  message: Message<T>,
) => MessageMap[T]['response'] | Promise<MessageMap[T]['response']>;

const handlers = new Map<MessageType, Handler<MessageType>>();

/** Registers a handler for a message type. Intended for use in the background entrypoint. */
export function onMessage<T extends MessageType>(type: T, handler: Handler<T>): void {
  handlers.set(type, handler as unknown as Handler<MessageType>);
  if (typeof browser !== 'undefined' && !listenerInstalled) {
    installRuntimeListener();
  }
}

let listenerInstalled = false;

function installRuntimeListener(): void {
  listenerInstalled = true;
  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    const handler = handlers.get(message.type);
    if (!handler) return undefined;
    Promise.resolve(handler(message))
      .then((response) => sendResponse({ ok: true, response }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true; // keep the message channel open for the async response
  });
}

interface Envelope {
  ok: boolean;
  response?: unknown;
  error?: string;
}

/** Sends a message from the side panel or content script to the background script. */
export async function sendMessage<T extends MessageType>(
  type: T,
  data: MessageMap[T]['data'],
): Promise<MessageMap[T]['response']> {
  const envelope = (await browser.runtime.sendMessage({ type, data } satisfies Message<T>)) as Envelope;
  if (!envelope?.ok) {
    throw new Error(envelope?.error ?? `Message ${type} failed`);
  }
  return envelope.response as MessageMap[T]['response'];
}

/** Sends a message from the background script to a specific tab's content script. */
export async function sendMessageToTab<T extends MessageType>(
  tabId: number,
  type: T,
  data: MessageMap[T]['data'],
): Promise<MessageMap[T]['response']> {
  const envelope = (await browser.tabs.sendMessage(tabId, { type, data } satisfies Message<T>)) as Envelope;
  if (!envelope?.ok) {
    throw new Error(envelope?.error ?? `Message ${type} failed`);
  }
  return envelope.response as MessageMap[T]['response'];
}

export type { Sender };
