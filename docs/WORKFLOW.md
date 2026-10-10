# Workflow: how the agents work together

The main Claude Code session is the lead. Subagents cannot call each other, so the lead runs each step and passes files, not chat, between agents. Every handoff is a file in `docs/work/`.

## Agents (only those needed to implement Option A)

| Agent | Model | Role | Writes |
| --- | --- | --- | --- |
| workflow-analyst | haiku | Phase 0 field kits and Gate G0 evidence | `docs/work/g0-evidence.md`, kits |
| architect | haiku | Per-slice implementation brief; spec consistency | `docs/work/brief-<slice>.md` |
| tech-lead | sonnet | The only code writer: Angular, Ionic, C# | application code, tests |
| ux-designer | haiku | Accessibility, BM/EN strings, safety-notice placement | i18n strings, template/CSS notes |
| privacy-security | haiku | Read-only gate after every slice | review in reply |

Not created, on purpose: Senior Product Researcher (research is done, see the feasibility and validation reports); Digital Health Business Strategist and Public Healthcare Digital Transformation Consultant (not needed to build; bring back at Phase 3 to prepare the pilot request); Malaysian Healthcare Information Systems Analyst and Maternal Workflow Researcher (merged into workflow-analyst, active in Phase 0 only).

## Phases and gates

| Phase | Weeks (week 1 = Mon 12 Oct 2026) | Who | Exit |
| --- | --- | --- | --- |
| 0 Access and validation | W1 to W3 | human does outreach; workflow-analyst builds kits and logs evidence | Gate G0 on Mon 2 Nov |
| 1 Thin build | W4 to W9 | lead runs the slice loop below | Every Must item done by Sun 13 Dec, or stop |
| 2 Evidence | W10 to W14 | human runs timed walkthroughs; workflow-analyst logs | 3+ nurses timed, 1 written statement |
| 3 Pilot request | W15 to W20 | human submits through the channel found in Phase 0 | written acknowledgement within 3 weeks |
| 4 Pilot or decision | W21 to W26 | human | written stop-or-pivot decision |

Gate G0 passes only if all four hold; see `docs/source/00-handoff.md` section "Pre-launch checklist". The human decides; no agent marks G0 passed.

## Slice loop (Phase 1)

Slices, in order: S1 repo, database, auth, roles, seed data. S2 check-in, QR token, queue endpoints, audit log. S3 Angular queue board, assignment, search, activation codes. S4 Ionic app: activation, scan, status, notifications. S5 SignalR, offline states, Bahasa Malaysia, accessibility. S6 tests, demo script, README, freeze.

For each slice:
1. architect writes `docs/work/brief-<slice>.md`.
2. tech-lead implements and runs the tests; reports actual results.
3. ux-designer reviews screens (S3 to S5 only) against `docs/wireframes/`.
4. privacy-security reviews the diff. A blocker returns to step 2.
5. architect checks the slice against the brief. Gaps return to step 2.
6. Lead updates `docs/work/status.md` and commits.

## Weekly (every Sunday)
Update the tripwire table in `docs/work/status.md`: hours logged, commits, open tripwires. One red: stop that phase and rerun the matching check. Two reds: walk-away review that day. The dated tripwires are in `docs/source/00-handoff.md`.

## Token rules
- Default to haiku; only tech-lead uses sonnet. Do not raise a model without a reason written in `status.md`.
- Each agent reads only the sections it needs and replies in 150 words or fewer.
- Briefs are 60 lines maximum. Findings cite file, line and requirement ID.
