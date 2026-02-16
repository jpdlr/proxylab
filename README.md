# Proxylab

Proxylab is a local API playground and debugging proxy for capturing, inspecting, and replaying HTTP traffic.

## Status
Implemented MVP.

## Features
- Reverse proxy endpoint at `/proxy/*` with target URL via `target` query or `x-proxylab-target` header.
- Request/response capture with timing and status metadata.
- Header/body redaction for sensitive fields before persistence.
- File-backed capture persistence (defaults to `.proxylab/captures.json`).
- Replay API for previously captured requests.
- Snippet generation (`curl` + `fetch`) from captured traffic.
- React dashboard with search, method filtering, detail viewer, and replay action.
- Theme switching with light and dark tokenized themes.

## Repo layout
- `server`: Fastify proxy and capture API.
- `web`: React + Vite dashboard.

## Scripts
- `npm run dev`: run server + web together.
- `npm run dev:server`: run server only.
- `npm run dev:web`: run web only.
- `npm run build`: build server and web artifacts.
- `npm run test`: run web and server tests.

## Quick start
```bash
npm install
npm run dev
```

Server runs on `http://localhost:8787` and web runs on Vite (default `http://localhost:5173`).

### Persistence options
- Default: file-backed captures in `.proxylab/captures.json`.
- `PROXYLAB_PERSISTENCE=memory`: disable file persistence.
- `PROXYLAB_STORE_FILE=/absolute/path/captures.json`: override storage location.

## Capture example
```bash
curl -X POST \
  "http://localhost:8787/proxy/v1/messages?target=https://api.example.com" \
  -H "content-type: application/json" \
  -H "authorization: Bearer test-token" \
  -d '{"prompt":"hello world"}'
```

Then open the dashboard and inspect the capture, replay it, or copy generated snippets.

## Test coverage
- Server flow test: proxy capture -> inspect -> replay.
- Server endpoint test: `/health`.
- Web tests: capture loading, theme toggle, replay action.

## License
MIT
