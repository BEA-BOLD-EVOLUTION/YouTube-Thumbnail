# Multi-stage Dockerfile for the tRPC API server (apps/api).
#
# Deploy on Railway:
#   - Leave "Root Directory" empty (build context = repo root).
#   - Set "Dockerfile Path" = apps/api/Dockerfile
#   - Healthcheck path: /health
#
# The repo is an npm workspace monorepo, so install happens at the repo root
# to respect the lockfile, then we build only the api with turbo and copy the
# artifacts into a minimal runtime image.

# ---------- Builder ----------
FROM node:20-alpine AS builder
WORKDIR /repo

# openssl is required by Prisma's query engine on alpine.
RUN apk add --no-cache openssl

# Copy files needed for the install step first to maximize Docker layer cache.
# (Copying package.json before source means small code changes don't bust the
# npm install cache.)
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# The api package has a postinstall that runs `prisma generate`, so the schema
# must exist before `npm ci` runs.
COPY apps/api/prisma ./apps/api/prisma

RUN npm ci --no-audit --no-fund

# Now copy the rest of the monorepo and build only the api.
COPY . .
RUN npx turbo run build --filter=api

# ---------- Runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copy the built API + the hoisted node_modules (where Prisma client lives).
COPY --from=builder /repo/apps/api/package.json ./package.json
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/node_modules ./node_modules

# Railway injects PORT at runtime; the server reads process.env.PORT.
EXPOSE 4000

CMD ["node", "dist/index.js"]
