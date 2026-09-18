// Demo portal behaviour only — not part of the extension. Toggles the cookie-banner overlay via
// ?banner=1, which is used to test whether the agent correctly detects an occluded Submit button.
const params = new URLSearchParams(location.search);
const banner = document.getElementById('cookie-banner');
const acceptButton = document.getElementById('cookie-accept');

if (params.get('banner') === '1' && banner) {
  banner.hidden = false;
}

acceptButton?.addEventListener('click', () => {
  if (banner) banner.hidden = true;
});

// Renders the submitted state into the DOM rather than a native `alert()`: the harvester reads
// page text, not dialog boxes, so a postcondition check like `text_present: "submitted"` (used by
// the kyc_submit mock scenario) needs real text on the page to find.
const form = document.getElementById('kyc-form') as HTMLFormElement | null;
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  form.hidden = true;
  const status = document.createElement('p');
  status.id = 'kyc-submitted-status';
  status.textContent = 'Verification submitted. Nothing was actually sent anywhere — this is a synthetic demo.';
  form.insertAdjacentElement('afterend', status);
});
