# ADR-0001: Auth.js owns the browser session boundary

## Context

Issue #65 requires a single API-client contract, safe access-token handling,
and one refresh attempt for a rejected request. The application already uses
Auth.js with a Redis-backed session coordinator. The browser never receives a
refresh token or Redis session identifier; the API client obtains a short-lived
access token from the current Auth.js session when it sends an API request.

The existing Zustand store contains only the UI projection of that session:
user ID, display name, roles, and authentication state. It intentionally does
not persist access or refresh tokens.

## Decision

Keep Auth.js and the Redis session coordinator as the source of truth for
session restoration, refresh-token rotation, and logout. Keep the access token
out of localStorage, sessionStorage, logs, HTML, and the Zustand store.

`axiosClient` obtains the current access token through `getSession()`. Its
`sessionAuth` interceptor coalesces simultaneous 401 responses into one forced
refresh and retries each original request at most once. Zustand continues to
serve UI state only, so it cannot become a competing source of authentication
state.

## Consequences

- A page reload restores its session through the existing Auth.js flow.
- Refresh credentials remain server-side and are revoked by the existing
  session coordinator on refresh failure or logout.
- Any future change that moves token ownership into Zustand must replace the
  Auth.js/Redis session flow as a single, explicitly reviewed migration.
