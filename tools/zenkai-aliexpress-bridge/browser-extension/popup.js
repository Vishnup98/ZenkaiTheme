const status = document.querySelector("#status");
const run = document.querySelector("#run");
const extensionVersion = chrome.runtime.getManifest().version;

async function send(type) {
  return chrome.runtime.sendMessage({ type });
}

run.addEventListener("click", async () => {
  run.disabled = true;
  status.textContent = "Checking for a queued checkout…";
  const result = await send("zenkai-run-queued-checkout").catch((error) => ({ ok: false, error: error.message }));
  status.textContent = `v${extensionVersion} · ${result?.message || (result?.ok ? "Checkout worker started." : "The local dashboard is unavailable.")}`;
  run.disabled = false;
});

send("zenkai-extension-heartbeat")
  .then((result) => { status.textContent = `v${extensionVersion} · ${result?.message || "Connected to the local dashboard."}`; })
  .catch(() => { status.textContent = `v${extensionVersion} · Start the Zenkai fulfillment dashboard on port 4317.`; });
