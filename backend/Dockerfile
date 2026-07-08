# syntax=docker/dockerfile:1
# Build context is the repository root (see docker-compose.yml).

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend
RUN npm run build --workspace shared \
  && npm run build --workspace backend

# ---- Production dependencies ----
# Separate stage so the runtime image never contains dev tooling
# (typescript, vitest, eslint — the bulk of node_modules).
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --ignore-scripts

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
# Least privilege: uploads go to os.tmpdir(), which stays writable.
USER node
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
