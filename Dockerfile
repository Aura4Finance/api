FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./

# FIX 1: Added --legacy-peer-deps to prevent the ERESOLVE crash from your first error
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

COPY . .

ARG CACHEBUST=1
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate

RUN npm run build

FROM node:24-slim

# Install Chromium for Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# FIX 3: Added --legacy-peer-deps here as well for the production flag install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
CMD ["npm", "run", "start"]
