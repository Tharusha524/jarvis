import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SystemSnapshot } from "../types/assistant";

/** False in a plain browser, where the Rust commands do not exist. */
export const isDesktopApp = isTauri();

export function getSystemSnapshot(): Promise<SystemSnapshot> {
  return invoke<SystemSnapshot>("get_system_snapshot");
}

export function checkInternet(): Promise<boolean> {
  return invoke<boolean>("check_internet");
}

/** Calls `onChange` when the window is minimized or restored. Returns a stop function. */
export function watchMinimized(onChange: (minimized: boolean) => void): () => void {
  if (!isDesktopApp) return () => {};
  const window = getCurrentWindow();
  const stop = window.onResized(() => {
    void window.isMinimized().then(onChange);
  });
  return () => void stop.then((unlisten) => unlisten());
}

export const appWindow = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
};
