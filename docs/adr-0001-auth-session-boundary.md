# ADR-0001: JWT backend owns the browser session

## Context

Issue #67 selects the architecture described in the Culinary Blog spec: the
ASP.NET Core API issues short-lived access tokens and rotating refresh cookies.
The earlier Auth.js and Redis session coordinator introduced a second session
source and could not serve the requested Zustand memory boundary.

## Decision

- The backend is the only authority for login, refresh rotation, role checks,
  ownership checks and logout revocation.
- The browser sends the backend's `HttpOnly; Secure; SameSite=Lax` refresh cookie
  through credentialed requests. JavaScript never reads or stores its value.
- `store/authStore.ts` holds the access token and minimal session user in memory.
  It never uses localStorage or sessionStorage. The backend refresh response
  includes user and roles, so initial refresh also serves the `me` step.
- On reload, `AuthSessionProvider` makes one shared refresh request before UI
  guards render protected content. `axiosClient` attaches the memory token and
  coalesces 401 refreshes before retrying each rejected request once.
- TanStack Query owns fetched API data. Its cache is cleared when the signed-in
  user changes or signs out.
- Client route guards control navigation and visibility. Backend authorization
  remains required for every protected API endpoint. No access token is sent in
  server-rendered HTML.

## Consequences

Auth.js routes, server session coordination, Redis session storage and the
Auth.js dependency are removed. Protected pages now render after hydration and
session initialization. The frontend and backend must use compatible origins
and credentialed CORS; production must use HTTPS for the refresh cookie.
