# Softupkaran - Sign Up Page
[![pipeline status](https://gitlab.com/signup7230051/signup/badges/main/pipeline.svg)](https://gitlab.com/signup7230051/signup/-/pipelines)

A Netflix-inspired sign-up experience built with plaintext HTML/CSS/JS, packaged behind Nginx for the frontend and complemented by a lightweight Express backend that persists users in Postgres.

## Repository layout
- `frontend/public/` ƒ?" static pages (`index.html`, `success.html`), styles (`styles.css`, `success.css`), the client script (`app.js`), favicons, and supporting assets. `frontend/Dockerfile` plus `frontend/nginx.conf` serve these files when the frontend is built or served via Docker/Compose.
- `backend/` ƒ?" Express API implementation, data helpers, admin UI, and scripts for migrating/importing users.
- `infrastructure/` ƒ?" Terraform binary bundle plus the README that explains how the Render deployment is wired (`render.yaml` stays at the repo root and references the services described here).

## Running locally

### Docker Compose (recommended)
```bash
docker compose up --build
```
This command builds the Nginx-based frontend (`frontend/`) and the Node backend (`backend/`). The frontend listens on `localhost:8080`, while the API/Express server runs on `localhost:5050` by default.

### Frontend-only
- Serve `frontend/public/` with any static server (e.g., `npx http-server frontend/public -p 8080` or a new Docker/Render deployment that points to that path).
- The inline script in `frontend/public/index.html` sets `window.__API_BASE__` (`https://signup-2wle.onrender.com` by default) before `app.js` loads. Change that value or inject a `<script>` tag to target a different API host (e.g., `https://api.example.com`).

### Backend
```bash
cd backend
npm install
npm run start   # listens on http://localhost:5050
```
Set the required environment variables before running the backend:
```bash
export ADMIN_USER="admin"
export ADMIN_PASS="change-me"
export SESSION_COOKIE="admin_session"
```

## Backend API
- `POST /api/signup` ƒ?" accepts `{ name, email, password, whatsapp, telegram }`, hashes the password, and persists the user.
- `GET /api/users` ƒ?" admin-only endpoint that returns every user (requires the admin session cookie).
- `GET /api/export?format=csv` ƒ?" admin-only CSV export of the users table (only the `csv` format is supported).
- `/admin` ƒ?" protected admin UI (login required via `POST /admin/login`).
- `GET /api/health` ƒ?" readiness probe for deployment platforms.

## Database
The backend persists data in Postgres. Provide `DATABASE_URL` (or the individual `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` values) before starting the service; the default credentials used during development are `postgres:postgres`. `SESSION_TTL_SEC` controls the session lifetime (default `3600` seconds).

### Deploying with Neon
- Replace the Postgres instance by setting `DATABASE_URL="postgresql://username:secret@xyz.neon.tech/mydb"`.
- Update Render (via `render.yaml` or the dashboard) with that `DATABASE_URL` plus the admin/ session variables so the deployed `softupkaran-backend` connects to Neon.
- Allow Renderƒ?Ts outbound IPs (or choose ƒ?oAllow all trafficƒ??) in Neonƒ?Ts networking panel so the service can reach the database.
- On first start, `ensureSchema()` in `backend/db.js` creates the `users` table automatically.

### Migrating existing users
If your legacy data lives in another Postgres instance, run the migration script:
```bash
cd backend
SOURCE_DATABASE_URL="postgresql://old-host/softupkaran" \
DATABASE_URL="postgresql://username:secret@xyz.neon.tech/mydb" \
npx node scripts/migrate-to-neon.js
```
The script copies `public.users` rows, respects `id`, and preserves `created_at`.

### Importing from `users.json`
If you have a `backend/data/users.json` export:
```bash
cd backend
DATABASE_URL="postgresql://username:secret@xyz.neon.tech/mydb" \
npx node scripts/import-users-json.js
```
The importer hashes each `password`/`password_hash` and upserts them into `public.users`. You may also provide a custom `users-*.json` path as the first argument if you exported the file elsewhere.

## Testing
From `backend/`, run `npm test`. The suite spins up an in-memory Postgres instance via `pg-mem` and exercises signup, admin auth, export, and delete flows.

## Deployment
- The frontend is designed to be a static Render `static` service (`render.yaml` adds `softupkaran-frontend` pointing to `frontend/public`).
- The backend stays a Node heap (`softupkaran-backend`) configured in the same `render.yaml`.
- `docker-compose.yml` spins up both services locally (frontend via the `frontend` Dockerfile, backend via Node 18).
- See `infrastructure/README.md` for extra deployment notes and the bundled Terraform CLI.

## Data location
- Users persist in the Postgres `users` table (`backend/db.js` defines the schema).
- Static files live in `frontend/public/`, and the admin UI is under `backend/public/`.
