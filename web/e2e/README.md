# Pruebas end-to-end (E2E)

Recorren la aplicación como lo haría una persona (navegador real con [agent-browser](https://www.npmjs.com/package/agent-browser)) y,
donde un navegador no aporta nada, usan `curl` y consultas SQL para comprobar el efecto en la base.

## Cómo correrlas

```bash
docker compose up -d          # PostGIS (puerto 5433)
bash e2e/setup.sh             # base aislada + copia del proyecto + build de producción + servidor en :3300 (~20 s)
bash e2e/run.sh               # toda la suite (~7 min; dos esperas de ~31 s son reales: caché y cooldown)
bash e2e/run.sh api seguridad # solo algunas secciones
bash e2e/setup.sh stop        # apaga el servidor de pruebas
```

Requisitos: `agent-browser` (`npm i -g agent-browser && agent-browser install`), Docker, `python3`, `curl`, `rsync`.

- **No toca tu desarrollo**: usa la base `agua_e2e` y una copia del proyecto en `/tmp/agua-e2e` (Next no permite dos servidores sobre el mismo directorio).
- `run.sh` **borra reportes y límites de tasa** de la base de pruebas; por seguridad se niega a correr si el nombre de la base no contiene `e2e`, `test` o `prueba`.
- Resultados: `e2e/resultados/resultados.tsv` (PASS/FAIL por prueba), `e2e/resultados/shots/` (capturas) y el log de la corrida.
- Variables: `E2E_URL`, `E2E_DB`, `E2E_PG_CONTAINER`, `E2E_ADMIN_TOKEN`, `E2E_PORT`, `E2E_WORK`.

## Secciones

| Clave | Qué cubre |
|---|---|
| `carga` | título, h1, `lang`, canvas WebGL, errores de consola/página, resumen inicial |
| `busqueda` | combobox: mínimo 2 letras, acentos, sin coincidencias (mensaje visible), URL `?colonia=` |
| `lista` | filtro por municipio contra el conteo real de la base, vista Lista/Mapa, paginación |
| `compartir` | enlace profundo `?colonia=ID`, enlace de WhatsApp, ids inválidos |
| `externos` | bloque «Reportes publicados» con fuente enlazada; capa del mapa por cantidad de reportes (API; leyenda sin bloque propio) |
| `reporte` | flujo completo en el navegador: enviar, saneo de teléfono/correo, no se guarda IP, cooldown de 30 s, actualización, tope de 3 colonias/día |
| `nivel` | el nivel solo se publica con evidencia (30 reportes/10 redes sí; 40 reportes de una sola red no), panel, serie de 30 días |
| `errores` | API caída, Reintentar, offline conserva lo escrito, «Mi ubicación» (permiso denegado real; posición simulada dentro/fuera de la ZMG) |
| `paginas` | las 6 páginas informativas en 1366 y 390 px: un h1, sin desbordamiento, aviso «no oficial», contenido clave, navegación, 404 |
| `movil` | panel como hoja inferior, áreas táctiles ≥ 44 px, lista no tapada |
| `a11y` | nombres accesibles, landmarks, etiquetas, foco, aria-live, señuelo oculto, color no es la única señal |
| `privacidad` | sin cookies ni localStorage para visitantes; solo se contacta al servidor propio y al mapa base |
| `api` | `/api/salud`, geometría (filtros, gzip), `/api/colonias/[id]`, `/api/v1` (CORS, licencia, CSV sin huellas), openapi, manifest, OG |
| `seguridad` | validación (400/404/413/415/405), Origin cruzado, honeypot y tiempo mínimo, cupos por huella, X-Forwarded-For falso, inyección SQL, cabeceras de seguridad |
| `admin` | login (token malo/bueno), cookie HttpOnly/SameSite/Secure, ocultar con motivo y confirmación, restaurar, bitácora inmutable, cerrar sesión |
| `purga` | `pnpm purge` anonimiza a los 30 días y es idempotente |

## Límites conocidos de estas pruebas

- Corre en **Chromium headless**: no sustituye pruebas en Safari/iOS ni en teléfonos Android reales.
- **«Mi ubicación»**: el navegador de pruebas deniega el permiso aunque se le conceda por CDP. Se prueba el rechazo real y, para el caso aceptado, se **simula** la posición dentro de la página (se ejercita la lógica de la app, no el diálogo de permiso del navegador).
- La accesibilidad es una revisión básica por reglas (nombres, etiquetas, landmarks, foco); **no es una auditoría completa** ni reemplaza lectores de pantalla reales ni contraste medido.
- Sin prueba de carga ni de rendimiento en teléfonos modestos.
- Los datos de nivel se siembran por SQL (la agregación usa caché «stale-while-revalidate» de 30 s, de ahí la espera de 32 s).
- La defensa anti-abuso se prueba contra el handler real, no contra un proxy/CDN/TLS reales.
