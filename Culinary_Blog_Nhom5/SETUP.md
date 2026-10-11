# Local development setup

## Services

Start PostgreSQL and MailHog from the workspace root:

```powershell
docker compose up -d postgres mailhog
```

The API development configuration uses PostgreSQL on `127.0.0.1:5433` and MailHog SMTP on `127.0.0.1:1025`. Override `ConnectionStrings__DefaultConnection`, `Smtp__Host`, and `Jwt__Key` through .NET User Secrets or environment variables for your machine. Never put production credentials in `appsettings*.json`.

## API

From `Culinary_Blog_Nhom5`:

```powershell
dotnet restore
dotnet ef database update --project src/CulinaryBlog.Infrastructure --startup-project src/CulinaryBlog.API --context ApplicationDbContext -- --environment Development
dotnet run --project src/CulinaryBlog.API
```

The local API listens on `http://localhost:5156`. The OpenAPI document is at `/openapi/v1.json` and the Scalar UI is at `/scalar/v1` in Development. Routes use `/api/v1`; only registered versions are served. `Cors:AllowedOrigins` controls browser origins. The global IP limit is 300 requests/minute and the authentication endpoint group is limited to 5 requests/minute. Recipe mutation routes require the `Author` or `Admin` role and enforce recipe ownership; the Hangfire dashboard at `/hangfire` requires `Admin`.

The API needs a 32-byte-or-longer JWT signing key. For local development, set it without committing it:

```powershell
dotnet user-secrets init --project src/CulinaryBlog.API
dotnet user-secrets set "Jwt:Key" "replace-with-a-random-secret-of-at-least-32-bytes" --project src/CulinaryBlog.API
```

Welcome emails are sent through the configured SMTP service. Image resize jobs create medium and thumbnail WebP variants in the local uploads directory. Hangfire uses the configured PostgreSQL connection for durable job storage.

## Frontend

From `culinary-blog-web`:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Set `NEXT_PUBLIC_API_URL` and `API_INTERNAL_URL` to the API URL when it differs from `http://localhost:5156`. `npm run build` creates the production build; pages that fetch data during prerender need the API available.

## Build verification

```powershell
dotnet build Culinary_Blog_Nhom5.sln --no-restore
Push-Location culinary-blog-web
npm run build
Pop-Location
```
