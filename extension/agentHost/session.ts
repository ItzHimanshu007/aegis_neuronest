/**
 * Per-task privacy session (Stage 2 Part A2). Owns the vault, the identity-accumulation state and
 * the user's category overrides.
 *
 * WHERE THIS RUNS MATTERS: the agentHost is loaded by the side panel / sidebar document, never by
 * the background service worker. Chrome can evict an MV3 service worker after ~30s idle, which
 * would silently destroy the vault mid-task — losing the user's credential and every token the
 * server is still referencing. The panel document lives as long as the panel is open.
 *
 * Closing the panel therefore ENDS THE SESSION: the whole JS context is torn down by the browser,
 * taking the vault entries and the non-extractable key reference with it. There is no persistence
 * path — nothing here is ever written to storage (AGENTS.md invariant 8).
 */

import { SessionPrivacyState } from '../privacy/policy';
import { TokenVault } from '../privacy/vault';
import { newSessionId } from '../privacy/payloadBuilder';
import type { Action, Category } from '../privacy/categoryTypes';

export class PrivacySession {
  readonly vault = new TokenVault();
  readonly privacyState = new SessionPrivacyState();
  readonly sessionId = newSessionId();

  /** Origins the user has explicitly consented to for this task (Stage 3 populates this from the
   * consent screen; Stage 2's preview treats the observed origin as consented for preview only). */
  readonly consentedOrigins = new Set<string>();

  /** User category overrides. Locked classes ignore these — see privacy/policy.ts's `decide`. */
  userOverrides: Partial<Record<Category, Action>> = {};

  /** Categories the task itself supplied tokens for, used by the necessity heuristic. */
  readonly taskCategories = new Set<Category>();

  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.vault.init();
    this.initialized = true;
  }

  /** Ends the task: clears the vault (dropping the key reference) and the identity state. */
  end(): void {
    this.vault.clear();
    this.privacyState.clear();
    this.consentedOrigins.clear();
    this.taskCategories.clear();
    this.initialized = false;
  }
}
