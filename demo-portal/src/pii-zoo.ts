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

// Stage 5A: same synthetic AI-generated face as #zoo-face-profile, drawn into a canvas instead of
// an <img> — the point is that a canvas is just as DOM-blind as an <img>, so the local face
// detector has to find it the same way (crop the region's pixels, not read any DOM attribute).
const faceCanvas = document.getElementById('zoo-face-canvas') as HTMLCanvasElement | null;
if (faceCanvas) {
  const ctx = faceCanvas.getContext('2d');
  const img = new Image();
  img.onload = () => ctx?.drawImage(img, 0, 0, faceCanvas.width, faceCanvas.height);
  img.src = '/faces/profile-photo.jpg';
}

// Mutates the text between capture and SPAN_RECTS, so the span-rect service reports STALE and the
// redactor falls back to masking the whole block (Stage 2 Part A3's fail-closed path).
document.getElementById('mutate-btn')?.addEventListener('click', () => {
  const block = document.getElementById('mutating-block');
  if (!block) return;
  block.textContent = 'Contact someone-else-entirely@example.com for details, and note this text is now much longer than it was at capture time.';
});
