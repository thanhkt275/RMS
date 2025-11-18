FROM oven/bun:1.2.21-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install turbo
RUN bun add -g turbo

# Copy the entire monorepo
COPY . .

# Prune the monorepo to only include web app and its dependencies
RUN turbo prune web --docker

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

# Build the web app
RUN bun run build --filter=web

# Production image
FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist .

# Copy nginx configuration (copy from monorepo root, not from pruned output)
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf 

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
