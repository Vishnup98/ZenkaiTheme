export const ZENKAI_BROWSER_EXTENSION_ID = "akilecnnblddidmbpajhhlhfickhocpo";
export const ZENKAI_BROWSER_EXTENSION_ORIGIN = `chrome-extension://${ZENKAI_BROWSER_EXTENSION_ID}`;
// Local pairing secret shared only by this unpacked extension and the loopback
// dashboard. Chrome can assign a different extension ID to an unpacked build,
// so the server authenticates the extension with this secret instead of
// assuming a path-derived ID.
export const ZENKAI_BROWSER_EXTENSION_TOKEN = "90cc5f80919b6978c5830b0af90a1ab78bf1491e308625733edfab3b41f86eb4";
