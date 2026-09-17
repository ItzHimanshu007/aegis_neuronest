// PII Zoo behaviour. Synthetic data only — see the page's own badge.

// Canvas with drawn text: the DOM says nothing about what's inside, which is exactly why Stage 2
// treats every canvas as UNSCANNED_MEDIA (fail-closed) until Stage 6's vision layer can look.
const canvas = document.getElementById('zoo-canvas') as HTMLCanvasElement | null;
if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffeaa7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2d3436';
    ctx.font = '13px sans-serif';
    ctx.fillText('Canvas-drawn PII:', 10, 26);
    ctx.fillText('rahul.canvas@example.com', 10, 48);
    ctx.fillText('Aadhaar 4567 8901 2341', 10, 70);
  }
}

// Mutates the text between capture and SPAN_RECTS, so the span-rect service reports STALE and the
// redactor falls back to masking the whole block (Stage 2 Part A3's fail-closed path).
document.getElementById('mutate-btn')?.addEventListener('click', () => {
  const block = document.getElementById('mutating-block');
  if (!block) return;
  block.textContent = 'Contact someone-else-entirely@example.com for details, and note this text is now much longer than it was at capture time.';
});
