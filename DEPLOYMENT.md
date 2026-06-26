# Deployment Notes

## Current recommendation

For this Next.js 16 game, use one of these paths:

- VPS: simplest production path right now. Build with Node.js and run `npm run start` behind Nginx/Caddy, or use the included `Dockerfile`.
- Cloudflare Workers: good Cloudflare path for a full Next.js app. Use the OpenNext Cloudflare adapter when we are ready to wire it.
- Cloudflare Pages: only use it if we convert the app to static export. The current app has dynamic routes such as `/coop/[roomCode]`, so Pages Static HTML Export is not the default target.

## VPS quick start

```bash
npm ci
npm run build
PORT=3000 npm run start
```

Reverse proxy example target:

```text
http://127.0.0.1:3000
```

Docker path:

```bash
docker build -t tana-builder .
docker run -d --name tana-builder -p 3000:3000 tana-builder
```

## Cloudflare Workers later

When we choose Workers, run the OpenNext migration and review the generated config:

```bash
npx @opennextjs/cloudflare migrate
```

Expected scripts after migration usually include preview/deploy commands based on `opennextjs-cloudflare`.

## Cloudflare Pages static export later

Only choose this if we accept a static-only build. That likely means removing or redesigning dynamic routes and setting a static export configuration.
