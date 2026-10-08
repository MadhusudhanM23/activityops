# syntax=docker/dockerfile:1
#
# ActivityOps - one image serving the API and the built frontend.
# Spec v7 sec. 18: single EC2 + encrypted EBS + Docker Compose + HTTPS proxy.
# TLS terminates at Caddy (see docker-compose.yml); this container speaks HTTP
# on the private compose network only.

FROM node:24-slim AS build
WORKDIR /app

# Install with the lockfile first so dependency layers cache across code changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY apps ./apps
RUN npm run build --workspace apps/api \
 && npm run build --workspace apps/web \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_PATH=/data/activityops.sqlite \
    WEB_DIST_PATH=/app/apps/web/dist
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# The SQLite file lives on the mounted EBS volume, owned by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/api/dist/server.js"]
