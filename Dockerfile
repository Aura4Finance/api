FROM node:24 AS builder

WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

RUN npx prisma generate
RUN npm run build

RUN npx tsc-alias

# Copy HTML files into dist
RUN cp -r src/html dist/html

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

CMD ["node", "dist/server.js"]
