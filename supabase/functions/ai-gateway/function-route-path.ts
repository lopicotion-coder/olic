export function functionRoutePath(pathname: string, functionName: string): string {
  if (!pathname.startsWith("/") || !functionName.trim() || functionName.includes("/")) {
    return "/__invalid__";
  }

  const marker = `/functions/v1/${functionName}`;
  const markerIndex = pathname.indexOf(marker);
  const suffix = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : pathname;

  if (suffix === "" || suffix === "/") return "/";
  return suffix.startsWith("/") ? suffix : "/__invalid__";
}
