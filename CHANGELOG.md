# Changelog

All notable changes are documented here following Keep a Changelog. Releases use Semantic Versioning. The Unreleased section does not imply a release has been published.

## [Unreleased]

### Added

- Requirement inventory, owner/evidence traceability and endpoint test inventory for NFR-MAINT (#89).
- Clean Architecture/CQRS regression tests, Application coverage collection and fail-closed coverage gate.
- Sonar safety analysis, EditorConfig and Prettier formatting regression baseline.
- PR template requiring requirement/test evidence and reviewer approval.
- Five critical API journeys with real JWT/PostgreSQL and explicit contract boundaries for external-provider tests.

### Fixed

- Latest EF migration target model now includes existing recipe slug history metadata; the synchronization migration does not issue schema DDL.

### Known limitations

- See ADR-0001 for existing Domain package dependencies, owner acceptance, UI E2E scope and review-protection requirements. Unit coverage is measured separately and passes the recorded baseline.
