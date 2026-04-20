# Design System Strategy: Cinematic Precision

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

This system is built on the philosophy of controlled drama. It rejects the cluttered, "dashboard-style" density of modern SaaS in favor of a cinematic, editorial experience. We achieve this through a binary rhythm: high-contrast shifts between vast expanses of pure black (`#000000`) and soft light gray (`#f5f5f7`). 

The goal is to make every product shot and every line of copy feel like a gallery installation. We break the "template" look by using extreme whitespace—treating the screen not as a container to be filled, but as a stage where white space serves as the primary compositional tool.

## 2. Colors & Surface Philosophy
The palette is intentionally restricted to create a premium, authoritative atmosphere. The chromatic "Apple Blue" is reserved strictly for movement and intent.

### The "No-Line" Rule
Explicitly prohibit 1px solid borders for sectioning or containment. Structural boundaries are defined solely through:
- **Hard Value Shifts:** Transitioning from `surface` (#131313) to `surface-container-low` (#1b1b1b).
- **Negative Space:** Using generous margins to imply grouping.
- **Glass Boundaries:** Using `backdrop-filter: blur()` to create a perceived edge without a physical line.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers of glass and light.
- **Background (`#131313`):** The infinite void. Used for high-drama hero sections.
- **Surface-Container Tiers:** Use `surface-container-lowest` (#0e0e0e) for recessed areas and `surface-container-highest` (#353535) for elevated interactive cards. 
- **Nesting:** To highlight a feature, nest a `surface-container-low` card inside a `surface` section. The subtle tonal shift creates a "soft lift" that feels integrated, not "pasted on."

### The "Glass & Gradient" Rule
Floating elements, specifically navigation bars and dropdowns, must utilize glassmorphism. Use `rgba(0,0,0,0.8)` with a `20px` backdrop blur. For primary CTAs, apply a subtle gradient from `primary` (#abc7ff) to `primary-container` (#0071e3) to give the pill-shape a slight three-dimensional "soul."

## 3. Typography
Typography is the voice of this system. We use "Inter" as our digital-first surrogate for SF Pro, focused on optical sizing and aggressive leading.

- **Display & Headline (Inter, 2.25rem+):** These are the "Hero" voices. They must use a tight line-height of `1.07` to `1.14` and a negative letter-spacing of `-0.02em`. This creates a dense, "locked" visual block that feels like high-end print.
- **Body (Inter, 0.875rem - 1.125rem):** Set with a more relaxed line-height (`1.47`) for readability. Always use the `secondary` color (#c6c6c8) for body text on dark backgrounds to reduce ocular strain and maintain the hierarchy.
- **Labels:** Use `label-md` (0.75rem) in all caps with slightly increased tracking (+0.05em) for secondary metadata only.

## 4. Elevation & Depth
In this system, depth is a function of light and translucency, not shadow.

- **The Layering Principle:** Stacking surface tokens is the primary method of elevation. A `surface-container-high` element sitting on a `surface-dim` background provides all the hierarchy needed.
- **Ambient Shadows:** Shadows are rare. When used (e.g., for a modal), they must be extra-diffused: `box-shadow: 0 20px 40px rgba(0,0,0,0.12)`.
- **The "Ghost Border" Fallback:** If a container requires definition against a complex background, use a `1px` border of `outline-variant` at `15%` opacity. Never use a 100% opaque border.
- **Glassmorphism:** Navigation menus must be `surface-container-lowest` at `80%` opacity with a heavy blur. This ensures the content "bleeds" through the UI, maintaining the cinematic pacing of the scroll.

## 5. Components

### Buttons & CTAs
- **Primary:** Full pill-shape (`9999px` radius). Background: `primary-container` (#0071e3). Text: `on-primary` (#002f66).
- **Secondary:** Transparent background with a `Ghost Border`.
- **Interaction:** On hover, the primary button should scale slightly (1.02x) rather than changing color dramatically.

### Cards
- **Construction:** Use `surface-container-low` with a `2rem` (lg) corner radius.
- **Layout:** Forbid the use of dividers. Use `2.5rem` of internal padding to separate header, body, and footer content.

### Input Fields
- **Styling:** Minimalist. A simple `surface-container-highest` background with a `1.5rem` radius. 
- **States:** The "Apple Blue" (`primary-container`) should only appear as a 2px focus ring to indicate active intent.

### Navigation Bar
- **Design:** Full-width, `48px` height, translucent dark glass.
- **Links:** `title-sm` typography, centered, using `secondary` color, shifting to `on-surface` on hover.

## 6. Do's and Don'ts

### Do:
- **Do** use "Optical Centering." Sometimes a mathematical center looks lower than it should; trust your eye to lift elements slightly.
- **Do** embrace the "Empty Space." If a section only has one sentence, let it sit in the center of a 100vh block.
- **Do** use high-quality product imagery with the background color matched exactly to the `surface` or `background` token.

### Don't:
- **Don't** use lines to separate list items. Use `1.5rem` of vertical whitespace instead.
- **Don't** use pure white text (#FFFFFF) on pure black. Use `on-surface` (#e2e2e2) to avoid "vibrating" edges.
- **Don't** use standard "drop shadows" on cards. If a card doesn't pop, increase the contrast between the two surface tokens instead.