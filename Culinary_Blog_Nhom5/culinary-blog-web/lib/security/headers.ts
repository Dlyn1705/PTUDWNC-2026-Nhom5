export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

function origins(values: string): string[] {
  return values.split(",").map(value => {
    if (!value.trim()) return "";
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("CSP origins must use HTTP or HTTPS.");
    return url.origin;
  }).filter(Boolean);
}

export function contentSecurityPolicy(nonce: string, options: {
  development: boolean; secure: boolean; apiUrl: string; imageOrigins: string;
}) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error("Invalid CSP nonce.");
  const api = origins(options.apiUrl);
  const images = origins(options.imageOrigins);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com${options.development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' https://accounts.google.com`,
    // Radix/React positioning uses style attributes; script directives remain strict.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data: https://images.unsplash.com https://lh3.googleusercontent.com ${images.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' https://accounts.google.com ${api.join(" ")}${options.development ? " ws: wss:" : ""}`,
    "frame-src https://accounts.google.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(options.secure && !options.development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
