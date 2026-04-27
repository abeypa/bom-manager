# Pending Parts & Sticky Scroll Tracker

## Phase 1: Planning (Completed)
- Analyzed `ProjectDetails.tsx`, `BOMTreeView.tsx`, and database schema approach.
- Planned the UI layout changes for sticky header and scroll container.
- Structured the `pending_parts` and `pending_part_comments` tables.
- Planned API endpoints and Supabase integration.

## Phase 2 & 3: Database & Backend (In Progress)
- [x] Create SQL Migration (`sql/migrations/20260427_add_pending_parts.sql`)
- [x] Create API definitions (`src/api/pending-parts.ts`)
- [ ] Apply migration to local/prod Supabase

## Phase 4: UI implementation (Pending)
- [ ] Modify `ProjectDetails.tsx` to handle layout changes (Sticky Header + Scroll area).
- [ ] Implement `FastScrollSlider` side-scroller component.
- [ ] Add "Pending Parts" to existing `tab-bar`.
- [ ] Build `PendingPartsTab`, `PendingPartCard`, and `PendingPartFormModal` components.
- [ ] Build `DiscussionThread` component for threaded comments.
- [ ] integrate Admin "Approve" / "Reject" logic.
- [ ] UI/UX Polish (match existing project styling, colors, empty states).
