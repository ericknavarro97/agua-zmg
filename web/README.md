# Agua ZMG: aplicación web

Mapa ciudadano de la calidad del agua en la Zona Metropolitana de Guadalajara. Los vecinos reportan cómo llega el agua a su colonia, el mapa pinta cada colonia según esos reportes, y se complementa con datos externos (siempre aparte, con su fuente original) y una guía de qué hacer. Es **percepción de vecinos, sin verificar**: no es información oficial ni consejo médico.

Esta carpeta es la aplicación (Next.js 16, App Router, Tailwind 4, MapLibre, PostgreSQL/PostGIS). Para el panorama completo, léete el [README de la raíz](../README.md).

> Next.js 16 tiene cambios incompatibles respecto a lo que quizá conoces (por ejemplo `proxy` en vez de `middleware`). Lee [`AGENTS.md`](AGENTS.md) antes de escribir código.

## Correr en local

Requisitos: Node.js 20.9 o superior, [pnpm](https://pnpm.io) y Docker.

```bash
docker compose up -d                  # desde la raíz del repo: PostGIS en localhost:5433
cd web
cp .env.example .env.local            # y revisa los valores
pnpm install
pnpm migrate                          # aplica db/migrations/*.sql (001 a 009)
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias
pnpm import:oficial --todos           # datos externos con su fuente
pnpm dev                              # http://localhost:3000
```

Los textos que solo puede aportar quien responde por el proyecto (contacto, responsable, revisiones, licencia) vienen de variables de entorno que se leen **al construir**; mientras faltan, las páginas lo dicen con honestidad. Ver [`.env.example`](.env.example).

## Scripts principales

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Desarrollo, build de producción y servidor |
| `pnpm test` | Pruebas unitarias y de API (vitest) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm e2e:setup` / `pnpm e2e` | Preparan y corren las pruebas de extremo a extremo |
| `pnpm migrate` | Aplica las migraciones SQL pendientes |
| `pnpm import:colonias`, `pnpm import:oficial` | Importan polígonos de colonias y datos externos (idempotentes; prueba antes con `--dry-run`) |
| `pnpm purge` | Anonimiza identificadores y borra comentarios viejos. **No está programado**: hoy se conserva todo (docs/OPERACION.md §4) |

## Más

- [README de la raíz](../README.md): qué hace, arquitectura, método de cálculo, privacidad y API.
- [`docs/DEPLOY.md`](../docs/DEPLOY.md): despliegue y la sección «Antes de publicar».
- [`docs/OPERACION.md`](../docs/OPERACION.md) y [`CONTRIBUTING.md`](../CONTRIBUTING.md).
