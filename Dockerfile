# Multi-stage production build for Bhajan Scheduler
FROM node:20-alpine AS builder

WORKDIR /app

# Native build tools for bcrypt and sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Minimal Production Runtime
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=8000

# Copy prebuilt dependencies and application code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Ensure storage directories exist and run under non-root node user
RUN mkdir -p /app/backups && chown -R node:node /app

USER node

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/healthz || exit 1

CMD ["node", "app.js"]
