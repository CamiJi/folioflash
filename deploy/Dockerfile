# Studio on the nano: Node 22.19+ runtime (SQLite and current template dependencies).
# RAM-friendly like portfolio-astro (512 MB heap cap) — one build at a time.
FROM node:22.19-alpine
WORKDIR /app

COPY studio/package.json studio/package-lock.json ./studio/
COPY template-folio/package.json template-folio/package-lock.json ./template-folio/
ENV NODE_OPTIONS=--max-old-space-size=512
RUN cd template-folio && npm ci --no-audit --no-fund \
  && cd /app/studio && npm ci --omit=dev --no-audit --no-fund

COPY studio/ ./studio/
COPY template-folio/ ./template-folio/
RUN mkdir -p studio/data \
  && test -d template-folio/node_modules/astro \
  && node --check studio/server.mjs

ENV PORT=4322 NODE_BIN=node TEMPLATE_DIR=/app/template-folio
EXPOSE 4322
CMD ["node", "--experimental-sqlite", "studio/server.mjs"]
