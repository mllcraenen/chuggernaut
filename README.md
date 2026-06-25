# tools-portal

Personal tools dashboard at tools.marijncraenen.nl — dark minimal, auth-protected.

## Stack

- Next.js 15 App Router + TypeScript + Tailwind CSS
- Auth.js v5 (next-auth@beta) credentials provider
- Docker on port 3001, Caddy reverse proxy

## Setup

```bash
cp .env.example .env
# edit .env with your values
# generate AUTH_SECRET: openssl rand -base64 32
```

## Development

```bash
npm install
npm run dev  # http://localhost:3000
```

## Docker

```bash
# Build and start
docker compose up -d --build

# Logs
docker compose logs -f tools-portal
```

## Environment variables

| Variable        | Description                          |
|-----------------|--------------------------------------|
| `AUTH_SECRET`   | Random secret for JWT signing        |
| `AUTH_USERNAME` | Login username                       |
| `AUTH_PASSWORD` | Login password                       |

## Notes

- `/status` page mounts `/var/run/docker.sock` (read-only) to check container states
- Log files served from `~/logs/` at `/api/logs/...` (auth-protected)
