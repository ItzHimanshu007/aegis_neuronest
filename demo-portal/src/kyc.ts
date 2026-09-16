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

document.getElementById('kyc-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  window.alert('This is a synthetic demo form. Nothing was submitted.');
});
