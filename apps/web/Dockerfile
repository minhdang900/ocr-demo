# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
COPY apps/web/package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install dependencies (including devDependencies for build)
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY apps/web/ ./apps/web/

# Build the application
WORKDIR /app/apps/web
RUN pnpm run build
WORKDIR /app

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files and workspace configuration
COPY apps/web/package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod

# Copy built application from builder stage
COPY --from=builder /app/apps/web/.next ./.next

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Run the application
CMD ["pnpm", "start"]
