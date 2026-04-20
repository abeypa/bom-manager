# Project Structure - Master BOM Manager

## 📂 Directory Map

```text
bom-manager/
├── docs/               # System documentation and manuals
├── public/             # Static assets (logos, icons)
├── scripts/            # Python/Bash utilities for dev management
├── sql/                # SQL scripts for database setup & migrations
├── src/                # Project source code
│   ├── api/            # Supabase API wrappers and logic
│   ├── components/     # Reusable UI components
│   ├── context/        # React Context providers (Auth, Toast)
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # External library initializations (Supabase)
│   ├── pages/          # Full page layouts
│   ├── types/          # TypeScript interface definitions
│   └── utils/          # Formatting and calculation helpers
├── .env.example        # Environment variable template
├── deploy.ps1          # Production deployment automation
└── wrangler.toml       # Cloudflare Workers configuration
```

## 🧩 Module Breakdown

### 1. API Architecture (`src/api/`)
- `auth.ts`: Authentication flows and session management.
- `admin.ts`: User management, roles, and password resets.
- `storage.ts`: File upload/download logic with signed URL generation.
- `parts.ts`: CRUD operations for the master part registry.
- `projects.ts`: Project and Project-Section management.

### 2. Component Organization (`src/components/`)
Components are grouped by the module they belong to:
- `layout/`: Navbar, Footer, AppLayout.
- `inventory/`: Stock tracking, movement logs.
- `parts/`: Part forms, search interfaces, asset viewers.
- `purchase-orders/`: PO generation, PDF viewing, payment tracking.
- `ui/`: Design system primitives (Modals, Toasts, Avatars).

### 3. Database Layer (`sql/`)
- `supabase-schema.sql`: The base schema for all tables.
- `admin_reset_password.sql`: RPC function for secure password resets.
- individual tables (e.g., `01_suppliers.sql`) for controlled schema versioning.
