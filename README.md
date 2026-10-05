# ⚡ Folioflash — prompt-to-portfolio in minutes

> Type a prompt, drop your assets, get a fast, lightweight portfolio. Free V1. Live in minutes. At-cost pricing while in beta.

**Folioflash** turns a simple prompt + photos/texts/links into a static **Astro** portfolio site: 0 JS by default, WebP images, video facades, 95+ Lighthouse, FR/EN, SEO + `llms.txt` included.

- 🇫🇷 Version française : voir `docs/cahier-des-charges.md`
- 📐 Spec : `docs/cahier-des-charges.md` · Architecture : `docs/architecture.md` · Design : `docs/design-system.md` · Costs : `docs/couts.md` · Marketing : `docs/marketing-seo.md` · Roadmap : `docs/roadmap.md`
- 🧱 Build : `template-folio/` (Astro template, M1) · `studio/` (orchestrator skeleton, M1)

![status](https://img.shields.io/badge/status-M0%20framing-blue)
![stack](https://img.shields.io/badge/stack-Astro%206%20%E2%80%A2%20Tailwind%204%20%E2%80%A2%20Stripe-orange)
![i18n](https://img.shields.io/badge/i18n-FR%20%2F%20EN-green)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

## How it works

1. **Describe** — prompt + structured fields (name, craft, bio, 3–6 projects, socials) + assets (≤ 20 MB in M1).
2. **Get your free V1** — one template, `you.folioflash.site`, Folioflash badge. No card. ~5 min.
3. **Publish (€29 test price, at cost)** — badge removed, SEO on, custom domain connected, 1 year hosting included.
4. **Iterate at cost** — each AI edit = 1 credit at token cost (~€2), quoted before you confirm. Push = live, no preview in M1.

## Stack (proven on `earlyreflect`)

- Astro 6 + Tailwind 4 + TypeScript, 100% static (`dist/`)
- 1 repo per site → GitHub Actions → GitHub Pages live (then Docker/NPM on our server after beta)
- `config-domain.mjs` per site, Markdown collections FR/EN, `optimize-image.mjs` → WebP, `llms.txt` / `persona.json` per build

## Test pricing (beta, at cost)

| What | Price |
|---|---|
| V1 (1 template, subdomain, badge) | **Free** |
| Publish (live + SEO + domain connect + 1 yr hosting) | **€29** |
| AI edit credit (1 standard regen = 1 credit) | **~€2 / credit** |
| Domain bought for you | **cost + €5 fee** |

Details + margins in `docs/couts.md`. Prices will move after 50 measured jobs — this is a test.

## Status / roadmap

- **M0** (now): framing only, no runnable code — this repo.
- **M1**: minimal Studio on our nano (magic-link auth, prompt+assets, 1 template, Stripe test, live-only pipeline) + 10 pilot sites.
- **M2**: 3 templates, rollback UI, LinkedIn robot, Docker hosting if Pages limits hit.

See `docs/roadmap.md`.

## Pilot friends

Want a free portfolio in exchange for being in the public gallery? Open an issue with title `Pilot: <your name> — <your craft>` and drop 3 links + 5 photos. First 10 in.

## License

MIT — see `LICENSE`. Generated client sites belong to their owners.
