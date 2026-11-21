export function safeInternalNotificationPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const base = "https://internal-notification.invalid";
    const target = new URL(value, base);
    if (target.origin !== base || !target.pathname.startsWith("/") || target.pathname.startsWith("//")) return null;
    const decodedPath = decodeURIComponent(target.pathname);
    if (decodedPath.startsWith("//") || decodedPath.includes("\\")) return null;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}
