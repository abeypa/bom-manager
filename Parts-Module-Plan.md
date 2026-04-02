# Phase 2: Parts Module Architecture & Implementation

To make the `Parts` page 100% fully functional as the core center of BOM Manager, we must complete the following critical components:

## 1. The Dynamic Parts Form Modal (`PartFormModal.tsx`)
The biggest challenge is that different part categories have different columns in Supabase.
For example, `mechanical_manufacture` requires CAD file uploads and PDF drawings, whereas `pneumatic_bought_out` just requires basic specs and a datasheet.

**To-Do:**
- Build a generic React Hook Form that accepts the `activeTab` type to show/hide specific fields.
- Integrate validation using Zod or React Hook Form rules so required fields aren't missed.
- Fetch `suppliers` via the API so the "Supplier" dropdown lists real suppliers securely from the database.

## 2. File Upload Infrastructure (Supabase Storage)
For manufacturing parts, PDFs, CAD files, and preview images are essential.

**To-Do:**
- Wire up a drag-and-drop file uploader component in the modal.
- Connect this to the existing `storage.ts` API.
- Files must be securely uploaded to the `drawings` bucket inside folders structured by part category (e.g., `mechanical_manufacture/{part_id}/preview.png`).

## 3. CRUD API Mutations (React Query)
Currently, `parts.ts` only has `getParts` and `deletePart`. We need to handle create and update data flows safely.

**To-Do:**
- Write `createPart` and `updatePart` methods in `src/api/parts.ts`.
- Wrap them in `@tanstack/react-query`'s `useMutation`.
- On a successful save, call `queryClient.invalidateQueries(['parts'])` to make the table instantly update without requiring a browser refresh.

## 4. Polishing the Table
**To-Do:**
- Wire up the "Search" input bar to filter rows client-side.
- Make the "PDF" and "Download" buttons in the table securely fetch the Signed URL from Supabase Storage so users can download files directly from the browser.
- Add an elegant Confirmation Modal for the "Trash/Delete" button to prevent accidental clicks.

---

### Implementation Process:
If we proceed, I suggest we tackle this in three sub-steps:
1. **First**, we build the `Create Part` Modal and API logic (so we can generate test data from the UI).
2. **Second**, we hook up the `drawings` Supabase storage bucket file uploads into that modal.
3. **Third**, we implement the Edit/Delete actions in the table!
