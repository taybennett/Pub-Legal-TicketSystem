FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json vite.config.ts index.html ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14
COPY --from=builder /app/dist ./dist
EXPOSE 8080
# serve the static bundle; -s = SPA mode (fallback to index.html for client routing)
CMD ["serve", "-s", "dist", "-l", "8080"]
