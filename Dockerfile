# ─────────────────────────────────────────────────────────────────────────────
# URLUG — production image
#
# Multi-stage. The final image carries the Next.js standalone output and its
# traced dependencies, not the 400MB of node_modules that built it.
#
# ⚠ This app needs a LONG-RUNNING server: the SSE route holds a connection open
# for the length of a sale, and the ticker holds a pg connection for its
# advisory lock. That is why there is a Dockerfile rather than a serverless
# deploy — see the deployment note in README.md.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
# `pg` and `@node-rs/argon2` both ship prebuilt binaries for musl, so no build
# toolchain is needed. libc6-compat covers the glibc-linked ones that do not.
RUN apk add --no-cache libc6-compat
WORKDIR /app


# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci`, not `npm install` — it installs exactly the lockfile and fails if
# the two disagree, which is what makes a build reproducible.
RUN npm ci


# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No DATABASE_URL here, deliberately. src/lib/env.ts reads through getters and
# src/lib/db.ts creates the pool lazily, so a build needs no credentials — CI
# can compile this without a production password.
#
# ⚠ The two NEXT_PUBLIC_ values are a different matter and MUST be passed here.
#
# Next inlines `NEXT_PUBLIC_*` at compile time wherever it appears — server
# components included — so a value supplied only as a runtime secret arrives
# too late and is silently ignored. `robots.txt` is prerendered to a static
# file carrying the site URL, which is how "it works locally" ships a
# production robots.txt pointing at localhost.
#
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://example.mn .
#
# ROUND_TIME_SCALE defaults to 1 and src/lib/auction.ts throws on a production
# build that sees anything else, so the default here is also the safe one.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ROUND_TIME_SCALE=1
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_ROUND_TIME_SCALE=$NEXT_PUBLIC_ROUND_TIME_SCALE

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Never root. A container process that is compromised should not also own the
# filesystem it is standing on.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# The standalone output already contains a minimal node_modules with only what
# the traced imports need.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrations and seed fixtures, so `docker compose exec app node
# --experimental-strip-types db/migrate.ts` works against a running container.
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/auction.ts ./src/lib/auction.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/types.ts ./src/lib/types.ts

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# SIGTERM must reach Node so the ticker releases its advisory lock on the way
# out — hence the exec form, with no shell in between to swallow the signal.
CMD ["node", "server.js"]
