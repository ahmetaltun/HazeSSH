import { getVersion } from "@tauri-apps/api/app";

/**
 * Synchronous application version injected at build time from root package.json.
 * Guarantees immediate rendering without layout shift or empty states.
 */
export const APP_VERSION = __APP_VERSION__;

/**
 * Asynchronously retrieves the active application version from the Tauri runtime core.
 * Falls back safely to build-time APP_VERSION in browser previews or test environments.
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch (err) {
    console.warn("Failed to retrieve runtime version from Tauri app core:", err);
    return APP_VERSION;
  }
}
