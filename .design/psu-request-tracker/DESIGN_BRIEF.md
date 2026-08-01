# Design Brief: PSU Request Tracker — Visual Redesign

## Problem

Field staff across Nigeria's states file support requests (procurement, payments, IT, HR, logistics) into a system that currently looks like an unstyled internal tool — flat cards, a stock blue accent, system fonts, no dark mode. PSU admin staff live in the Admin view for long stretches triaging requests; the interface needs to feel precise and trustworthy, not decorative, and it needs to hold up under real use (long sessions, low light, dense tables) rather than just look fine in a first screenshot.

## Solution

A redesign that reads as an instrument, not a form: one functional accent color (WHO blue) reserved for actions and status, a strict spacing grid, precise alignment, and restraint everywhere else. Nothing added for decoration. Dark mode as a first-class mode, not an inversion filter.

## Experience Principles

1. **One accent, many neutrals** — color means something (action, status) or it doesn't appear. No decorative gradients, no rainbow of card colors.
2. **Grid over improvisation** — every spacing value comes from one 4px-based scale. Alignment is exact, not approximate.
3. **Legible under pressure** — the Admin table and detail drawer are used for extended triage sessions; clarity and low-fatigue contrast beat visual flourish.

## Aesthetic Direction

- **Philosophy**: Dieter Rams / Functionalist — "less but better."
- **Tone**: Calm, precise, institutional but not cold.
- **Reference points**: Braun/Apple-era product design restraint; instrument panels; USWDS-style government-service clarity.
- **Anti-references**: Marketing-site gradients, playful/bouncy motion, decorative icons, mixed accent colors.

## Existing Patterns (pre-redesign)

- Typography: system font stack (`'Inter', -apple-system, ...`) — generic, no distinct character.
- Colors: `WHO` (#0093D5), `WHO_DARK` (#005A8C), `INK`, `MUTE`, `LINE`, `PAPER` — hardcoded hex constants used directly in inline styles across ~30 components. No dark mode.
- Spacing: ad-hoc pixel values (11, 14, 16, 18, 22, 26...) with no shared scale.
- Components: `TopBar`, `Field`, `StatusPill`, `MultiSelectFilter`, `StatCard`, `Bar`, `Panel`, `DetailDrawer`, `Meta`, `Shell` — all inline-styled, no CSS file, no design tokens.

## Component Inventory

| Component | Status | Notes |
| --- | --- | --- |
| Color/spacing/type tokens | New | CSS custom properties, light + dark, referenced from JS constants via `var()` |
| Font loading | Modify | Replace system stack with IBM Plex Sans (UI/body) + IBM Plex Mono (reference IDs) |
| Dark mode toggle | New | Manual toggle in `TopBar`, `[data-theme]` + `prefers-color-scheme` support |
| `TopBar`, `SubmitView`, `DashView`, `AdminView`, `DetailDrawer` | Modify | Re-skinned to tokens, gradients removed, radii/shadows standardized |
| `StatusPill`, status/approval color maps | Modify | Routed through per-status CSS variables with dark-mode overrides |

## Key Interactions

- Dark mode toggle switches `data-theme` on the root element; all colors update via CSS variables with no per-component re-render logic needed.
- Existing filter/drawer/form interactions are unchanged — this is a visual system pass, not a functional rework.

## Responsive Behavior

Unchanged from current breakpoints (`.submit-grid`, `.stat-grid`, `.dash-grid` collapse under 860px). Verified via Playwright screenshots at 375/768/1280.

## Accessibility Requirements

- WCAG AA contrast (4.5:1 body, 3:1 large text) in both light and dark palettes.
- Visible, consistent focus rings using `--color-border-focus`.
- `prefers-reduced-motion` respected for the (minimal) transitions that exist.

## Out of Scope

No new features, no navigation/IA changes, no changes to data model or business logic. Pure visual system redesign of the existing three views.
