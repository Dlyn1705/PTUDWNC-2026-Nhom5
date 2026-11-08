# Security compliance review — issue #86

Scope: SRS 4.2, NFR-SEC-001..007. Review date: 2026-11-04. Owners: Ân; coordination with Tuấn (limits/logging/infrastructure), Trâm (upload/ownership), Linh (frontend CSP/SEO).

## Evidence and decisions

| Control | Implementation and automated evidence |
| --- | --- |
| Password | ASP.NET Identity V3 PBKDF2 HMAC-SHA512, 100,000 rounds; Identity and FluentValidation require upper/lower/digit/special, minimum eight. `CredentialSecurityTests` decodes the real configured hash header and verifies a hash. `RegisterCommandValidatorTests` checks invalid passwords. |
| Access and refresh tokens | `JwtService` signs HS256 with `userId`, email, roles, jti and 15-minute expiry. Refresh tokens use 64 cryptographic random bytes; only SHA-256 hashes are stored for seven days. `CredentialSecurityTests` checks claims, signing algorithm, lifetime, entropy and digest; `RefreshTokenTests` checks rotation, concurrent replay, family/session revocation and expiry. |
| Rate limiting | Per connection IP: 100/minute across `/api`, 10/minute for auth, 5/minute for uploads. Recipe read/write additionally have IP buckets of 100/30. All rejected policies return 429 Problem Details and `Retry-After`. `ApiSecurityTests`, `ProgramSecurityTests` and `RecipeApiConfigurationTests` exercise the actual middleware. A trusted reverse proxy must pass the client IP through ASP.NET Core's *trusted* forwarded-header configuration; do not trust arbitrary `X-Forwarded-For`. |
| Input, SQL and upload | FluentValidation is registered in the MediatR pipeline and on profile inputs. EF LINQ and `FromSqlInterpolated`/`ExecuteSqlInterpolated` parameterize values; no production raw SQL interpolation of request fields was found. Multipart sections stop at 5 MiB during form binding, before the file stream reaches the handler. Handler checks length and ownership before storage; magic bytes, extension, MIME and path-free filename must agree. Object keys use recipe/image GUIDs, not the client filename. `StorageLifecycleTests` covers forged bytes, oversize and traversal before persistence. |
| Browser and transport | Kestrel HTTPS accepts TLS 1.2/1.3; production HTTP redirects to HTTPS port 443. HSTS is sent on production HTTPS responses. CORS requires explicit origins; API CSP denies active content and frontend CSP uses a nonce. Tests: `ProgramSecurityTests`, `ApiSecurityTests`, frontend `test:security`. Production reverse proxies must enforce TLS 1.2+ and forward the HTTPS scheme only from trusted hops. |
| Cookies and CSRF | Refresh and external OAuth cookies are Secure/HttpOnly in production, SameSite=Lax. Exact trusted Origin and Fetch Metadata checks protect cookie-based refresh/logout. See `ADR_0001_Refresh_Cookie_SameSite_Lax.md` for the SRS Strict deviation and threat model. |
| Authorization and audit | `ProgramSecurityTests.Every_protected_mutation_has_server_side_authorization_metadata` inventories all API mutations. Recipe command/store ownership checks occur before save; existing recipe, image, step, ingredient and admin integration tests exercise non-owner denial. `RequestAuditMiddleware` records method, route template, UserId, status and UTC timestamp for every write; safe logging uses allowlisted fields and omits body, cookie, password and tokens. `LoggingTests` and `Issue83SinkTests` cover redaction. |
| Secrets | `.env.example` has blank secret values; real values belong in environment variables, container secret mounts or local `dotnet user-secrets`, never Git. CI runs Gitleaks over full history. Local Gitleaks v8.24.3 scanned 183 commits: two reviewed false positives (static test key and upstream NuGet README sample), each suppressed by its exact historical fingerprint in `.gitleaks.toml`; no other findings. |

## Permission matrix

`✓` means allowed when input and domain state are valid; `401` means no authentication; `403` means forbidden. Owner is the author of the target recipe. Profile writes affect only the caller's own account. All routes below have the `/api/v1` prefix.

