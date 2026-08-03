export type Platform = "windows" | "macos" | "linux" | "other";

export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";

  const ua = navigator.userAgent;
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";
  return "other";
}
