# syntax=docker/dockerfile:1
#
# Production frontend image for SWIMS-HBICS.
# Build happens at IMAGE BUILD TIME (one-time), so `docker compose up`
# only starts a prebuilt `next start` (low RAM). No hot-reload here.

# ---------------- base ----------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat

# ---------------- deps (cached layer) ----------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
RUN npm ci

# ---------------- builder ----------------
FROM base AS builder
WORKDIR /app

# These are inlined by Next at BUILD time (rewrites + NEXT_PUBLIC_*),
# so they MUST be set here, not only at container runtime.
ARG BACKEND_INTERNAL_URL=http://backend:4000
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_PUBLIC_API_URL=http://localhost:4000/api

# Cap Node heap so a build OOM fails the build instead of killing the host.
ENV NODE_OPTIONS=--max-old-space-size=1024

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# shared must be built first: frontend imports @swims/shared -> dist/
RUN npm run build --workspace=shared
RUN npm run build --workspace=frontend

# ---------------- runner ----------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache libc6-compat

# Baked build + node_modules (next start needs them at runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend ./frontend
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

EXPOSE 3000
# next start serves the prebuilt .next; -H 0.0.0.0 so the container port is reachable.
CMD ["npm", "run", "start", "--workspace=frontend", "--", "-H", "0.0.0.0"]
