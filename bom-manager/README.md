# Master BOM Manager (Registry v3)

A professional-grade engineering BOM (Bill of Materials) Management system. Designed for precision part registration, real-time inventory tracking, and seamless engineering asset management.

## 🌟 Core Modules

- **Master Registry:** Unified database for Mechanical, Electrical, and Pneumatic components.
- **Inventory Management:** Full stock in/out tracking with detailed audit logs.
- **Project Control:** Build and track project-specific BOMs with cost estimations.
- **Asset Integration:** Integrated image paste, CAD file (.STEP) storage, and PDF drawings.
- **Admin Command Center:** robust user management, role-based access, and system diagnostics.

## 🛠️ Performance Architecture

- **Engine:** Vite + React 18 + TypeScript 5
- **Intelligence:** Supabase Postgres + RLS Security
- **Assets:** Supabase Unified Storage (One Bucket Model)
- **Deployment:** Cloudflare Workers (High-availability CDN distribution)

## 📁 Documentation Hub

Detailed guides are located in the `docs/` directory:

| Document | Purpose |
| :--- | :--- |
| **[PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)** | Directory maps and codebase overview |
| **[SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md)** | Database, RLS, and Auth configuration |
| **[PRODUCTION_SETUP.md](./docs/PRODUCTION_SETUP.md)** | Full production deployment walkthrough |
| **[ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md)** | User management and security maintenance |
| **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | Cloudflare Workers deployment instructions |

---

## ⚡ Quick Start

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Dependency Setup
```bash
npm install
```

### 3. Launch Development
```bash
npm run dev
```

## 🚀 Production Pipeline
The project uses a custom automation script for Cloudflare deployment:
```powershell
./deploy.ps1 "commit message"
```

---

*Maintained as the core engineering registry for the Bep India ecosystem.*
