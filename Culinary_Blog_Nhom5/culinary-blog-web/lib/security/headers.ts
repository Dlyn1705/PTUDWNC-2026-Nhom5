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

type ContentSecurityPolicyOptions = {
  development: boolean; secure: boolean; apiUrl: string; imageOrigins: string;
};

function policy(options: ContentSecurityPolicyOptions, scriptSource: string, styleSource: string) {
  const api = origins(options.apiUrl);
  const images = origins(options.imageOrigins);
  return [
    "default-src 'self'",
    `script-src ${scriptSource}${options.development ? " 'unsafe-eval'" : ""}`,
    `style-src ${styleSource}`,
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

export function contentSecurityPolicy(nonce: string, options: ContentSecurityPolicyOptions) {
  if (!/^[A-Za-z0-9+/=]+$/.test(nonce)) throw new Error("Invalid CSP nonce.");
  return policy(
    options,
    `'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com`,
    `'self' 'nonce-${nonce}' https://accounts.google.com`,
  );
}

/** ISR HTML cannot carry a per-request nonce because the document is shared-cached. */
export function staticContentSecurityPolicy(options: ContentSecurityPolicyOptions) {
  return policy(
    options,
    "'self' 'unsafe-inline' https://accounts.google.com",
    "'self' 'unsafe-inline' https://accounts.google.com",
  );
}
