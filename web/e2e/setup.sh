#!/usr/bin/env bash
# Prepara una instancia AISLADA para las pruebas E2E: base propia, copia del proyecto, build de producción
# y servidor en otro puerto. No toca tu base de desarrollo ni tu `pnpm dev`.
#
#   bash e2e/setup.sh          # crea/reconstruye todo y arranca el servidor
#   bash e2e/setup.sh stop     # detiene el servidor de pruebas
#
# Variables: E2E_PORT (3300), E2E_DB (agua_e2e), E2E_PG_CONTAINER (agua-zmg-db-1), E2E_WORK (/tmp/agua-e2e),
#            E2E_ADMIN_TOKEN, E2E_HASH_SALT
set -euo pipefail
PORT=${E2E_PORT:-3300}
DB=${E2E_DB:-agua_e2e}
PGC=${E2E_PG_CONTAINER:-agua-zmg-db-1}
WORK=${E2E_WORK:-/tmp/agua-e2e}
ADMIN_TOKEN=${E2E_ADMIN_TOKEN:-e2e-admin-token-123456}
HASH_SALT=${E2E_HASH_SALT:-e2e-salt-0123456789abcdef0123456789abcdef0123456789}
DB_URL=postgres://agua:agua@localhost:5433/$DB
WEB=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$WEB/.." && pwd)

case "$DB" in *e2e*|*test*|*prueba*) ;; *) echo "E2E_DB debe contener e2e, test o prueba"; exit 2;; esac

if [ "${1:-}" = "stop" ]; then
  [ -f "$WORK/server.pid" ] && kill "$(cat "$WORK/server.pid")" 2>/dev/null || true
  lsof -ti ":$PORT" | xargs kill 2>/dev/null || true
  echo "servidor de pruebas detenido"; exit 0
fi

mkdir -p "$WORK"
bash "$0" stop >/dev/null 2>&1 || true

echo "1/5 base $DB"
docker exec "$PGC" psql -U agua -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB" >/dev/null
( cd "$WEB" && DATABASE_URL=$DB_URL pnpm migrate >/dev/null \
  && DATABASE_URL=$DB_URL pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias >/dev/null \
  && DATABASE_URL=$DB_URL pnpm import:oficial --todos --sin-salida >/dev/null )

echo "2/5 copia del proyecto en $WORK/web"
mkdir -p "$WORK/web"
rsync -a --delete --exclude node_modules --exclude .next --exclude .git --exclude e2e/resultados --exclude public/maplibre "$WEB/" "$WORK/web/"
rsync -a --delete "$ROOT/db" "$WORK/"

echo "3/5 dependencias"
( cd "$WORK/web" && { pnpm install --offline --frozen-lockfile >/dev/null 2>&1 || pnpm install --frozen-lockfile >/dev/null; } && pnpm copy:maplibre >/dev/null )

echo "4/5 build de producción (limpio)"
( cd "$WORK/web" && rm -rf .next && NEXT_PUBLIC_SITE_URL=http://localhost:$PORT pnpm build >"$WORK/build.log" 2>&1 ) || { tail -20 "$WORK/build.log"; exit 1; }

echo "5/5 servidor en :$PORT"
cd "$WORK/web"
DATABASE_URL=$DB_URL HASH_SALT=$HASH_SALT ADMIN_TOKEN=$ADMIN_TOKEN NEXT_PUBLIC_SITE_URL=http://localhost:$PORT NODE_ENV=production \
  nohup pnpm exec next start -p "$PORT" >"$WORK/server.log" 2>&1 &
echo $! > "$WORK/server.pid"
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/api/salud" >/dev/null && { echo "listo: http://localhost:$PORT"; exit 0; }; sleep 1; done
echo "el servidor no respondió; revisa $WORK/server.log"; exit 1