| Mutation routes | Guest | Author owner | Author other | Admin | Enforcement |
| --- | --- | --- | --- | --- | --- |
| POST `/auth/google`, `/register`, `/login`, `/forgot-password`, `/reset-password` | ✓ with required proof | ✓ | ✓ | ✓ | Identity/Google or reset-token validation, auth rate limit |
| POST `/auth/refresh`, `/logout` | ✓ with valid refresh token | ✓ with token | ✓ with own token | ✓ with token | Hash lookup, rotation/revocation, cookie Origin guard |
| POST `/auth/change-password`, PATCH `/auth/me`, POST `/auth/me/avatar` | 401 | ✓ self | ✓ self | ✓ self | `AuthorPolicy`/authenticated principal and own UserId |
| POST `/admin/users/{userId}/roles` | 401 | 403 | 403 | ✓ | `AdminOnly`; service prevents final-admin removal |
| POST `/categories`, PUT/DELETE `/categories/{id}` | 401 | 403 | 403 | ✓ | `AdminOnly` |
| POST `/recipes` | 401 | ✓ new own recipe | ✓ new own recipe | ✓ | `AuthorPolicy`; Application uses principal UserId |
| PUT `/recipes/{id}`, `/recipes/{id}/nutrition`; DELETE `/recipes/{id}` | 401 | ✓ | 403 | ✓ | `AuthorPolicy` plus Application/store owner check before commit |
| PATCH `/recipes/{id}/publish`, `/unpublish`, `/archive`, `/unarchive` | 401 | ✓ | 403 | ✓ | `AuthorPolicy` plus locked recipe owner check before commit |
| POST `/recipes/{recipeId}/images`; PATCH `/images/{imageId}/primary`; DELETE `/images/{imageId}` | 401 | ✓ | 403 | ✓ | `AuthorPolicy` plus handler/store owner check before object/DB write |
| POST/PUT/DELETE `/recipes/{recipeId}/ingredients[/{ingredientId}]`; PUT `/ingredients/reorder` | 401 | ✓ | 403 | ✓ | `AuthorPolicy` plus Application/store owner check before commit |
| POST/PUT/DELETE `/recipes/{recipeId}/steps[/{stepId}]`; PUT `/steps/reorder` | 401 | ✓ | 403 | ✓ | `AuthorPolicy` plus Application/store owner check before commit |

The automated route inventory guards against new mutation routes lacking authorization metadata. Domain tests for create/update/delete, lifecycle, steps, ingredients, image mutation and admin roles supply the owner/non-owner evidence; authorization is enforced server-side even if a client skips UI guards.

## Threat model and deployment checks

| Threat | Boundary and mitigation | Residual/operational check |
| --- | --- | --- |
| Credential guessing, weak stored passwords | Auth IP bucket, Identity lockout, PBKDF2 and password policy | Shared IPs can hit the auth bucket; monitor 429 and lockouts. |
| JWT forgery or stolen refresh token | HS256 key >=32 bytes from secrets, exact issuer/audience/lifetime validation, hashed refresh storage, rotation and reuse revocation | Rotate key and revoke refresh sessions after suspected key exposure. |
| CSRF on refresh/logout | Secure Lax cookie plus trusted Origin and Fetch Metadata checks | Keep allowed origins narrow; see ADR 0001. |
| Malicious upload, oversized body, traversal | Multipart parser cap, magic-byte/MIME validation, ownership before storage, GUID object keys | Image decoding runs in isolated bounded worker; MinIO bucket policy is read-only for public recipe objects. |
| Broken object authorization | Endpoint role policies and owner checks in command/store before save | Run permission tests when adding mutations. |
| Secret or personal data in logs/Git | Audit allowlist, safe sink, CI history scan, blank examples | Review new observability fields and scan rotated key exposure. |
| Downgrade, XSS, permissive cross-origin access | TLS 1.2+, redirect/HSTS, explicit CORS, CSP nonce and API deny policy | TLS termination and forwarded scheme are deployment settings; verify the public endpoint after deployment. |

## JWT signing key rotation

1. Generate a fresh random key of at least 32 bytes in the deployment secret manager. Never place it in a commit, issue, CI log or `.env.example`.
2. If compromise is possible, revoke active refresh sessions in the database (`UPDATE "RefreshTokens" SET "RevokedAt" = NOW() WHERE "RevokedAt" IS NULL`) and notify users to sign in again.
3. Update `Jwt__Key` consistently for every API replica, deploy together, and verify old access tokens fail while new login/refresh tokens validate. Do not retain the old signing key in production configuration.
4. Re-run CI Gitleaks and monitor auth failures, reuse alerts and audit logs. Rotate any other credential found in history at its issuer before documenting a false positive.

## Commands

`dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Security.Tests/CulinaryBlog.Security.Tests.csproj`, `dotnet test Culinary_Blog_Nhom5/tests/CulinaryBlog.Observability.Tests/CulinaryBlog.Observability.Tests.csproj --filter 'FullyQualifiedName~ProgramSecurityTests|FullyQualifiedName~RecipeApiConfigurationTests'`, and `gitleaks git --config .gitleaks.toml --redact --exit-code 1 .` provide the quick review gate. Full backend/frontend suites run in `.github/workflows/ci.yml` with PostgreSQL, Redis and MinIO.
