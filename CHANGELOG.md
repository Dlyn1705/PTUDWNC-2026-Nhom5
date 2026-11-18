# Changelog

All notable changes are documented here following Keep a Changelog. Releases use Semantic Versioning. The Unreleased section does not imply a release has been published.

## [Unreleased]

### Added

- Requirement inventory, owner/evidence traceability and endpoint test inventory for NFR-MAINT (#89).
- Clean Architecture/CQRS regression tests, Application coverage collection and fail-closed coverage gate.
- Sonar safety analysis, EditorConfig and Prettier formatting regression baseline.
- PR template requiring requirement/test evidence and reviewer approval.
- Five critical API journeys with real JWT/PostgreSQL and explicit contract boundaries for external-provider tests.
- Reproducible performance, accessibility/cross-browser, cache recovery and encrypted backup/restore verification tooling for HT-07 through HT-10.
- ADRs for scoped Domain dependencies, public cache services and the amended sitemap/cookie acceptance baseline.

### Fixed

- Latest EF migration target model now includes existing recipe slug history metadata; the synchronization migration does not issue schema DDL.
- Admin Minimal API endpoints now bind MediatR `ISender` explicitly as a service, so OpenAPI and production hosts can build their endpoint graph.
- The current specification now separates the September baseline from current behavior and aligns cache TTLs, publish rules, CQRS semantics, Category cardinality, slow-request thresholds and refresh-cookie security wording with the implementation.

### Known limitations

- See ADR-0001 for existing Domain package dependencies, owner acceptance, UI E2E scope and review-protection requirements. Unit coverage is measured separately and passes the recorded baseline.
- Production-provider acceptance (Google OAuth/SMTP), manual NVDA/VoiceOver review and a full 99.5% uptime observation require the designated acceptance environment and are not inferred from local automated tests.
