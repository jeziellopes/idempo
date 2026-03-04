# syntax=docker/dockerfile:1
#
# Pre-built artifacts strategy — Nx builds on the host; Docker only packages.
#
# Prerequisite: run `pnpm build` (nx run-many --target=build --all) before
# `docker compose build`. This avoids running the Nx daemon inside a Docker
# build sandbox (Nx 22 limitation with executor resolution).
#
# NestJS apps  — @nx/node:build produces a fully self-contained main.js bundle:
#   docker build --build-arg APP_NAME=api-gateway --target nestjs -t idempo/api-gateway .
#
# Next.js web  — @nx/next:build + output:standalone produces a self-contained server:
#   docker build --build-arg APP_NAME=web --target nextjs -t idempo/web .

ARG APP_NAME=api-gateway

# ─── NestJS runtime ───────────────────────────────────────────────────────────
# @nx/node:build bundles all dependencies into a single main.js — no node_modules
# needed at container runtime.
FROM node:24-alpine AS nestjs
ARG APP_NAME
WORKDIR /app
ENV NODE_ENV=production

COPY dist/apps/${APP_NAME}/ ./

EXPOSE 3002
CMD ["node", "main.js"]

# ─── Next.js runtime (standalone) ─────────────────────────────────────────────
# @nx/next:build with output:'standalone' produces a self-contained server.
# The standalone directory includes its own node_modules subset.
FROM node:24-alpine AS nextjs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# @nx/next:build keeps .next/ inside apps/web/, not dist/.
# pnpm monorepo standalone nests server.js under the workspace-relative app path.
COPY apps/web/.next/standalone/      ./
COPY apps/web/.next/static/          ./apps/web/.next/static/
COPY apps/web/public/                ./apps/web/public/

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
