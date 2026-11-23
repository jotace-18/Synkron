FROM node:24.22.1-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build


FROM nginx/nginx-unprivileged:1.30.6-alpine-slim AS runtime

COPY nginx.conf /etc/nginx/nginx.conf
COPY server.conf.template /etc/personal/server.conf.template
COPY --chown=101:101 35-personal-config.sh /docker-entrypoint.d/35-personal-config.sh
RUN chmod 755 /docker-entrypoint.d/35-personal-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
