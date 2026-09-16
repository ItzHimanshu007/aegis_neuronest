import { onMessage } from '../shared/messages';

// Content script: plain TypeScript, no React (see AGENTS.md conventions).
//
// TODO(stage-1): this becomes the Set-of-Marks harvester. For Stage 0 it only answers PING_PAGE
// with a local element count for display in the side panel — this result is never sent to the
// server; see AGENTS.md invariant 1.
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    onMessage('PING_PAGE', () => {
      return {
        url: location.href,
        title: document.title,
        elementCount: document.querySelectorAll('a, button, input, select, textarea').length,
      };
    });
  },
});
