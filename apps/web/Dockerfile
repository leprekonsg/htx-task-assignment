# Build context is the repository root. Stage 1 builds the Vite bundle; stage 2 serves it with nginx,
# which also proxies /api and /docs to the api container so the browser talks to a single origin.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @htx/web

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1/ || exit 1
