# BEP BOM Manager V3 (Cinematic)

A high-performance, professional Bill of Materials (BOM) & Procurement management system built for BEP India. Features a "Cinematic" UI design with real-time Supabase integration.

![BOM Manager Dashboard](https://raw.githubusercontent.com/abeypa/bom-manager/master/public/screenshot.png) *(Placeholder URL)*

## 🚀 Key Features

- **Full BOM Lifecycle**: Manage sections, subsections, and multi-category parts (Mechanical, Electrical, Pneumatic).
- **Pro Procurement**: Track Purchase Orders (PO), delivery status, and receiving workflows.
- **Cinematic UI**: Modern design with glassmorphism, hover previews, and interactive tree views.
- **Reporting**: Professional HTML/PDF exports with MPN and delivery tracking.
- **Scalable Backend**: Powered by Supabase with parallel polymorphic data fetching.

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS, Lucide React
- **State Management**: React Query (TanStack), Zustand
- **Backend & DB**: Supabase (PostgreSQL, Auth, Storage)
- **Deployment**: Cloudflare Pages / Wrangler

## 📂 Project Structure

```text
├── docs/               # System documentation & archive
├── public/             # Static assets & Excel templates
├── scripts/            # Deployment and maintenance scripts
├── sql/                # DB Schema and Migrations
└── src/
    ├── api/           # Domain-driven API service layer
    ├── components/    # Reusable UI components (Atomic design)
    ├── context/       # React Context providers (Auth, Toast)
    ├── hooks/         # Custom reusable React hooks
    ├── lib/           # Third-party library configurations
    ├── pages/         # Route-level view components
    ├── store/         # Global state management
    ├── types/         # TypeScript interfaces & Database types
    └── utils/         # Pure helper functions
```

## 🛠 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1.  **Clone the Repo**
    ```bash
    git clone https://github.com/abeypa/bom-manager.git
    cd bom-manager
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file from the example:
    ```bash
    cp .env.example .env
    ```
    Enter your Supabase URL and Anon Key.

4.  **Run Locally**
    ```bash
    npm run dev
    ```

## 📜 Available Scripts

- `npm run dev`: Start local development server.
- `npm run build`: Build production bundle.
- `npm run lint`: Run ESLint check.
- `npm run preview`: Preview production build locally.

---

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

Internal Project - All Rights Reserved by BEP India.
