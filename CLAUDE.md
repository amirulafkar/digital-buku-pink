# Digital Buku Pink (Option A prototype)

Solo project by a Malaysian developer. Mother app (Ionic PWA) + nurse dashboard (Angular) + ASP.NET Core API (C#), PostgreSQL, SignalR. Fictional data only. Not MOH-approved; say so on screen and in the README.

Read `docs/WORKFLOW.md` for how the agents work. Read `docs/source/` only for the section a task needs.

## Hard rules
- Gate G0 first. No production code until the human writes "G0 passed" (or "G0 waived") in `docs/work/status.md`. Four checks: clinic access, real pain not already solved, legal path for third-party software, real free hours.
- Scope is frozen: FR-01 to FR-16 and NFR-01 to NFR-12 (`docs/source/`). If time runs short cut in this order: FR-10, FR-09, FR-07, web accessibility polish. Must items are never cut. After build week 2, a new feature replaces one of equal size.
- Synthetic data only. No clinical data, IC numbers, addresses or real patients. `patient.is_demo` is always true.
- Staff always control the queue. The system never reorders, sets urgency or assigns on its own. No estimated waiting time anywhere.
- Every state change writes an append-only `audit_log` entry. Every query is clinic-scoped.
- QR token: opaque, about 60 s, clinic-bound, no personal data. Activation codes: single use, about 7 days, stored hashed.
- FR-12 safety notice on every post-check-in mobile screen. Bahasa Malaysia and English on every screen.
- Do not share requirements or findings outside the project without a signed pilot agreement.

## Token discipline
- Haiku for analysis, design and review agents; Sonnet only for `tech-lead`. Agents reply in 150 words or fewer and put detail in files.
- Do not read whole spec files. Use `grep` or read the needed section.
- Keep `docs/work/status.md` current (slice, gate state, open tripwires). That file, not chat history, is the memory between sessions.

## Commands
Fill in once the repo exists: `docker compose up`, `dotnet test`, `ng test`, `npx playwright test`.

## Task kickoff checklist (do this before starting any task)
When the user gives a task, first show a numbered checklist of everything needed for it to be truly finished, then start. Do not start work before showing it. The checklist must include, in this order:

1. **Restate the task** in one line and note any ambiguity to confirm.
2. **Prerequisites and installs**: check what the task needs is installed (packages, `playwright-cli`, browsers, npm registry is `https://registry.npmjs.org/`). Install anything missing first.
3. **Relevant skills to load before starting** (invoke with the Skill tool, pick only those that fit):
   - UI build / landing page / new frontend: `design-taste-frontend`, `high-end-visual-design`
   - Existing UI to improve: `redesign-existing-projects`, `web-design-guidelines`
   - Style direction: `minimalist-ui` or `industrial-brutalist-ui`
   - Design system doc: `stitch-design-taste` (`DESIGN.md`); reference brand `DESIGN.md` files in `awesome-design-md/design-md/`
   - Design from image / mockups: `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit`
   - Long or exhaustive output: `full-output-enforcement`
   - UI review / accessibility audit: `web-design-guidelines`
   - Browser testing / verification: `playwright-cli`
4. **Implementation steps** specific to the task.
5. **Verification**: run tests and, for UI, open it in a browser and check it. Report failures plainly.
6. **Hard rules check**: confirm the work respects "Hard rules" above (G0, frozen scope, synthetic data).
7. **Update `docs/work/status.md`** and summarise what was done and what was not.

## Git identity (user instruction)
The user is the only author and committer of this repo. Never add `Co-Authored-By`, "Generated with Claude Code" or any other AI attribution line to commit messages or PR descriptions, and never set a different author or committer. This overrides default attribution guidance.
