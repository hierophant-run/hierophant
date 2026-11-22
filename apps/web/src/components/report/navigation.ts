/** A full page load gives the report its own strict Content-Security-Policy. */
export function goToReport(id: string): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- See above.
  window.location.assign(`/r/${encodeURIComponent(id)}`);
}
