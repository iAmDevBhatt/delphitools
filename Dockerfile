# syntax=docker/dockerfile:1

# Stage 1: dependencies
FROM node:22-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with npm (matches the Cloudflare Pages production
# build path for this repo, which also installs via npm/package-lock.json).
# Cache npm's cache across builds/dependency bumps so a cold `deps` layer
# doesn't re-download the whole tree from the registry every time.
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Stage 2: builder
FROM deps AS builder
WORKDIR /app

# Copy source code
COPY . .

# Build-time commit SHA for the in-app version label (see
# app/lib/build-flags.ts / vite.config.mjs). `.git` is excluded from the
# build context (see .dockerignore), so it can't be read here — pass it in:
#   docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
# Defaults to "dev" when not supplied.
ARG COMMIT_SHA=dev
ENV DT_COMMIT_SHA=$COMMIT_SHA

# Build the SPA (client-side only — no prerender step, so no headless
# Chrome/Puppeteer needed in the image). Output lands in ./dist.
RUN npm run build

# Stage 3: production runtime — serve the static build with Bun itself
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Static build output + the tiny server that serves it
COPY --from=builder /app/dist ./dist
COPY scripts/serve.mjs ./scripts/serve.mjs

EXPOSE 3000

CMD ["bun", "scripts/serve.mjs"]
