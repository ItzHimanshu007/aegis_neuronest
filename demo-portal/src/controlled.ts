/**
 * A React-style controlled form, written in plain TypeScript.
 *
 * The portal deliberately has no framework dependency: what needs exercising is the DOM behaviour
 * a framework produces, not the framework. Two behaviours matter to the agent:
 *
 * 1. The element does not own its value — `state` does, and every `input` event re-asserts state
 *    onto the element. A fill that merely assigns `el.value` is erased by the event it triggers.
 *    `executor.ts -> setNativeValue()` writes through the prototype's value setter, which is what
 *    a real framework's value tracker reads, so the state update it dispatches carries the new
 *    value and the re-assert is a no-op. That is the happy path here.
 *
 * 2. `?revert=name` models the other half: a form whose re-render drops a field that really was
 *    filled. The name is cleared once a LATER field is filled, so the loss happens strictly after
 *    the executor has read the value back and reported a match. Nothing but a fresh observation
 *    can catch it — which is exactly the case the task requirement ledger exists for.
 *
 * Event-driven, never timed: the revert is triggered by the next field's input, so it cannot race
 * the observation pipeline and make a test flaky.
 */
const state: Record<string, string> = { 'c-full-name': '', 'c-email': '' };
const fields = [...document.querySelectorAll<HTMLInputElement>('#controlled-form input')];
const revert = new URLSearchParams(location.search).get('revert');

for (const field of fields) {
  field.addEventListener('input', event => {
    state[field.name] = field.value;
    // The controlled re-assert. A no-op when the write went through the native setter.
    field.value = state[field.name];

    // Only ever fights a synthetic fill. A human typing on this page during a manual demo keeps
    // what they typed.
    if (revert && !event.isTrusted && field.name !== revert && state[revert]) {
      const dropped = fields.find(f => f.name === revert);
      if (dropped) { state[revert] = ''; dropped.value = ''; }
    }
  });
}

document.querySelector<HTMLFormElement>('#controlled-form')?.addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector<HTMLElement>('#c-submitted-status')?.removeAttribute('hidden');
});
