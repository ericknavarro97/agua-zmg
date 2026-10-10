# syntax=docker/dockerfile:1.7
#
# Imagen de producción de Agua ZMG (Next.js en modo standalone).
#
# IMPORTANTE: el contexto de build es la RAÍZ del repositorio (no web/), porque el
# job de migraciones necesita db/migrations. Ejemplo:
#
#   docker build -f web/Dockerfile --target runner  -t agua-zmg-web .
#   docker build -f web/Dockerfile --target migrate -t agua-zmg-migrate .
#
# Etapas: deps -> build -> runner (la app) ; deps -> migrate (job de migraciones).

ARG NODE_VERSION=22
ARG PNPM_VERSION=10.32.1

# ---------- base ----------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
# libc6-compat: algunos binarios nativos de Next/SWC lo piden en Alpine
RUN apk add --no-cache libc6-compat \
 && npm install -g pnpm@${PNPM_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true
WORKDIR /app/web

# ---------- deps: solo manifiestos, para aprovechar la caché de capas ----------
FROM base AS deps
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
# Versión visible en /api/salud (opcional): --build-arg APP_VERSION=$(git rev-parse --short HEAD)
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
# NEXT_PUBLIC_*: Next las incrusta en el JS al compilar, por eso son build args (no variables de ejecución)
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_MAP_STYLE_URL=""
# Datos del sitio que las páginas informativas leen al CONSTRUIR (se prerenderizan): ver web/lib/sitio.ts y docs/DEPLOY.md
ARG CONTACTO_EMAIL=""
ARG RESPONSABLE_NOMBRE=""
ARG RESPONSABLE_DOMICILIO=""
ARG AVISO_PRIVACIDAD_REVISADO=""
ARG GUIA_REVISADA_SALUD=""
ARG DATOS_LICENCIA_NOMBRE=""
ARG DATOS_LICENCIA_URL=""
ENV CONTACTO_EMAIL=${CONTACTO_EMAIL}
ENV RESPONSABLE_NOMBRE=${RESPONSABLE_NOMBRE}
ENV RESPONSABLE_DOMICILIO=${RESPONSABLE_DOMICILIO}
ENV AVISO_PRIVACIDAD_REVISADO=${AVISO_PRIVACIDAD_REVISADO}
ENV GUIA_REVISADA_SALUD=${GUIA_REVISADA_SALUD}
ENV DATOS_LICENCIA_NOMBRE=${DATOS_LICENCIA_NOMBRE}
ENV DATOS_LICENCIA_URL=${DATOS_LICENCIA_URL}
COPY web/ ./
# `pnpm build` ejecuta antes `copy:maplibre` (prebuild). El build NO necesita base de datos.
# Un build arg vacío se des-define: una variable vacía anularía el valor por defecto del código
# (`process.env.X ?? defecto` no reemplaza "").
RUN [ -n "${NEXT_PUBLIC_SITE_URL:-}" ] || unset NEXT_PUBLIC_SITE_URL; \
    [ -n "${NEXT_PUBLIC_MAP_STYLE_URL:-}" ] || unset NEXT_PUBLIC_MAP_STYLE_URL; \
    [ -n "${CONTACTO_EMAIL:-}" ] || unset CONTACTO_EMAIL; \
    [ -n "${RESPONSABLE_NOMBRE:-}" ] || unset RESPONSABLE_NOMBRE; \
    [ -n "${RESPONSABLE_DOMICILIO:-}" ] || unset RESPONSABLE_DOMICILIO; \
    [ -n "${AVISO_PRIVACIDAD_REVISADO:-}" ] || unset AVISO_PRIVACIDAD_REVISADO; \
    [ -n "${GUIA_REVISADA_SALUD:-}" ] || unset GUIA_REVISADA_SALUD; \
    [ -n "${DATOS_LICENCIA_NOMBRE:-}" ] || unset DATOS_LICENCIA_NOMBRE; \
    [ -n "${DATOS_LICENCIA_URL:-}" ] || unset DATOS_LICENCIA_URL; \
    pnpm build

# ---------- migrate: job que aplica db/migrations y termina ----------
# Incluye devDependencies (tsx) a propósito: es un job efímero, no se expone.
FROM deps AS migrate
COPY web/package.json web/tsconfig.json ./
COPY web/scripts ./scripts
# los scripts de importación comparten código con la app (normalización de nombres)
COPY web/lib ./lib
COPY db /app/db
# DATABASE_URL llega por entorno. migrate.ts lee ../db/migrations (= /app/db/migrations).
# Para cargar datos: docker compose run --rm -v "$PWD/data:/data" migrate pnpm exec tsx scripts/import-colonias.ts /data/...
CMD ["pnpm", "exec", "tsx", "scripts/migrate.ts"]

# ---------- runner: imagen final, sin devDependencies ni código fuente ----------
FROM node:${NODE_VERSION}-alpine AS runner
ARG APP_VERSION=""
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache libc6-compat \
 && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
WORKDIR /app
# standalone ya trae server.js y solo los node_modules que la app usa
COPY --from=build --chown=app:app /app/web/.next/standalone ./
COPY --from=build --chown=app:app /app/web/.next/static ./.next/static
COPY --from=build --chown=app:app /app/web/public ./public
USER app
EXPOSE 3000
# /api/salud devuelve 503 si la base no responde -> el contenedor queda "unhealthy"
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/salud || exit 1
CMD ["node", "server.js"]
