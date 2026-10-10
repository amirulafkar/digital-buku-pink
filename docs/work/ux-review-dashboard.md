# UX review: proposed dashboard layout (docs/work/preview)
Reviewer: ux-designer agent. Lead triage notes in brackets. Preview is static English HTML, so items 1, 3, 5, 6 are preview gaps that the real app must keep meeting.

## MUST FIX (apply in implementation)
1. BM on every string, marked "needs native review" (NFR-08). [Already true in app; keep for all new strings.]
2. Search field and toggles need a 1px border at 3:1 or more, not shadow alone (WCAG 1.4.11).
3. Visible focus ring: 2px berry focus-visible outline (2.4.7). [Already in app; keep.]
4. Call, Complete and tabs at least 44px tall (NFR-07).
5. Accessible names, e.g. "Call A001, Siti"; theme toggle named (NFR-07).
6. EN/BM state via aria-pressed, not colour only.
7. MOH notice stays visible at every width (footer when sidebar collapses) (NFR-08).
8. Include the "Missed" status on the board (FR-05).
9. Below about 1100px stack the panels so rows do not overflow; collapse the sidebar to a top bar.

## SHOULD FIX
10. Hourglass icon implies waiting time: use a neutral icon for Waiting.
11. Label every column; no unlabelled "Not set" (Room, Nurse).
12. Rows must be in check-in order, as the caption says.
13. Counts must agree (tabs sum equals All). [Mockup data error.]
14. Drop the greeting card; keep a compact summary strip that doubles as filters (tiles duplicate tab counts).
15. Rooms panel is read-only status. No auto-assignment; the nurse picks the room.
16. Chips and notice text at least 14px.

## NICE
- Remove the duplicate "Check in walk-in" (top bar and Quick actions): keep one.
- Define the dark theme for the new layout.
- Use one word for the finished state across tab, tile and action (Done).
