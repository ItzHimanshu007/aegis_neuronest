/**
 * Side-channel sanitizer. TODO(stage-2): sanitize document.title, location.href, ARIA live
 * regions and placeholder text before they reach firewall.seal().
 */

export function sanitizeSideChannels(_raw: unknown): never {
  throw new Error('NotImplemented: privacy/sideChannels.ts lands in Stage 2');
}
