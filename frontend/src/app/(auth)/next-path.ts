/** The ?next= path to return to after signing in, limited to this site. */
export function nextPath(fallback = "/dashboard"): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
