# Job Apply Assistant

Job Apply Assistant is a click-to-assist browser extension and local companion API for filling job application forms with user-reviewed suggestions.

The goal is to help applicants move through multi-page ATS forms without building an auto-apply bot. The extension scans visible fields only after the user clicks it, sends normalized field metadata to the local API, shows suggested values, and fills only the fields the user selects.

## What It Does

- Scans visible fields on the current application page after a user click.
- Matches fields against saved profile data, answer-bank items, and pasted AI context.
- Supports multi-page application sessions with page snapshots and filled-field logs.
- Shows confidence and source context for suggestions.
- Requires user review before filling anything.
- Uses a single **Confirm & fill selected** action. Generated drafts start unchecked, and complete autofill is intentionally deferred.
- Supports DeepSeek as the intended remote AI provider, with optional OpenAI, Ollama, mock, and no-AI modes.
- Includes a lightweight local UI for pasting general AI context about yourself.
- Provides a collapsible browser extension side panel.

## Product Boundaries

This project intentionally does not:

- Auto-submit applications.
- Automatically apply to jobs.
- Scrape job boards in the background.
- Bypass ATS systems.
- Run page scans without user action.
- Fill generated answers without user approval.
- Upload files automatically.

## Tech Stack

- TypeScript
- Node.js
- Express
- PostgreSQL and Prisma
- React, Vite, and Tailwind CSS
- Docker Compose
- Chrome Manifest V3 extension
- DeepSeek/OpenAI-compatible provider interface
- Ollama local provider support

## Project Structure

```text
apps/
  backend/
    src/                  API, providers, services
  frontend/
    public/               Static demo application forms
    src/                  React companion UI
  extension/
    public/               MV3 manifest and side panel HTML/CSS
    src/                  background, content scripts, side panel controller
e2e/                      Playwright extension and full-stack browser tests
prisma/
  schema.prisma           Database models
  migrations/             Postgres migrations
scripts/
  copy-extension-assets.mjs
```

## Setup

Prerequisites:

- Node.js 22.12+ on the Node 22 line, or a newer compatible LTS release (the current Vite version requires Node 20.19+ or 22.12+).
- npm, Docker with Compose, and Chrome/Chromium with side-panel support.
- Free host ports `5432`, `4317`, and `8080`; Vite development also uses `4318`.

Run commands from the repository root. For a new checkout:

```bash
npm ci
cp .env.example .env
```

Keep your existing `.env` when updating an installation.

### Docker stack

```bash
docker compose up -d
docker compose logs -f backend
```

Compose starts PostgreSQL, the backend, and Caddy. The backend installs dependencies, generates Prisma Client, builds the React frontend, and applies committed migrations before starting. The first startup can take time. The browser extension is built separately on the host.

Open `http://jobapply.localhost:8080`. The backend is also reachable at `http://localhost:4317`.

**Database port:** Compose currently publishes PostgreSQL on host port `5432`, while `.env.example` uses `5433`. The container connects directly to `postgres:5432`, so the Docker stack works independently of that example URL. Before running Prisma commands or a backend on the host, change `.env` to:

```env
DATABASE_URL=postgres://jobapply:jobapply_dev@localhost:5432/jobapplyassistant
```

Alternatively, change the Compose host mapping to `5433:5432` and retain the example URL. Other local projects, including Interview OS, may already occupy `5432`.

**AI configuration in Docker:** the backend sets `SKIP_DOTENV=true` and its Compose environment currently does not forward AI settings from `.env`. Without explicit provider variables, suggestion generation falls back to mock drafts. To use a real provider, add its configuration to the backend service's `environment` using environment-variable interpolation, then recreate the backend. For example, forward `AI_PROVIDER`, `DEEPSEEK_API_KEY`, and `DEEPSEEK_MODEL` for DeepSeek. Keep credentials in local environment configuration rather than literal values in Compose.

### Host development

Start only PostgreSQL, using the matching host `DATABASE_URL` described above:

```bash
docker compose up -d postgres
npm run prisma:generate
npm run db:deploy
npm run build:frontend
npm run dev:backend
```

Open `http://localhost:4317` for the built companion UI and `/demos/` for the demo forms. In a second terminal, optionally run:

```bash
npm run dev:frontend
```

Vite serves `http://localhost:4318` and proxies `/api` to `http://localhost:4317`.

