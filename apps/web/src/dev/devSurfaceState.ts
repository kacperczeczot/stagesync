import type { DevSurface } from "./devSurfaceTypes.js";
import { getDevPreviewConfig } from "./devPreviewConfig.js";

let devSurfaceOverride: DevSurface | null = null;
let devSessionOverride: boolean | null = null;

export function setDevSurfaceOverride(surface: DevSurface | null): void {
  devSurfaceOverride = surface;
}

export function getDevSurfaceOverride(): DevSurface | null {
  return devSurfaceOverride;
}

export function setDevSessionOverride(session: boolean | null): void {
  devSessionOverride = session;
}

export function getDevSessionOverride(): boolean | null {
  return devSessionOverride;
}

/** Active DEV surface from preview URL or matrix override. */
export function getActiveDevSurface(): DevSurface | null {
  if (!import.meta.env.DEV) return null;
  return getDevPreviewConfig()?.surface ?? devSurfaceOverride;
}

/** Active DEV operator session from preview URL or matrix override. */
export function getActiveDevSession(): boolean | null {
  if (!import.meta.env.DEV) return null;
  const previewConfig = getDevPreviewConfig();
  if (previewConfig !== null) return previewConfig.session;
  return devSessionOverride;
}
