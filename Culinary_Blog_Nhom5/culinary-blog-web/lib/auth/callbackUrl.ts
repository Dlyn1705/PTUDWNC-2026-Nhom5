export function safeCallbackUrl(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")
    || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://culinary.local");
    return parsed.origin === "https://culinary.local" ? value : fallback;
  } catch {
    return fallback;
  }
}