The checked-in Caddy service targets the **container** backend, so it is not a proxy for a host development process. To use the extension with a host backend, set its local `backendBaseUrl` to `http://localhost:4317` from the extension side-panel DevTools console:

```javascript
chrome.storage.local.set({ backendBaseUrl: "http://localhost:4317" });
```

Remove that override to return to the Docker/Caddy default:

```javascript
chrome.storage.local.remove("backendBaseUrl");
```

### Database commands

- `npm run db:deploy`: apply committed migrations to the configured database.
- `npm run db:migrate`: create/apply migrations while developing schema changes.
- `npm run db:status`: inspect migration status.
- `npm run db:reset`: **destructively reset** the configured database; do not use it on personal data you want to keep.

## Companion UI

Open:

```text
http://jobapply.localhost:8080/
```

For host development, use `http://localhost:4317/` instead.

The companion UI is a lightweight React SPA built with Vite and Tailwind CSS. Use it to review data sources, paste a broad context document, and save resume text.

The context document can include:

- resume text
- career summary
- preferred roles
- work authorization
- compensation preferences
- projects
- achievements
- reusable application answers

This is stored in Postgres, syncs basic profile fields, and is included when the backend drafts answers for uncommon application questions. Remote providers receive assembled user context and scanned page text; local storage does not mean that remote AI processing stays on the machine.

Common reusable values are stored as structured profile fields. The context importer recognizes labels such as `Full Name`, `Email`, `Phone`, `City`, `State`, `Country`, `LinkedIn`, `GitHub`, `Portfolio`, `Work Authorization`, `Requires Sponsorship`, `Date of Birth`, `Gender`, `Race / Ethnicity`, `Disability Status`, and `Veteran Status`.

Date of birth and EEO answers are protected profile values: they are used only for deterministic matching, are not automatically added to unrelated AI prompts, and always start unchecked in the extension. The user must explicitly select each protected suggestion before it can be filled. SSNs and passwords remain manual-only and are never suggested or filled.

## Demo Forms

Open:

```text
http://jobapply.localhost:8080/demos/
```

The demo pages provide local application forms for:

- Greenhouse-style single-page applications
- Lever-style compact applications
- Workday-style step pages

Use these pages to demonstrate the extension flow without submitting anything to an external ATS:

1. Open a demo form.
2. Open the extension side panel.
3. Click **Scan page**.
4. Upload, paste, or edit resume text in the side panel.
5. Optionally click **Tailor from scanned JD** to generate a resume draft, then review it. Save context/resume changes and scan again to regenerate field suggestions.
6. Review and edit field suggestions.
7. Select the answers you approve and click **Confirm & fill selected**.

After a successful scan, filling targets the scanned tab rather than whichever tab is currently active. Rescan after navigation or a failed scan, and verify the actual form values after filling. Each field's real fill result is recorded. Protected profile answers can succeed only after explicit selection; manual-only or missing fields are logged as unsuccessful without storing their attempted values.

## AI Providers

Configure providers in `.env` when running the backend on the host. For Docker, explicitly forward the selected provider variables as described above. Restart the backend after configuration changes.

For DeepSeek:

```env
AI_PROVIDER=deepseek
AI_FALLBACK_PROVIDER=mock
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_MODEL=deepseek-v4-flash
```

For OpenAI:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=your_model_here
```

For Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

For no AI generation:

```env
AI_PROVIDER=none
```

Saved-answer and profile matching still work when `AI_PROVIDER=none`. Resume tailoring selects a fallback when the primary provider is disabled or unconfigured; set `AI_FALLBACK_PROVIDER=none` as well if tailoring should also be unavailable.

`AI_TIMEOUT_MS` controls generation timeouts (default `20000`), and `AI_MAX_CONTEXT_CHARS` caps assembled suggestion context (default `30000`). Mock mode returns placeholder drafts, not model-generated answers. For Ollama running on the host while the backend runs in Docker Desktop, use a container-reachable address such as `http://host.docker.internal:11434`.

## Build

```bash
npm run build
```

The extension build is written to:

```text
dist/apps/extension
```

The companion frontend build is written to:

```text
dist/apps/frontend
```

## Verification

The root package does not declare npm workspaces. Install the per-app test dependencies separately:

```bash
npm --prefix apps/backend ci
npm --prefix apps/extension ci
npm --prefix apps/frontend ci
npm run typecheck
npm test
```

