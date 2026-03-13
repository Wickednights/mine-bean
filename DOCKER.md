# Docker — Local Development

Run the full stack (MongoDB, backend, frontend) with one command.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

## Quick Start

```bash
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001
- **MongoDB:** localhost:27017 (internal)

## Optional: Supabase

For profile storage, create a `.env` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
```

Docker Compose will pick these up automatically.

## Commands

| Command | Description |
|---------|-------------|
| `docker compose up --build` | Build and start all services |
| `docker compose up -d` | Start in background |
| `docker compose down` | Stop all services |
| `docker compose down -v` | Stop and remove MongoDB volume |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│   MongoDB   │
│  (Next.js)  │     │  (Express)  │     │  (local)    │
│  :3000      │     │  :3001      │     │  :27017     │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **MongoDB:** Runs locally in a container; no Atlas needed for dev.
- **Backend:** Connects to `mongodb://mongodb:27017/minebean`.
- **Frontend:** Calls backend at `http://localhost:3001` (browser reaches host port).

## Hot Reload

Source code is mounted as volumes. Changes to `Backend/` or frontend files are reflected without rebuilding. Restart the containers if you change `package.json` or `Dockerfile`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port already in use | Stop other processes on 3000, 3001, or 27017 |
| Backend can't connect to MongoDB | Wait for MongoDB healthcheck (first start takes ~10s) |
| Frontend shows API errors | Ensure backend is up: `curl http://localhost:3001/health` |
| `[Indexer] ... eth_getLogs ... rate limit` | Public BSC RPC has strict limits. Add `RPC_URL` with an Alchemy/QuickNode/Infura BSC testnet URL (with API key) to your `.env` and rebuild. |
