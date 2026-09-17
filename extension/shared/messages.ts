/**
 * Typed message bus between the background script and the side panel.
 *
 * This is the ONLY public message contract in the extension. Nothing here transmits page data to
 * the server — that boundary is `net/network.ts`. `OBSERVE`'s response is a full `Observation`
 * (see observe/types.ts's `LocalOnly<T>`), which is fine to pass over this internal bus — it
 * never leaves the browser this way; see observe/__tests__/localOnly.typetest.ts for the proof
 * that it specifically cannot reach `net/network.ts -> send()`.
 *
 * Internal content-script <-> background messages (HARVEST_TREE, FRAME_HELLO, etc.) are NOT part
 * of this bus — they're implementation details of the capture pipeline, typed locally in
 * entrypoints/content.ts and entrypoints/background.ts.
 */

import type { ChangeResult } from '../observe/change';
import type { Observation } from '../observe/types';

/**
 * The freshness token for one capture. The content script stamps every harvest with one and
 * refuses a later SPAN_RECTS lookup unless the token it is handed still matches — any scroll,
 * resize, zoom or DOM mutation in between invalidates the rects it would compute.
 *
 * It lives here, in the message contract, because three separate places have to agree on its
 * exact shape: the content script that mints and checks it, background, which carries it through
 * the capture loop, and the side panel, which hands it back on the SPAN_RECTS call. It used to be
 * declared twice, and the panel passed the viewport object instead — structurally similar, no
 * `mutationCounter`, so every lookup was silently reported stale and every text detection fell
 * back to masking its whole block.
 */
export interface StateToken {
  mutationCounter: number;
  scrollX: number;
  scrollY: number;
  dpr: number;
  visualScale: number;
  innerWidth: number;
  innerHeight: number;
}

export interface HealthResult {
  status: string;
  version: string;
  model_adapter: string;
}

export interface ObserveResult {
  observation: Observation;
  change: ChangeResult;
  /** The tab this observation was captured from. The agentHost (Stage 2 Part A2, running in the
   * side panel) uses this to call `browser.tabs.sendMessage(tabId, { type: 'SPAN_RECTS', ... })`
   * directly — SPAN_RECTS is a content-script query the host makes on its own, not something
   * background needs to know about or relay (background stays a thin capture-only router). */
  tabId: number;
  /** The token this capture stabilized on, for the agentHost's SPAN_RECTS call. */
  stateToken: StateToken;
}

/** Message payload/response map. Add new message types here, never ad hoc. */
export interface MessageMap {
  /** Background -> server health check (proxies net/network.ts health()). No page data. */
  PING_SERVER: { data: undefined; response: HealthResult };
  /** Side panel -> background: runs the full Stage 1 capture pipeline for `tabId` and returns the
   * resulting Observation plus the NEW_SCREEN/SAME_SCREEN decision against the previous one. */
  OBSERVE: { data: { tabId: number; domOnly?: boolean }; response: ObserveResult };
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

/** Sends a message from the side panel to the background script. */
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

export type { Sender };
