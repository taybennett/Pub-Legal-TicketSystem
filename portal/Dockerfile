FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json vite.config.ts index.html ./
RUN npm ci
COPY src ./src
COPY public ./public
# Vite reads VITE_* env vars at BUILD time and inlines them into the JS bundle.
# Railway service variables are NOT auto-injected into Docker build context —
# we must declare ARG and ENV here so Vite can see VITE_API_URL.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14
COPY --from=builder /app/dist ./dist
EXPOSE 8080
# serve the static bundle; -s = SPA mode (fallback to index.html for client routing)
CMD ["serve", "-s", "dist", "-l", "8080"]
