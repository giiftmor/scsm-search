# Changelog

## [Unreleased]

### Added
- 2026-08-12: Ticket filters and relevance — `tier` (exact match) and `location` (substring, LIKE-escaped) filter params on `GET /v1/search/tickets`, plus a `sort` param (`relevance` | `newest` | `az`, default `relevance`). Relevance ranking (FTS mode) prioritizes phrase and title matches and is selected by default; `az` orders by title, `newest` by created date. Free-text `q` now uses word-based AND matching across title, description, WorkItemId, tier, and location.
- 2026-08-12: `GET /v1/meta/filters` endpoint (API-key protected) — returns distinct `tiers` and `statuses` (nulls excluded, A–Z) across Incidents and Service Requests, for building filter dropdowns.

