function requestRun() {
  chrome.runtime.sendMessage({ type: "zenkai-run-queued-checkout" }).catch(() => {});
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.type === "ZENKAI_CHECKOUT_JOB_QUEUED") requestRun();
});

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.zenkaiAliExpressExtension = "connected";
  window.dispatchEvent(new CustomEvent("zenkai-extension-connected"));
  chrome.runtime.sendMessage({ type: "zenkai-extension-heartbeat" }).catch(() => {});
});
