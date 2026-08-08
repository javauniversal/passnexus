# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web

ARG VITE_API_URL
RUN test -n "$VITE_API_URL"
RUN npm install --no-save --ignore-scripts \
	@rolldown/binding-linux-x64-gnu@1.2.3 \
	lightningcss-linux-x64-gnu@1.33.0
RUN npm install --prefix apps/web/node_modules/@tailwindcss/node --no-save --ignore-scripts \
	lightningcss-linux-x64-gnu@1.32.0
RUN npm run build --workspace web

FROM caddy:2.10-alpine AS runtime

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv