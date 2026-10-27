// Capture Chrome's one-shot install event before the React app hydrates.
window.__pwaInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__pwaInstallPrompt = event;
  window.dispatchEvent(new Event("pwa-install-ready"));
});
