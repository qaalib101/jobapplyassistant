# Job Apply Assistant

Job Apply Assistant is a click-to-assist browser extension and local companion API for filling job application forms with user-reviewed suggestions.

The goal is to help applicants move through multi-page ATS forms without building an auto-apply bot. The extension scans visible fields only after the user clicks it, sends normalized field metadata to the local API, shows suggested values, and fills only the fields the user selects.

## What It Does

- Scans visible fields on the current application page after a user click.
- Matches fields against saved profile data, answer-bank items, and pasted AI context.
- Supports multi-page application sessions with page snapshots and filled-field logs.
- Shows confidence and source context for suggestions.
- Requires user review before filling anything.
- Fills only user-selected fields.
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
- PostgreSQL
- Docker Compose
- Chrome Manifest V3 extension
- DeepSeek/OpenAI-compatible provider interface
- Ollama local provider support

## Project Structure

```text
apps/
  backend/
    db/migrations/        Postgres schema migrations
    public/               Lightweight context UI
    src/                  API, providers, services
  extension/
    public/               MV3 manifest and side panel HTML/CSS
    src/                  background, content scripts, side panel controller
scripts/
  copy-extension-assets.mjs
```

## Setup

Install dependencies:

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

The default local Postgres port is `5433` so it does not conflict with other projects using `5432`.

Start Postgres:

```bash
docker compose up -d postgres
```

Run migrations:

```bash
npm run db:migrate
```

Start the backend:

```bash
npm run dev:backend
```

The API and context UI run at:

```text
http://localhost:4317
```

## AI Context UI

Open:

```text
http://localhost:4317/
```

Paste a broad context document with details the AI should use, such as:

- resume text
- career summary
- preferred roles
- work authorization
- compensation preferences
- projects
- achievements
- reusable application answers

This is stored locally in Postgres and included when the backend drafts answers for uncommon application questions.

## AI Providers

Configure providers in `.env`.

For DeepSeek:

```env
AI_PROVIDER=deepseek
AI_FALLBACK_PROVIDER=mock
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_MODEL=deepseek-chat
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

Saved-answer and profile matching still work when AI is disabled.

## Build

```bash
npm run build
```

The extension build is written to:

```text
dist/apps/extension
```

## Load The Extension Locally

1. Run `npm run build`.
2. Open Chrome or a Chromium browser.
3. Go to `chrome://extensions`.
4. Enable Developer Mode.
5. Click **Load unpacked**.
6. Select `dist/apps/extension`.

The extension opens as a side panel. It can be collapsed into a compact `JAA` button and expanded again.

## Useful API Routes

```http
GET /api/health
GET /api/profile
PUT /api/profile
GET /api/context
PUT /api/context
GET /api/answer-bank
POST /api/answer-bank
POST /api/application-sessions/resolve
POST /api/application-sessions/:id/page-snapshots
POST /api/application-sessions/:id/suggestions
POST /api/application-sessions/:id/filled-fields
GET /api/ai/providers
POST /api/ai/providers/test
```

## Current MVP Status

Implemented:

- Postgres schema and migrations
- Local companion API
- Lightweight AI context UI
- Provider abstraction for DeepSeek, OpenAI, Ollama, mock, and none
- Deterministic profile and answer-bank matching
- AI draft fallback for uncommon questions
- MV3 extension scaffold
- Visible field scanner
- User-reviewed suggestion UI
- User-selected field filling
- Multi-page session and page snapshot persistence

Next useful improvements:

- richer profile import from resume text
- better ATS-specific field labeling for Workday, Greenhouse, Lever, and Ashby
- tests with fixture application pages
- provider settings UI
- answer-bank management UI
