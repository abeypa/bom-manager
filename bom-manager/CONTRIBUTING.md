# Contributing to BOM Manager

Thank you for your interest in contributing to the BEP BOM Manager! We welcome contributions that improve the codebase, documentation, or user experience.

## Getting Started

1.  **Fork the repository** (if you are an external contributor).
2.  **Clone the project**:
    ```bash
    git clone https://github.com/abeypa/bom-manager.git
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Set up environment variables**:
    Copy `.env.example` to `.env` and fill in your Supabase credentials.

## Development Workflow

### Branch Naming
- `feature/description` for new features
- `fix/description` for bug fixes
- `refactor/description` for code improvements
- `chore/description` for maintenance/docs

### Commits
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting/styling changes
- `refactor:` for code restructuring
- `chore:` for build tasks/maintenance

### Coding Standards
- Use **TypeScript** for all logic.
- Follow **React best practices** (Functional components, Hooks).
- Use **Tailwind CSS** for styling.
- Keep components focused and reusable.
- Add JSDoc comments to public API functions and complex logic.

## Pull Request Process

1.  Create a separate branch for your work.
2.  Ensure your code passes linting and builds successfully (`npm run build`).
3.  Write a clear description of the changes in the PR.
4.  Tag relevant issues if applicable.

## Questions?
Reach out to the lead developers or open a "Discussion" or "Issue" on GitHub.
