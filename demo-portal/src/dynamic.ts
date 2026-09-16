// Modal (tests NEW_SCREEN via dialog-appeared). It opens automatically 1s after load, and can be
// re-opened on demand so a test can observe a deterministic closed -> open transition.
function openModal(): void {
  if (document.getElementById('modal-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `
    <div id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">Confirm</h2>
      <p>This modal appeared automatically.</p>
      <button id="modal-close" type="button">Close</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('modal-close')?.addEventListener('click', () => backdrop.remove());
}

setTimeout(openModal, 1000);
document.getElementById('open-modal-btn')?.addEventListener('click', openModal);

// Re-renders the form with a brand new id/class but the same label/role — fp should be stable.
let rerenderCount = 0;
document.getElementById('rerender-btn')?.addEventListener('click', () => {
  rerenderCount++;
  const target = document.getElementById('rerender-target');
  if (!target) return;
  const newId = `rerender-field-b${rerenderCount}`;
  target.innerHTML = `
    <label for="${newId}">Re-rendered field</label>
    <input id="${newId}" class="field-v${rerenderCount + 1}-${Date.now()}" type="text" />
  `;
});
