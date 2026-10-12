# Continue on another PC (Windows, Git Bash)

Fictional data only. Prototype, not MOH-approved. Repo must stay PRIVATE.

## 1. Install once
- Git for Windows (includes Git Bash), Docker Desktop, .NET 10 SDK, Node 22.12 or later.
- `dotnet tool install --global dotnet-ef`
- `npm config set registry https://registry.npmjs.org/`
- Claude Code (desktop app or CLI), signed in.
- Optional design skills used in this project: `npx skills add https://github.com/Leonxlnx/taste-skill -g -a claude-code -y` and `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -g -a claude-code -y`.
- Optional: `npm install -g @playwright/cli@latest`.

## 2. Get the code
```bash
git clone https://github.com/onekchan/digital-buku-pink.git
cd digital-buku-pink
git config user.name "AmirulAfkarAzmi"
git config user.email "amirul.afkar@gmail.com"
git checkout s5-wip    # paused S5 work; use master for the last tested state (S1 to S4)
```
Sign in to GitHub as `onekchan` when asked. Never add AI co-author lines to commits (see CLAUDE.md).

## 3. Create db/.env (git-ignored, never commit)
`cp db/.env.example db/.env`, then set your own local dev values for: POSTGRES_OWNER_USER, POSTGRES_OWNER_PASSWORD, POSTGRES_DB, POSTGRES_PORT, APP_DB_PASSWORD, JWT_KEY (32+ chars), SEED_STAFF_PASSWORD, CODE_PEPPER (16+ chars), SEED_MOTHER_PASSWORD.

## 4. Database and API
```bash
docker compose -f db/docker-compose.yml up -d
CONFIRM_RESET=yes sh db/seed/reset.sh     # migrates and seeds; prints demo activation codes once
sh db/dev-api.sh                          # API on http://127.0.0.1:5080 (dev only)
dotnet test api/DigitalBukuPink.slnx      # new terminal; needs the container up
```

## 5. Staff web and mother app (separate terminals)
```bash
cd web    && npm install --legacy-peer-deps && npx playwright install chromium && npm start   # http://127.0.0.1:4200
cd mobile && npm install --legacy-peer-deps && npm start                                      # http://127.0.0.1:4300
```
Tests: `npm test` and `npm run e2e` in each folder (e2e needs the API running and a freshly reset DB). Mobile: `npm run check:prod`.

## 6. Resume with Claude Code
Open Claude Code in the repo folder and say: "resume S5". It reads CLAUDE.md and docs/work/status.md (the memory between sessions). On s5-wip the S5 code is untested: re-run all suites first, finish S5, then UX, privacy-security and architect reviews, then commit.

## Still open for the human
Native Bahasa Malaysia reviewer and date; approve FR-12 wording; approve audit actions activation_issue and activation_revoke in docs/source/04c; weekly-hours and hosting-cap lines in docs/work/status.md.
