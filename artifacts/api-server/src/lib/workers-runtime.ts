export function runningInWorkers(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Cloudflare-Workers");
}
