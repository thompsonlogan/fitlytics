# syntax=docker/dockerfile:1

# ─ Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# pnpm 9 matches lockfileVersion 9.0 in pnpm-lock.yaml.
RUN npm install -g pnpm@9

# Install against the frozen lockfile first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build-time public config. Vite inlines VITE_* into the bundle, so these are
# baked at build time, not read at runtime. Same-origin in prod: leave the API
# base empty so the SPA calls /api and /auth, which nginx proxies to the backend.
ARG VITE_API_BASE_URL=""
ARG VITE_MAX_VIDEO_BYTES="524288000"
ARG VITE_ALLOWED_VIDEO_TYPES="video/mp4,video/quicktime,video/webm"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_MAX_VIDEO_BYTES=$VITE_MAX_VIDEO_BYTES \
    VITE_ALLOWED_VIDEO_TYPES=$VITE_ALLOWED_VIDEO_TYPES

RUN pnpm build

# ─ Runtime stage ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# The nginx image renders /etc/nginx/templates/*.template through envsubst at
# container start. Restrict substitution to BACKEND_* so nginx's own $variables
# ($uri, $host, $request_uri, …) are left untouched.
ENV NGINX_ENVSUBST_FILTER="BACKEND_"

# Internal container name:port of the backend app. Override in Coolify with the
# backend's actual internal name (see DEPLOY.md). Never a public hostname.
ENV BACKEND_UPSTREAM="fitlytics-backend:8080"

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
