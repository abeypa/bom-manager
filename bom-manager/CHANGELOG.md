# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-04-23

### Added
- Manufacturer Part No (MPN) column to BOM HTML Export.
- PO Status and Delivery tracking to BOM HTML Export.
- Hover image preview in BOM Hierarchy view.
- Comprehensive `.gitignore` for professional development.
- `CONTRIBUTING.md` and initial `CHANGELOG.md`.

### Fixed
- "Master part not found" error when deleting orphan project parts.
- Foreign key constraint error when deleting parts linked to Draft POs.
- Automatic cleanup of Draft PO line items during part deletion.

### Changed
- Project structure reorganization (relocated migrations and scripts).
- Standardized file naming and folder hierarchy.
- Improved BOM table responsiveness and print styles.

## [2.x.x] - Pre-standardization
- Initial implementation of the V3 Cinematic design system.
- Supabase integration for parallel data loading.
- Project and Supplier management.
