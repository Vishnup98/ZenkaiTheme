import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SECURITY_BIN = "/usr/bin/security";

export const KEYCHAIN_SERVICES = Object.freeze({
  appKey: "zenkai-aliexpress-app-key",
  appSecret: "zenkai-aliexpress-app-secret",
  accessToken: "zenkai-aliexpress-access-token",
  refreshToken: "zenkai-aliexpress-refresh-token",
  oauthState: "zenkai-aliexpress-oauth-state",
  tokenMetadata: "zenkai-aliexpress-token-metadata",
});

export class KeychainError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "KeychainError";
    this.details = details;
  }
}

function defaultAccount() {
  const account = process.env.USER || process.env.LOGNAME;
  if (!account) throw new KeychainError("Could not determine the current macOS account name.");
  return account;
}

function assertService(service) {
  if (!Object.values(KEYCHAIN_SERVICES).includes(service)) {
    throw new KeychainError("Refusing to access an unknown Keychain service.");
  }
}

function isMissingItem(error) {
  return error?.code === 44 || /could not be found/i.test(error?.stderr || "");
}

export async function getSecret(service, { allowMissing = false, account = defaultAccount() } = {}) {
  assertService(service);
  try {
    const { stdout } = await execFileAsync(
      SECURITY_BIN,
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
    return stdout.replace(/[\r\n]+$/, "");
  } catch (error) {
    if (allowMissing && isMissingItem(error)) return null;
    if (isMissingItem(error)) {
      throw new KeychainError(`Missing required Keychain item: ${service}.`, { service });
    }
    throw new KeychainError(`Could not read Keychain item: ${service}.`, { service });
  }
}

export async function setSecret(service, value, { account = defaultAccount() } = {}) {
  assertService(service);
  if (typeof value !== "string" || value.length === 0) {
    throw new KeychainError(`Refusing to store an empty Keychain item: ${service}.`, { service });
  }
  try {
    // execFile bypasses the shell. stdout/stderr are captured and never forwarded,
    // preventing AliExpress credentials from being written to terminal logs.
    await execFileAsync(
      SECURITY_BIN,
      ["add-generic-password", "-a", account, "-s", service, "-U", "-w", value],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
  } catch {
    throw new KeychainError(`Could not write Keychain item: ${service}.`, { service });
  }
}

export async function deleteSecret(service, { account = defaultAccount(), allowMissing = true } = {}) {
  assertService(service);
  try {
    await execFileAsync(
      SECURITY_BIN,
      ["delete-generic-password", "-a", account, "-s", service],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
  } catch (error) {
    if (allowMissing && isMissingItem(error)) return;
    throw new KeychainError(`Could not delete Keychain item: ${service}.`, { service });
  }
}

export async function secretExists(service) {
  const value = await getSecret(service, { allowMissing: true });
  return typeof value === "string" && value.length > 0;
}
