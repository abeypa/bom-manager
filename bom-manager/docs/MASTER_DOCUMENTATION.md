# Master Documentation - Bep BOM Ecosystem

This document serves as the entry point for all technical and operational documentation for the Master BOM Manager (V3).

## 🏆 Project Overview
The Master BOM Manager is a centralized engineering registry designed to maintain a single source of truth for all components, projects, and procurement states within the Bep India ecosystem.

## 📚 Documentation Index

### 🚀 Getting Started
1. **[Quick Start Guide](../README.md)** - Basic setup and local development.
2. **[Production Setup](./PRODUCTION_SETUP.md)** - End-to-end production environment checklist.
3. **[Cloudflare Deployment](./DEPLOYMENT.md)** - How to use the automated deployment scripts.

### 🏗️ Technical Architecture
1. **[Project Structure](./PROJECT_STRUCTURE.md)** - Codebase organization and module mapping.
2. **[Database Schema](./SUPABASE_SETUP.md)** - Table definitions, RLS policies, and Relationships.
3. **[API Reference](./api.md)** - Overview of Supabase service wrappers.

### 🛠️ Maintenance & Administration
1. **[Admin Guide](./ADMIN_GUIDE.md)** - User management, roles, and security resets.
2. **[Storage Integration](./storage-integration-guide.md)** - Asset handling and path-based URL generation.
3. **[Database Snapshots](./DATABASE_SNAPSHOT.md)** - Historical schema changes and migration logs.

## 🛠️ Developer Resources
- **SQL Scripts:** Located in `sql/` - contains all table and function definitions.
- **Reference Materials:** Located in `reference/` - contains legacy documentation and backups.
- **Automation:** `deploy.ps1` in the root folder for CI/CD.

---

*Confidential - Property of Bep India Engineering.*
