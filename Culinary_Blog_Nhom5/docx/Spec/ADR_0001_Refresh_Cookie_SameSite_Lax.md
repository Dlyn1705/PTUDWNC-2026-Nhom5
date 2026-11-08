# ADR 0001: Refresh cookie SameSite=Lax

Status: accepted for issue #86 (2026-11-04).

The SRS section 4.2 specifies `SameSite=Strict`; the team assignment specifies `SameSite=Lax`. The implementation uses explicit `Lax` for the refresh cookie and the short-lived Google external sign-in cookie. Lax permits the OAuth top-level return flow and the intended browser session flow while withholding the refresh cookie from ordinary cross-site POST requests. The access token remains a Bearer token, and the refresh token is not returned in browser JSON.

Threat model: an attacker page can submit a form or attempt a fetch to `/api/v1/auth/refresh` or `/logout`. CORS does not stop a simple form POST. A browser may attach the Lax cookie on eligible top-level navigations, and a sibling subdomain is same-site. Therefore these endpoints reject cookie-bearing requests unless `Origin` exactly matches the API origin or an explicit `Cors:AllowedOrigins` entry; they also reject `Sec-Fetch-Site: cross-site`. Missing or malformed Origin is rejected. Non-browser clients may send a refresh token in the JSON body without a cookie. The cookie is `Secure`, `HttpOnly`, scoped to `/api/v1/auth`, and has a seven-day expiry. A stolen refresh token still requires server-side rotation/reuse detection and revocation.

Verification: `CredentialSecurityTests.Refresh_cookie_rejects_untrusted_origin_and_cross_site_fetch`, `RefreshTokenTests.CookieTakesPrecedenceOverBodyAndMalformedJsonIs400`, and `RefreshTokenTests.ExpiredAccessTokenCanRefreshWithoutBearerAndRotateBothTokens`. Production CORS tests reject unlisted origins. Deployments must use explicit HTTPS origins in `Cors:AllowedOrigins` and must not place an untrusted origin on that list.

Consequence: changing an allowed frontend origin requires updating server CORS configuration before rollout. A script client that supplies a cookie must also supply a trusted Origin; JSON-body refresh remains available for non-browser clients.
