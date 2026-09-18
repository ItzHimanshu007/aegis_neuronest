// Demo portal behaviour only — not part of the extension. A synthetic "sign in": any non-empty
// password succeeds (there is no real backend), and success swaps the form for a dashboard view
// in place, the same in-page-state-change pattern kyc.ts uses for its submit — no real navigation,
// so `verify()`'s `text_present`/`no_validation_error` checks have real DOM text to check against
// instead of a native `alert()` dialog, which the harvester can't see at all.
const form = document.getElementById('login-form') as HTMLFormElement | null;
const username = document.getElementById('username') as HTMLInputElement | null;
const password = document.getElementById('password') as HTMLInputElement | null;
const error = document.getElementById('login-error');
const dashboard = document.getElementById('dashboard');
const dashboardUser = document.getElementById('dashboard-user');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!password?.value) {
    error?.removeAttribute('hidden');
    password?.setAttribute('aria-invalid', 'true');
    return;
  }
  error?.setAttribute('hidden', '');
  password?.removeAttribute('aria-invalid');
  if (dashboardUser && username) dashboardUser.textContent = username.value;
  form.hidden = true;
  dashboard?.removeAttribute('hidden');
});
