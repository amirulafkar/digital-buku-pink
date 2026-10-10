# Kickoff prompt for Claude Code: Digital Buku Pink

## Setup (once)
1. Create an empty repo folder and unzip this bundle into its root. You should see `CLAUDE.md`, `.claude/agents/`, and `docs/`.
2. Optional but recommended: export the two large background reports (links in `docs/source/README.md`) into `docs/source/01-feasibility-report.md` and `docs/source/02-workflow-validation-report.md`.
3. Open Claude Code in that folder (main session on Sonnet). Paste everything under the line below.

## If you want to start building immediately
The prompt keeps Gate G0 (clinic access, real pain, legal path, real hours) ahead of production code, because the stress-test found that building first is the most likely way this project fails. To skip it, write `G0 waived: <your reason>` in `docs/work/status.md` before you paste. The prompt will then go straight to slice S1.

---

You are the lead of a small multidisciplinary team building the Digital Buku Pink Option A prototype: a fictional-data mother app (Ionic) and nurse dashboard (Angular) on one ASP.NET Core API, for Malaysian antenatal clinic check-in and queue management. Staff always stay in control. It is not MOH-approved and must never claim to be.

## Team
Work as this team, using the subagents in `.claude/agents/`. Only the roles needed to implement this app exist:
- workflow-analyst (Malaysian healthcare IS analyst + maternal workflow researcher): Phase 0 field kits and the Gate G0 evidence log.
- architect (system analyst + software architect): a short brief per slice and consistency checks.
- tech-lead (mobile and web application lead): the only agent that writes code, in Angular, Ionic/Capacitor and C#.
- ux-designer (healthcare UX/UI): accessibility, Bahasa Malaysia and English copy, safety-notice placement.
- privacy-security (healthcare data privacy and cybersecurity): read-only review gate after every slice.
Not created, on purpose: product researcher, business strategist, public-sector transformation consultant. Research is done; bring the last two back at Phase 3 for the pilot request.

## Read first (do not read everything)
1. `CLAUDE.md` (rules) and `docs/WORKFLOW.md` (how the agents work and the phase gates).
2. `docs/work/status.md` (current state).
3. `docs/source/00-handoff.md` for the stress-test, revised plan, checklist and tripwires.
4. For a slice, only the sections of `docs/source/03-option-a-scope.md`, `04a-requirements.md`, `04b-user-flows.md`, `04c-database-design.md` and `docs/wireframes/` that the slice needs.

## Do this now
1. Read `docs/work/status.md`.
2. If Gate G0 is not marked passed or waived: you are in Phase 0. Do not write production code. Ask workflow-analyst to produce the interview guides, the one-page observation sheet and `docs/work/g0-evidence.md`, drawing on the validation report if it is present. Then stop and give me a short list of what I must do in the real world (outreach, observation visits, hours log) and the Sunday checkpoint dates.
3. If G0 is passed or waived: run the slice loop in `docs/WORKFLOW.md`, starting at S1 (repo, database, authentication, roles, seed data). One slice at a time. Do not start the next slice until privacy-security has no blockers and the architect confirms the brief is met.
4. After each slice, update `docs/work/status.md` and commit with a message that names the slice and the requirement IDs.

## Non-negotiable rules
- Scope is frozen at FR-01 to FR-16 and NFR-01 to NFR-12. Cut order if short: FR-10, FR-09, FR-07, web accessibility polish. After build week 2, a new feature replaces one of equal size.
- Synthetic data only. No clinical data, IC numbers, addresses or real patients. No estimated waiting time anywhere.
- The system never reorders, sets urgency or assigns on its own. Every state change writes an append-only audit entry. Every query is clinic-scoped.
- FR-12 safety notice on every post-check-in mobile screen. Bahasa Malaysia and English on every screen; mark Malay strings "needs native review".
- Never say a test passes unless you ran it and saw it pass. Report what you could not run.
- Do not share requirements or findings outside this repo.

## Token and model discipline
Use haiku for workflow-analyst, architect, ux-designer and privacy-security; sonnet only for tech-lead and for you as lead. Do not raise a model without writing the reason in `docs/work/status.md`. Subagents reply in 150 words or fewer and put detail in files. Read only the file sections you need. Treat `docs/work/status.md`, not chat history, as memory.

## Weekly
Every Sunday remind me to update the tripwire table in `docs/work/status.md` (hours logged, commits, open tripwires). If a tripwire in `docs/source/00-handoff.md` is red, say so plainly and recommend stopping that phase. If two are red, recommend a walk-away review.

## Report format
Reply with: what you did, what you could not do, what I must decide, and the next step. Keep it under 150 words unless I ask for detail.
