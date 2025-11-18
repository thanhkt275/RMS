FROM oven/bun:1.2.21-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install turbo
RUN bun add -g turbo

# Copy the entire monorepo
COPY . .

# Prune the monorepo to only include server app and its dependencies
RUN turbo prune server --docker

# Install dependencies
FROM base AS installer
WORKDIR /app

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=deps /app/out/json/ .

# Install dependencies
RUN bun install --frozen-lockfile

# Build the project
FROM base AS builder
WORKDIR /app

# Copy installed dependencies
COPY --from=installer /app/ .

# Copy source code
COPY --from=deps /app/out/full/ .

# Copy base tsconfig (needed for workspace packages)
COPY tsconfig.base.json tsconfig.json ./

# Build the server app
RUN bun run build --filter=server

# Production image
FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 honojs

# Copy package.json files for production dependencies
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Install production dependencies only
RUN bun install --production --frozen-lockfile

# Copy built application
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Change ownership
RUN chown -R honojs:nodejs /app

USER honojs

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "apps/server/dist/index.js"]
