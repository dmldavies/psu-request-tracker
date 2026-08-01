# Design Review: PSU Request Tracker — Visual Redesign

Reviewed against: DESIGN_BRIEF.md
Philosophy: Dieter Rams / Functionalist
Date: 2026-08-01

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `review-dash-desktop-1280.png` / `-dark-mode-desktop-1280.png` | Desktop (1280×900) | Dashboard, light + dark |
| `review-dash-tablet-768.png`, `review-dash-mobile-375.png` (+ dark variants) | Tablet / Mobile | Dashboard responsive |
| `review-submit-desktop-1280.png` / `-dark-mode-desktop-1280.png` | Desktop | Submit form, light + dark |
| `review-submit-tablet-768.png`, `review-submit-mobile-375.png` (+ dark variants) | Tablet / Mobile | Submit form responsive |
| `review-admin-desktop-1280.png` / `-dark-mode-desktop-1280.png` | Desktop | Admin table, light + dark |
| `review-admin-tablet-768.png`, `review-admin-mobile-375.png` (+ dark variants) | Tablet / Mobile | Admin table responsive |
| `review-admin-detail-drawer.png` / `-dark-mode.png` | Desktop | Detail drawer open, light + dark |

> All screenshots are in `.design/psu-request-tracker/screenshots/`, captured with `capture-screenshots.mjs` via `@playwright/test`.

## Summary

The redesign lands the Rams direction cleanly: one accent color, a real spacing/radius/shadow token system, IBM Plex replacing the generic system font stack, and a genuine (non-inverted) dark mode. The first screenshot pass caught two real, pre-existing mobile bugs — the header nav and the Admin table both broke at 375px — which have been fixed and re-verified. Remaining findings are polish, not defects.

## Must Fix

_(Both found during screenshot capture and fixed before this report — logged here for the record, per the review process.)_

1. **Header nav wrapped mid-word at 375px, overlapping the logo/title block.** See originally-captured `review-submit-mobile-375.png` (pre-fix). _Fix applied:_ header now wraps to two rows below 640px (`topbar-row` class), subtitle hides, nav becomes a full-width 3-up segmented control. Re-verified in the current `review-submit-mobile-375.png`.
2. **Admin table columns overlapped illegibly at 375px** (Ref/State/Requester/Cluster/Status all compressed into the same visual space; e.g. "REQUESTREQUEST" header collision). See originally-captured `review-admin-mobile-375.png` (pre-fix). _Fix applied:_ `admin-row` class collapses to a 2-column (Request / Status) layout below 640px, folding requester into the request subtitle; full detail remains one tap away via the drawer. Re-verified in the current `review-admin-mobile-375.png`.

## Should Fix

1. **Uneven panel heights on Dashboard and Submit.** "By cluster" (`review-dash-desktop-1280.png`) and "How it works" (`review-submit-desktop-1280.png`) both leave a large block of empty space at the bottom of their column because the adjacent panel is taller. Rams tolerates negative space, but this reads as an unfinished layout rather than intentional restraint. _Fix:_ either let short panels size to content and stack a second card below them, or cap the tall panel's height with internal scroll.
2. **`STATUS_META` and `SLA_CATALOG` still key off exact display strings** (e.g. `"On Hold"`) rather than stable ids — unrelated to the visual system, but worth a note since the redesign touched every call site that reads these maps.

## Could Improve

1. **Dark mode WHO logo** sits on a navy badge that's close in value to the dark theme's card background — legible but low separation. A 1px `border: var(--color-border-primary)` ring around the logo would restore definition without adding a shadow.
2. **Focus rings** now use `--shadow-focus` consistently, but the Admin status-chip buttons and the CSV/Reset buttons don't get a visible `:focus-visible` outline distinct from hover — fine with a mouse, worth a pass if keyboard-only triage becomes a real usage pattern.
3. The `MultiSelectFilter` dropdown and `StatusPill` dot indicators still use literal pixel radii (`4px`, `10px`) instead of `--radius-*` tokens — cosmetic inconsistency, not visible to users.

## What Works Well

- **Single accent, everywhere.** WHO blue is the only hue that isn't status-semantic or neutral — the two decorative gradients (Submit sidebar panel, dashboard state-volume bars) were replaced with flat fills, and it reads noticeably calmer for it.
- **Dark mode is a real palette, not an inversion** — desaturated status fills, a lightened accent for AA contrast, and darker/more-transparent shadows all switch correctly via `[data-theme]`, verified across all three views.
- **Monospace on reference IDs** (Ref column, drawer header, confirmation screen) is a small, correct detail for an ops tool — it reads as an identifier, not a sentence, and ties nicely to the "instrument panel" reference in the brief.
- **The review process caught real bugs.** Two genuine mobile-breaking issues were found by actually looking at screenshots rather than trusting the code — exactly what this step is for.
