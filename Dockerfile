FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

RUN npx prisma generate
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

RUN if [ "$NODE_ENV" != "development" ]; then npm run build; fi

RUN npx tsc-alias

# Copy HTML files into dist
RUN cp -r src/html dist/html

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

CMD ["node", "dist/server.js"]
