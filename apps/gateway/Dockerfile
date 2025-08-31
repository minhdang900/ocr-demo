# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
COPY apps/gateway/package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install dependencies (including devDependencies for build)
RUN npm install -g pnpm && pnpm install

# Copy source code and TypeScript config
COPY apps/gateway/ ./apps/gateway/
COPY apps/gateway/tsconfig.json ./tsconfig.json

# Build the application
WORKDIR /app/apps/gateway
RUN pnpm run build
WORKDIR /app

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files and workspace configuration
COPY apps/gateway/package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod

# Copy built application from builder stage
COPY --from=builder /app/apps/gateway/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership of the app directory
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Run the application
CMD ["node", "dist/main.js"]
