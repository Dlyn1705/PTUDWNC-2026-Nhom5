# Backend contract for issues #81 and #93

All Admin endpoints require a Bearer token with the `Admin` role. A missing token
returns 401; an authenticated user without the role receives 403. Error bodies
use the API's Problem Details contract. No Identity entity is serialized.

## List users

`GET /api/v1/admin/users?page=1&pageSize=20&role=Admin`

- `page`: default 1, minimum 1.
- `pageSize`: default 20, allowed range 1–50.
- `role`: optional; exactly `Admin` or `Author`. Users with that role are included.
- Invalid values return 422; a non-numeric page or pageSize returns 400.
- Order: `createdAt` descending, then `id` ascending. An out-of-range page has an
  empty `data` array and retains the actual `meta.totalCount`.

Response 200:

```json
{
  "data": [
    {
      "id": "user-id",
      "email": "author@example.com",
      "displayName": "Author",
      "roles": ["Author"],
      "isActive": true,
      "createdAt": "2026-10-29T00:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Change role

`POST /api/v1/admin/users/{userId}/roles` with JSON `{"role":"Admin"}` or
`{"role":"Author"}`. Response 200 is `{ "data": <the same six-field user DTO> }`.
The operation is transactional. Self-demotion and removal of the last Admin
return 409 with codes `ADMIN_SELF_DEMOTION` and `ADMIN_LAST_ADMIN`. An unknown
user returns 404; an invalid role returns 422.

## Health

- `GET /health/live`: 200 while the HTTP process responds. No dependency probe.
- `GET /health/ready`: 200 only when PostgreSQL and Redis respond; otherwise
  503. MinIO is intentionally excluded from readiness.
- `GET /health`: checks PostgreSQL, Redis, and MinIO. Any unavailable dependency
  yields 503.

Health bodies contain only `status` (`Healthy` or `Unhealthy`), `timestamp`, and
the applicable `dependencies` statuses (`Ready` or `Unavailable`). Readiness
also includes `probe: "readiness"`; liveness has `probe: "liveness"` and no
dependencies. Responses have `Cache-Control: no-store`. Each dependency probe
has a two-second deadline. The body never contains exception text, hosts,
connection strings, or credentials.
