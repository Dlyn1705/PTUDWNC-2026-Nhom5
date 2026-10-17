import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }] },
    ];
  },
};

export default nextConfig;
