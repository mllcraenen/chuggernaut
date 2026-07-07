// Single source of truth for the URL prefix the app is served under
// (tools.marijncraenen.nl/tools/workout → Caddy → this container).
// next.config.ts reads it for basePath; client code must use apiUrl() for
// fetch() calls because basePath is NOT applied to fetch, only to
// next/link and next/navigation.
export const BASE_PATH = "/tools/workout";

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