Individual suites are available through `npm run test:backend`, `npm run test:extension`, and `npm run test:frontend`. Run their corresponding `:watch` scripts in separate terminals; the root watch command chains persistent watchers sequentially.

### Browser end-to-end tests

Install Playwright's bundled Chromium once, then run the browser suite:

```bash
npx playwright install chromium
npm run test:e2e
```

`test:e2e` builds and loads the real Manifest V3 extension in Playwright Chromium, starts the backend with `AI_PROVIDER=mock`, creates and migrates a disposable PostgreSQL database, and removes that database when the run finishes. Docker must be running and the Compose PostgreSQL service must be available on host port `5432`.

The suite covers Greenhouse- and Lever-style forms, protected fields, persisted audit records, and a multi-page Workday-style flow. In the Workday case, the browser test clicks each page's **Next** link as the user would; the extension never advances the application itself and is explicitly rescanned after navigation.

To run unit, integration, and browser tests together:

```bash
npm run test:all
```

These fixtures exercise representative form structures, not every live ATS implementation. Live sites can change their markup and should be added as targeted fixtures when incompatibilities are found.

## Load The Extension Locally

1. Run `npm run build`.
2. Open Chrome or a Chromium browser.
3. Go to `chrome://extensions`.
4. Enable Developer Mode.
5. Click **Load unpacked**.
6. Select `dist/apps/extension`.

The extension opens as a side panel. It can be collapsed into a compact `JAA` button and expanded again.

By default, the extension calls:

```text
http://jobapply.localhost:8080
```

## Useful API Routes

```http
GET /api/health
GET /api/profile
PUT /api/profile
GET /api/context
PUT /api/context
GET /api/resume-versions
POST /api/resume-versions
POST /api/resume-versions/tailor
GET /api/answer-bank
POST /api/answer-bank
GET /api/application-sessions
POST /api/application-sessions/resolve
POST /api/application-sessions/:id/page-snapshots
POST /api/application-sessions/:id/suggestions
POST /api/application-sessions/:id/filled-fields
POST /api/application-sessions/:id/suggestion-decisions
GET /api/application-sessions/:id/audit-trail
GET /api/ai/providers
POST /api/ai/providers/test
```

## Current MVP Status

Implemented:

- Postgres schema and migrations
- Local companion API
- Lightweight AI context UI
- Resume paste/upload storage
- Resume tailoring from scanned job descriptions
- Provider abstraction for DeepSeek, OpenAI, Ollama, mock, and none
- Deterministic profile and answer-bank matching
- AI draft fallback for uncommon questions
- MV3 extension scaffold
- Visible field scanner
- User-reviewed suggestion UI
- User-selected field filling
- Multi-page session and page snapshot persistence
- Suggestion decision audit records and an audit-trail API

Next useful improvements:

- richer profile import from resume text
- better ATS-specific field labeling for Workday, Greenhouse, Lever, and Ashby
- tests with fixture application pages
- provider settings UI
- answer-bank management UI

## Reading the Code

- [`suggestionService.ts`](apps/backend/src/services/suggestionService.ts): deterministic suggestions, batched AI fallback, and persistence.
- [`contextAssembler.ts`](apps/backend/src/services/contextAssembler.ts): parallel context reads and context-size limits.
- [`providers/`](apps/backend/src/providers): provider implementations, timeouts, and response handling.
- [`scanner.ts`](apps/extension/src/content/scanner.ts) and [`filler.ts`](apps/extension/src/content/filler.ts): content-script scanning and filling.
- [`sidepanel.ts`](apps/extension/src/ui/sidepanel.ts): scan, review, fill, and resume workflows.
- [`schema.prisma`](prisma/schema.prisma): profiles, sessions, snapshots, suggestions, and audit records.

## Current Limitations

- The companion API is unauthenticated and intended for trusted local use, not public hosting.
- Session resolution can group distinct jobs on the same ATS domain into one active session.
- Native fields can still change between scanning and confirmation; failed or missing targets are reported per field and should be rescanned.
- Sensitive-field handling is incomplete across the scanner/API boundary; password fields are not accepted by the API field schema. Review the page and avoid relying on the extension for sensitive fields.
- Model JSON is parsed without complete runtime validation of answer shapes. Generated suggestions always need review.
- Resume uploads support text and Markdown only, not PDF or Word parsing.
