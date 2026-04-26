# TEEPO — BGU Study Organizer

Smart study platform for Israeli university students. Unifies Moodle, the university portal, Google Calendar, and an AI study assistant (Claude) into a single Hebrew/RTL interface.

> Full product spec: [`docs/TEEPO_SPEC.md`](docs/TEEPO_SPEC.md)

## Stack

- **Frontend:** Next.js 14 (App Router) · TypeScript · Tailwind · Tiptap · Framer Motion
- **Backend:** Flask + Flask-SocketIO (Python 3.11+) · Anthropic SDK
- **Database & Auth:** Supabase (Postgres + Auth)
- **Storage:** Google Drive (per-user, `drive.file` scope)
- **Deploy:** Vercel (frontend) · Render (backend)

## Repository layout

```
app/              Next.js App Router pages (frontend)
components/       React components
lib/              Frontend utilities (Supabase client, Drive, etc.)
backend/          Flask API + agents + scrapers
  agents/         Claude-powered study agents
  routes/         API endpoints
  services/       Moodle scraper, memory agent, etc.
chrome-extension/ Browser extension for Moodle scraping
supabase/         SQL schema and migrations
data/             Static reference data (university info, AI tools)
public/           Static assets + legal markdown
```

## Prerequisites

- Node.js 20+ (tested on 24.x)
- Python 3.11+
- A Supabase project
- An Anthropic API key
- (Optional) BGU Moodle credentials for the scraper

**Do not put this folder inside OneDrive.** Cloud-only stubs break git and dev tooling. Keep it on a real local path like `C:\Projects\` or `~/dev/`.

## Setup

### 1. Clone

```bash
git clone https://github.com/yarinlevin18-ai/bgu-study-organizer.git
cd bgu-study-organizer
```

### 2. Frontend

```bash
npm install
cp .env.example .env.local
# Edit .env.local — see "Environment variables" below
```

### 3. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit backend/.env — see "Environment variables" below
```

### 4. Database

Run the SQL files in `supabase/` and `backend/` against your Supabase project, in this order:

1. `supabase/schema.sql`
2. `backend/create_tables.sql`
3. `backend/create_catalog_tables.sql`
4. `backend/migrate_001.sql`
5. `backend/migrate_002.sql`
6. `supabase/rls_audit.sql` (verify RLS policies)

## Run locally

Two terminals:

```bash
# Terminal 1 — backend
cd backend
python app.py
# → http://localhost:5000

# Terminal 2 — frontend
npm run dev
# → http://localhost:3000
```

## Environment variables

### Frontend (`.env.local`)

| Var | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Backend URL, e.g. `http://localhost:5000` |
| `NEXT_PUBLIC_UNIVERSITY_NAME` | no | Display name (Hebrew), e.g. `אוניברסיטת בן-גוריון בנגב` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |

### Backend (`backend/.env`)

| Var | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | yes | Supabase service-role key (server-only) |
| `SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `FLASK_SECRET_KEY` | yes | Random string |
| `FLASK_ENV` | yes | `development` or `production` |
| `CLAUDE_MODEL` | no | Defaults to `claude-sonnet-4-6` |
| `MOODLE_URL` | no | Moodle base URL, e.g. `https://moodle.bgu.ac.il/moodle` |
| `PORTAL_URL` | no | University portal URL |
| `UNIVERSITY_USERNAME` / `UNIVERSITY_PASSWORD` | no | Scraper credentials |
| `UNIVERSITY_ALLOWED_DOMAINS` | no | Comma-separated allowlist for the scraper |

See `.env.example` and `backend/.env.example` for the full reference.

## Common scripts

```bash
npm run dev        # Next dev server
npm run build      # Production build
npm run start      # Run production build
npm run lint       # ESLint
```

## Deployment

- **Frontend:** Vercel — connected via `vercel.json`
- **Backend:** Render — configured in `render.yaml`

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: branch off `main`, open a PR, request review.

## License

MIT — see [`LICENSE`](LICENSE).
