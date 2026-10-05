# Studio — run + API contract (M1 skeleton)

```bash
nvm use 22
node server.mjs   # → http://localhost:4322 (form + JSON API, zero deps)
```

| Method | Route | Body → Response |
|---|---|---|
| GET | `/` | intake form (HTML) |
| GET | `/api/health` | `{ ok, sites }` |
| GET | `/api/sites` | list (in-memory) |
| POST | `/api/sites` | `{ name, craft, prompt, palette }` → `201 { id, slug, status: 'queued', costEstEur }` |

Every POST appends to `data/jobs.jsonl` (git-ignored) — the raw material for `docs/couts.md §5` cost measurement.

## Next (M1 order)

1. Magic-link auth (email) + `users` table (`schema.sql` ready).
2. Real V1 job: prompt → `site.json` + project `.md` + optimized images → commit to client repo (org `Folioflash-*`) → Pages live.
3. Stripe test: Checkout publication 29 € + credits ~2 € + webhooks → `credits` update.
4. DNS check endpoint (`GET /api/sites/:id/dns`) before custom-domain go-live.
