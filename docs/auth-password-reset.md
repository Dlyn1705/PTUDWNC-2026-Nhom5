# Password reset and change contract

All paths below are relative to `/api/v1`. Responses from auth endpoints have `Cache-Control: no-store`. Errors use RFC 7807 Problem Details.

| Endpoint | Request JSON | Success | Errors |
| --- | --- | --- | --- |
| `POST /auth/forgot-password` | `{ "email": "user@example.com" }` | `202` with the same generic message for known and unknown valid email addresses | `422` invalid email, `429` rate limit |
| `POST /auth/reset-password` | `{ "email": "user@example.com", "token": "...", "newPassword": "..." }` | `204` | `400` invalid, expired or used token; `422` invalid password/email; `429` rate limit |
| `POST /auth/change-password` | Bearer token; `{ "currentPassword": "...", "newPassword": "..." }` | `204`, clears refresh cookie | `401` no authentication, `403` wrong role, `422` invalid current/new password, `429` rate limit |

Reset tokens are generated with 32 random bytes, stored only as SHA-256 hashes, expire after 30 minutes and are consumed atomically. A successful reset or password change revokes all active refresh tokens for the account and invalidates outstanding reset links. Existing access JWTs expire at their normal short lifetime. The password policy is enforced by ASP.NET Core Identity.

The auth rate limiter allows 10 requests per client IP per minute across auth endpoints. A known account receives at most one reset email per minute. The email link points to `/auth/reset-password` on `Email:PublicWebBaseUrl`; SMTP delivery uses the existing `Email` settings. Set `Email:Enabled=true` and configure the SMTP host/sender for usable recovery email. The API always returns the generic success response even if mail delivery fails; the server logs the delivery error without logging the token.
