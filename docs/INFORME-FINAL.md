# Informe final de verificación: Agua ZMG

> **Nota posterior (2026-10-09).** Este informe es histórico y se conserva tal como se escribió. Después se retiró todo lo «demo» del producto (datos, columna, fuente, `seed:demo`, opciones del importador y parámetros de la API) y se agregó la migración `006_quitar_demo.sql` (después llegaron más: la lista vigente está en `db/migrations/`). Las menciones a datos demo y a `seed:demo` más abajo describen lo que se hizo ese día y ya no aplican. Los comandos vigentes están en el apéndice y en el [README](../README.md). Tampoco aplican ya la escala 1 a 4 (desde el método v3 es 0 a 4) ni la tarea diaria de `pnpm purge` (desde el 2026-10-21 se conserva todo; ver [OPERACION.md](OPERACION.md) §4).

Fecha: 2026-10-08. Verificación desde cero en una base propia (`agua_final`, PostGIS en Docker, puerto 5433), servidor de producción en el puerto 3199.

**Conclusión corta:** el proyecto compila, pasa todas las pruebas automáticas y funciona de punta a punta en modo producción con datos reales de colonias. **No está listo para abrirse al público todavía**: faltan decisiones humanas (responsable legal, contacto, aval de salud), las variables de entorno de producción, y hay límites conocidos de la defensa anti-abuso (sección 5). Nada de lo que se describe aquí se ha desplegado, publicado ni enviado a nadie, y no se hizo `git commit`/`push`.

> Lo que muestra el mapa son reportes de vecinos sin verificar. No es información oficial ni consejo médico. Los datos demo (`demo=true`) no se mezclan con los reales.

---

## 1. Qué se construyó (por área)

**Aplicación (`web/`, Next.js 16.4, App Router, Tailwind 4, MapLibre, pg, zod)**
- Mapa en `/`: 2,170 colonias coloreadas por gravedad (1 a 4) con patrones además de color, búsqueda, selección por municipio, vista de lista, "Mi ubicación", panel de detalle con serie de 30 días, y formulario de reporte anónimo. Una colonia solo se pinta con evidencia suficiente; si no, queda en gris.
- Páginas informativas: `/que-hacer`, `/denunciar`, `/metodologia`, `/datos`, `/privacidad`, `/acerca`. `/privacidad` y `/acerca` se declaran a sí mismas como borrador y sin canal de contacto (no inventan correo ni responsable).
- Open Graph dinámico, manifest, íconos, cabeceras de seguridad (CSP, HSTS, etc.) en `proxy.ts`.

**Datos**
- 5 migraciones SQL versionadas (`db/migrations/001` a `005`), importador de polígonos idempotente (`import:colonias`), importador de datos externos con vinculación por nombre y nivel de confianza (`import:oficial`), `seed:demo` para desarrollo.
- Endpoints: `/api/colonias/geometria`, `/api/colonias/[id]`, `/api/oficial`, `/api/oficial/resumen`.

**Seguridad y anti-abuso**
- `POST /api/reportes` con validación (zod), comprobación de Origin, honeypot, tiempo de formulario, huellas con HMAC (la IP y el User-Agent completo no se guardan), límites de tasa, detección de ráfagas, moderación con bitácora, modo de ataque y límite global.
- Agregación v1 (`lib/aggregation.ts`): decaimiento, media recortada, prior acotado, mínimo de evidencia y huellas distintas, confianza baja/media/alta.
- Panel `/admin` con `ADMIN_TOKEN` (sesión por cookie `HttpOnly`, `SameSite=Strict`).
- `pnpm purge` (retención/anonimización) y `scripts/simular-ataques.ts`.

**Infraestructura y API pública**
- `GET /api/salud` (con chequeo real de base), API abierta `/api/v1` (GeoJSON, detalle, CSV agregado sin huellas ni comentarios), CORS abierto, caché, licencia declarada (ODbL-1.0, marcada **provisional**), `public/openapi.json`.
- `web/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `.github/workflows/ci.yml` (no ejecutados aquí; ver sección 8).
- Documentación: `README.md`, `CONTRIBUTING.md`, `docs/API.md`, `DEPLOY.md`, `OPERACION.md`, `DECISIONES-PENDIENTES.md`, `docs/research/*`.

---

## 2. Cobertura real de datos

Medido en `agua_final` después de importar `data/` (no son estimaciones).

**Colonias (polígonos)**
- **2,170 colonias reales, 0 demo.** Fuente: catálogo de colonias del INE, corte 11-dic-2020, republicado por terceros (`fuente_geom = ine_colonias`). Límites **aproximados y no oficiales**; faltan colonias posteriores a 2020 (sobre todo Tlajomulco, Zapopan norte, Tonalá, El Salto). No es el dataset del IIEG (no se pudo obtener).
- Por municipio: Zapopan 710, Tlajomulco de Zúñiga 348, Tonalá 332, Guadalajara 295, San Pedro Tlaquepaque 269, El Salto 107, Zapotlanejo 55, Ixtlahuacán de los Membrillos 32, Juanacatlán 22.
- Calidad del import: 0 geometrías inválidas, 0 vacías, 0 sin municipio; 220 polígonos con nombre repetido en el municipio, desambiguados; 23 polígonos anidados; 1 solape grave (Residencial Jade x San Agustin, Tlajomulco, 91 %).
- El sembrado demo creó 252 colonias falsas; el import real las quitó (`--quitar-demo`). Consecuencia visible: los ids reales de esta base empiezan en 253.

**Datos externos (`data/oficial/`, tres CSV)**
- 703 filas importadas, 0 rechazadas. Por ámbito: 679 de colonia, 4 de municipio, 20 de la ZMG completa.
- **Vinculadas a una colonia: 387 filas, en 276 colonias distintas (12.7 % de las 2,170).** Confianza del vínculo: **alta 367, media 11, baja 9.** Colonias con dato por municipio: Guadalajara 119, Zapopan 82, Tlaquepaque 60, Tonalá 15. **Los otros 5 municipios no tienen ninguna.**
- **No vinculadas: 292 filas de colonia** (248 sin coincidencia razonable, 44 por nombre repetido en el municipio). No se fuerzan; quedan en `data/oficial/no_vinculadas.csv`.
- Por tipo de fuente (filas vinculadas): oficial 324, ciudadana 54, periodística 8, académica 1.
- Año: 681 filas de 2026, 16 de 2025, 6 de 2020 (laboratorio privado, fuera de la ventana).
- **Casi todo es "reporte de calidad deficiente" (348 filas vinculadas), es decir listados administrativos, no mediciones.** Solo **3 filas vinculadas a colonia traen valor numérico** (2 de turbiedad, 1 de color). Hay 39 filas vinculadas de contaminantes u otros parámetros (plomo, mercurio, aluminio, fluoruros, nitritos, E. coli, coliformes) pero sin cifra por colonia: la fuente solo dice "detectado".
- Fuentes principales (ver `data/oficial/FUENTES.md`): listado de 342 colonias del SIAPA con descuento (30-sep-2026, leído en prensa, no en el Periódico Oficial), listado de la CEDHJ (236 filas tras fusionar duplicados), informe IMDEC/ITESO de monitoreo ciudadano con tira reactiva (orientativo, no laboratorio acreditado). Giardia y microcistinas **no** están confirmadas por ninguna fuente cargada y por eso no hay filas de ellas.
- La app muestra estos datos **aparte** del puntaje ciudadano, con su fuente y URL. No se verificó de nuevo cada URL en esta ronda: la verificación es la de quien compiló `FUENTES.md`.

**Reportes ciudadanos:** 0 reales (el proyecto no está publicado). En la base de prueba hay unos 15 reportes que yo generé para probar; no representan nada.

---

## 3. Resultados de las pruebas

Todo lo siguiente se corrió realmente en esta sesión.

| Comprobación | Resultado |
|---|---|
| Base `agua_final` creada vacía, `pnpm migrate` | 5 migraciones aplicadas |
| `pnpm seed:demo` | 252 colonias demo |
| `pnpm import:colonias ... --quitar-demo` | 2,170 nuevas, 0 inválidas |
| `pnpm import:oficial --todos` | 703 importadas, 0 rechazadas |
| `tsc --noEmit` | 0 errores (código de salida 0) |
| `pnpm lint` | 0 errores. Al inicio daba **1,082 advertencias**, todas del archivo minificado copiado `public/maplibre/maplibre-gl-worker.mjs`; se corrigió (sección 6). Ahora 0 advertencias |
| `pnpm test` (vitest) | **33 archivos, 610 pruebas, 610 pasan, 0 fallan**, 55 s. Por proyecto: unit 96, api (integración con base propia) 289, tlib (librerías y scripts) 225. Repetido tras mis cambios: mismo resultado |
| `pnpm build` | Compila (Turbopack, Cache Components). Rutas estáticas: `/`, 6 informativas, manifest, OG; dinámicas: toda la API y `/admin` |
| Servidor de producción (`next start`, y también `node .next/standalone/server.js` con `.next/static` y `public` copiados) | Ambos responden. `next start` avisa que no es lo adecuado con `output: standalone`; el standalone funciona |

**Prueba de humo con curl (producción, puerto 3199)**

| Ruta | Resultado |
|---|---|
| `/`, `/que-hacer`, `/denunciar`, `/metodologia`, `/datos`, `/privacidad`, `/acerca`, `/admin` | 200 |
| `GET /api/salud` | 200 `{"ok":true,"db":true,"version":"0.1.0"}` |
| `GET /api/colonias/geometria` | 200, FeatureCollection de 2,170 features, `id` numérico, properties `{id,nombre,municipio,demo,fuente_geom}`, todas `demo:false`. 1.37 MB (298 KB con gzip) |
| `GET /api/colonias/scores` | 200; solo devuelve colonias que alcanzan el mínimo publicable (con 0 reportes: `[]`) |
| `GET /api/colonias/[id]` | 200 con `reportes` y `oficial` (con `confianza_vinculo`); 404 si no existe; 400 si el id no es número |
| `POST /api/reportes` | 201 creado; 400 inválido (gravedad 9, síntoma fuera de catálogo, JSON roto); 404 colonia inexistente; 429 por límite; 405 en GET. Honeypot lleno y `tiempo_ms` 50 responden 201 y quedan marcados `sospechoso`, sin contar |
| `GET /api/v1`, `/api/v1/colonias`, `/api/v1/colonias/[id]`, `/api/v1/resumen.csv`, `/openapi.json` | 200; cabeceras `access-control-allow-origin: *`, `x-licencia: ODbL-1.0`, `cache-control` público; `OPTIONS` responde 204 |
| Privacidad de la API | Las respuestas públicas solo contienen `n_huellas` (un conteo); no aparecen huellas, red, User-Agent ni comentarios |
| `/api/admin/*` sin sesión | 401; con token incorrecto 401; con el token de prueba 200 y cookie `HttpOnly; SameSite=Strict; Secure` |

Desviaciones menores del contrato (no rompen nada, pero conviene saberlo): en `GET /api/colonias/[id]`, una colonia sin reportes devuelve `reportes.n: null` y `n_huellas: null` (el contrato dice número); los scores se cachean hasta 60 s en el servidor, así que un reporte nuevo tarda hasta un minuto en reflejarse.

**Navegador.** La extensión de Chrome no estaba conectada (falló dos veces), así que usé `agent-browser` (un Chrome/Chromium controlado por línea de comandos, con WebGL funcionando). Capturas en `docs/capturas-finales/` (17 PNG).
- Mapa en 390 px y 1366 px: carga, dibuja los polígonos, leyenda con patrones, colonia con reportes pintada.
- Las 6 páginas informativas en 390 px y 1366 px: sin desbordamiento horizontal (`scrollWidth == clientWidth`), sin errores de página, cada una con su `<h1>` y título.
- Flujo real en móvil: buscar "Jardines del Valle" → seleccionar → panel con nivel, confianza, serie y datos externos → "Reportar" → elegir gravedad y síntoma → enviar. El reporte llegó a la base (`canal=web`, `tiempo_ms` medido por el navegador, no sospechoso).
- **No probado:** Safari/iOS y Android reales, "Mi ubicación" (geolocalización), compartir por WhatsApp, el panel `/admin` en pantalla (solo por curl), lectores de pantalla y auditoría de accesibilidad, rendimiento en teléfonos modestos con 2,170 polígonos, consola del navegador en detalle. La CSP incluye `upgrade-insecure-requests`; sobre `http://localhost` funcionó, pero detrás de HTTPS real no se probó.

**`pnpm purge`.** Con 0 reportes viejos no hace nada. Para probarlo de verdad envejecí 7 reportes a 40 días en mi base: anonimizó 7 (huella, red y User-Agent a NULL), borró 5 comentarios, y una segunda corrida no cambió nada (idempotente).

---

## 4. Escenarios de ataque (`scripts/simular-ataques.ts`)

Se corrieron en una base desechable aparte (`agua_final_sim`, ya borrada), contra el handler real de `POST /api/reportes`. Código de salida 0. Línea base: colonia de 6 vecinos con gravedad leve (score 1.25). "Método anterior" es un promedio simple con decaimiento, para comparar.

| Escenario | Resultado HTTP | Efecto en el score v1 (anterior) | Veredicto |
|---|---|---|---|
| S1 200 reportes "críticos", una red rotando User-Agent | 201 x120, 429 x80 | 1.25 → 1.25 (3.87) | Contenido: 120 en revisión |
| S2 mismo dispositivo reenvía 200 veces | 201 x1, 429 x199 | 1.25 → 1.22 (1.47) | Contenido |
| S3 120 redes distintas, mismo navegador, formulario de 3 s | 201 x120 | **1.25 → 3.94** (3.87), confianza baja | **No contenido** (ver abajo) |
| S4 100 bots con honeypot lleno | 201 x100 | 1.25 → 1.25 (3.85) | Contenido: marcados, no cuentan |
| S5 100 bots con formulario en 200 ms | 201 x100 | 1.25 → 1.25 (3.85) | Contenido |
| S6 atacante sofisticado: 60 redes, navegadores variados, tiempos humanos | 201 x60 | **1.25 → 3.94** (3.76), confianza baja | **Límite conocido**: indistinguible de 60 vecinos; un moderador humano lo revierte (vuelve a 1.25) |
| S7 crisis real: 40 vecinos distintos en una hora | 201 x40 | no publicable → 2.95 (3.20) | Correcto: la ráfaga orgánica no se castiga |
| S8 9 colonias en paralelo con la misma huella | 201 x3, 429 x6 | sin cambio | Contenido (cupo de 3 colonias/día) |
| S9 otro sitio web / formas inválidas | 400, 403 x2, 413, 415 | sin cambio | Contenido |
| S10 falsificar X-Forwarded-For | 201 x30 | 1.25 → 1.25 (3.55) | Contenido: se cuenta la IP de la derecha; 30 en revisión |
| S11a ataque lento, 1 por día x 14 días, misma red | (modelo) | 1.25 → 1.35 (2.79) | Contenido por tope semanal por red |
| S11b ataque lento, 14 redes distintas | (modelo) | 1.25 → **2.90** (2.79) | **Límite conocido**: indistinguible de 14 vecinos reales |

El método v1 es mejor que el anterior en S1, S2, S4, S5, S10 y S11a; empata en S3, S6 y S11b.

**Hallazgo principal, NO corregido (S3).** Una botnet con IP distinta por envío, un mismo tipo de navegador y 3 s de formulario (por encima del umbral de 2 s) cuenta completa y mueve el color de 1 a 4. El detector de ráfagas **sí la ve** (señales `ua_homogeneo` y `formulario_rapido`), pero el diseño actual no degrada reportes cuando "ninguno es atribuible a una red concentrada" ("no se castiga a nadie a ciegas") y solo escribe un `console.warn`. La confianza queda en "baja" (color tenue, no cuenta como "afectada"), pero el color sí cambia. Mitigación existente: moderación humana en `/admin`. Mitigación recomendada: alerta activa al moderador cuando una ráfaga queda sin atribuir (no hay aviso por correo/chat; la documentación operativa dice que el panel muestra alertas, pero el aviso depende de que alguien lo revise) y, si se quiere, una regla para degradar ráfagas con `ua_homogeneo` + `formulario_rapido` simultáneas. Es una decisión de diseño con costo (falsos positivos en una crisis real), por eso no la cambié.

Otras observaciones de la simulación y las pruebas:
- Un POST **sin cabecera Origin y sin `tiempo_ms`** (cliente no navegador, p. ej. curl) se acepta y **sí cuenta** (lo comprobé: quedó visible, `ua_familia = otro-otro`). Los límites de tasa y la detección de ráfagas lo siguen cubriendo, pero la defensa de "tiempo de formulario" solo aplica si el cliente declara el tiempo. Es el comportamiento diseñado (clientes sin navegador permitidos), no un bug, pero es una puerta.
- Los umbrales son valores iniciales razonados, **no calibrados con tráfico real**.
- Las simulaciones pasan por el handler, no por la red: no miden el comportamiento con proxy, TLS ni CDN reales.

---

## 5. Riesgos conocidos

1. **Defensa anti-abuso**: S3, S6 y S11b arriba. Un atacante que aparente ser muchos vecinos mueve el color; se depende de moderación humana y de que el color con confianza baja se vea tenue.
2. **Datos de salud en el formulario** (síntomas): son datos sensibles según la ley mexicana. El aviso de privacidad es un borrador sin responsable ni domicilio y sin revisión legal. Publicar sin eso es un riesgo legal.
3. **Límites de colonias aproximados** (INE 2020): una colonia nueva no existe en el mapa; una colonia puede quedar con límites equivocados. El mapa lo dice, pero la gente reclamará.
4. **Cobertura de datos externos baja y desigual**: 12.7 % de colonias con algún dato, 5 municipios con cero, y casi todo son listados, no mediciones. Mostrar "sin dato" no debe leerse como "agua buena" (el texto lo advierte).
5. **Fuentes con calidad desigual**: el listado de 342 colonias del SIAPA y el de la CEDHJ están leídos en prensa, no en documento oficial; el monitoreo IMDEC/ITESO es semicuantitativo y su informe cita límites que no coinciden con la NOM-127-SSA1-2021 del DOF.
6. **Contenido de salud** (`/que-hacer`, `/denunciar`) sin aval de un profesional de salud (decisión 8, bloquea el lanzamiento). Los teléfonos de `/denunciar` coinciden con `docs/research/guia-contenido.md`, que lista fuente por cada uno y marca como "SIN VERIFICAR" los que no se pudieron confirmar (esos están excluidos de la página). **Yo no volví a llamar ni a abrir cada fuente en esta ronda.**
7. **Dependencia del mapa base** de OpenFreeMap sin SLA (hay variable para cambiar el estilo).
8. **Caché de Turbopack obsoleta** (ver sección 6, hallazgo 3): un build local sobre `.next` viejo puede salir sin estilos.
9. **Sin prueba de carga** ni de recuperación; no hay servicio de errores integrado (ver `OPERACION.md`).
10. **Open Graph apunta a `http://localhost:3000`** si no se define `NEXT_PUBLIC_SITE_URL` al construir (el build lo avisa, 8 veces).
11. **Sin archivo `LICENSE`** en el repositorio y la licencia de datos es "provisional"; `web/README.md` sigue siendo el de `create-next-app`.
12. **Licencia de los polígonos** (CC0 declarada por un tercero) sin confirmar con el INE.
13. **Rendimiento**: la geometría completa pesa 1.4 MB (298 KB comprimido) y `/api/v1/colonias` 1.4 MB sin comprimir; no medí cómo se comporta en un teléfono modesto con conexión lenta.

---

## 6. Hallazgos corregidos y no corregidos

**Corregidos (cambios mínimos)**
1. `web/eslint.config.mjs`: se agregó `public/maplibre/**` a los ignorados. Ese archivo es de terceros, minificado y se regenera con `pnpm copy:maplibre`; producía 1,082 advertencias que ocultaban cualquier advertencia real. Ahora `pnpm lint` sale limpio.
2. `web/components/AguaApp.tsx` y `web/app/opengraph-image.tsx`: el resumen decía "1 colonias con nivel publicado" (concordancia) y "N en nivel moderado o más", cuando en realidad el cálculo excluye las de confianza baja. Ahora dice "1 colonia…" y "…en nivel moderado o más con confianza media o alta". Revalidado con `tsc`, `lint` y las 610 pruebas. **No reconstruí el build después de este cambio** (ver nota abajo), así que las capturas muestran el texto anterior.

**Encontrados y resueltos sin cambio de código**
3. **Caché de Turbopack obsoleta.** El primer `pnpm build` dejó un CSS que no contenía nada de `globals.css` (usaba el de la plantilla original de create-next-app): las páginas informativas salían sin estilos y `/datos` se desbordaba a 738 px en un teléfono de 390 px, y el mapa sin patrones en la leyenda. `rm -rf .next` y un build limpio lo resolvieron (verificado: el CSS contiene `.prosa` y los patrones, y el desbordamiento desapareció). La causa probable es una caché persistente de un build anterior a la reescritura de `globals.css`; **no pude confirmar la causa raíz**. En Docker o CI (sin caché previa) no debería ocurrir, pero conviene que el despliegue siempre construya limpio.

**No corregidos**
- S3 / S6 / S11b (sección 4). Requieren una decisión de diseño.
- POST sin `tiempo_ms` ni Origin cuenta (sección 4).
- `reportes.n` y `n_huellas` en `null` (no 0) para colonias sin reportes; desviación leve del contrato.
- `next start` avisa que no corresponde con `output: standalone`; usar `node .next/standalone/server.js` (verificado).
- Falta `LICENSE`, `web/README.md` de plantilla, textos legales y de contacto en borrador (decisiones humanas).
- La cookie de `/admin` lleva `Secure`: solo funciona por HTTPS; no probé el panel en un navegador sobre HTTP (sí por curl). En un despliegue real con HTTPS no debe haber problema, pero **no lo probé**.

**Incidente mío.** Para detener mi servidor usé un `pkill` demasiado amplio y apagué un servidor de desarrollo (`next dev -p 3000`) que no era mío y que corría desde antes. Alguien lo volvió a levantar a las 17:46; no lo toqué más. Pido disculpas: si perdió un estado de trabajo, ese fue el motivo.

---

## 7. Dependencias solicitadas por agentes y no instaladas

No recibí ninguna solicitud de dependencias de otros agentes en esta tarea (no veo sus reportes), así que no puedo listarlas; si las hubo, no se instalaron. No ejecuté `pnpm add` ni `pnpm install`. Lo que sí encontré en los documentos como posibles añadidos futuros, **no instalados**: un servicio de errores (Sentry, `OPERACION.md`) y una herramienta de carga (`k6` o `autocannon`, ajena al repo). El árbol no tiene dependencias nuevas respecto al `package.json` existente.

---

## 8. No verificado en esta ronda

- Build de las imágenes Docker (`web/Dockerfile`, `docker-compose.prod.yml`) y la CI de GitHub: no las ejecuté. Solo comprobé que el modo standalone que usa el Dockerfile arranca y sirve.
- Despliegue en Vercel, Cloudflare, dominio, TLS, `TRUSTED_PROXY_HOPS` real detrás de un proxy.
- Que `pnpm migrate` actualice correctamente una base ya poblada (solo probé desde cero; hay pruebas automáticas de migración que pasaron).
- Veracidad independiente de cada fila y URL de `data/oficial/` y de cada afirmación de salud.

---

## 9. Siguientes pasos, por prioridad, para ponerlo en producción

**Bloquean el lanzamiento (decisiones humanas, `docs/DECISIONES-PENDIENTES.md`)**
1. Definir al **responsable legal** y completar el aviso de privacidad (nombre, domicilio, correo), con revisión jurídica. Hoy trata datos de salud.
2. Publicar un **canal de contacto y de apelación** y quién modera (decisión 9). Hoy `/acerca` dice que no existe.
3. **Aval de un profesional de salud** para `/que-hacer`, o dejar visible que no lo hay (decisión 8). Revisar ahí qué teléfonos aparecen.
4. Elegir hosting, nombre y dominio (decisiones 2 y 3).

**Técnicos, antes del primer despliegue**
5. Definir variables de producción: `DATABASE_URL`, `HASH_SALT` (≥ 32 caracteres aleatorios, nuevo), `ADMIN_TOKEN`, `NEXT_PUBLIC_SITE_URL` (se incrusta en el build), `TRUSTED_PROXY_HOPS` (probarlo con un proxy real), `ORIGENES_PERMITIDOS`.
6. Construir **limpio** (sin caché `.next`), correr `pnpm migrate`, importar `import:colonias` e `import:oficial`, y comprobar `SELECT count(*) FROM colonias WHERE demo;` = 0.
7. Programar `pnpm purge` a diario y un monitor sobre `/api/salud`.
8. Reconstruir y volver a tomar las capturas después de los cambios de texto de esta ronda; probar en un teléfono real (iOS y Android) incluido "Mi ubicación".
9. Prueba de carga básica y verificar que los GET cacheados no tocan la base.
10. Operación del anti-abuso: poner **una alerta activa** de ráfaga sin atribuir (correo o chat) y ensayar una semana en modo sombra para calibrar umbrales; decidir si se degradan ráfagas del tipo S3.
11. Elegir y agregar un archivo `LICENSE`; confirmar la licencia de datos (ODbL u otra), definir `DATOS_LICENCIA_*` y actualizar `public/openapi.json`; confirmar con el INE la licencia de los polígonos.
12. Reemplazar `web/README.md` de plantilla por un enlace al README de la raíz.

**Mejora de contenido y cobertura (después de abrir)**
13. Ampliar datos externos: leer los listados que solo se conocen por cifras (segundo y tercer listado de la CEDHJ, informe IMDEC de octubre) y los municipios sin cobertura; revisar `vinculos_a_revisar.csv` y `no_vinculadas.csv` (292 filas sin colonia).
14. Cartografía más reciente (IIEG u otra) para las colonias posteriores a 2020.
15. Servicio de errores y analítica sin rastreo, si hay quien los atienda.

---

## Apéndice: reproducir esta verificación

```bash
docker exec agua-zmg-db-1 psql -U agua -d postgres -c "CREATE DATABASE agua_final"
cd web && export DATABASE_URL=postgres://agua:agua@localhost:5433/agua_final
pnpm migrate
pnpm import:colonias ../data/colonias_zmg.geojson --fuente-geom ine_colonias
pnpm import:oficial --todos --sin-salida     # --sin-salida: no reescribe no_vinculadas.csv
pnpm exec tsc --noEmit && pnpm lint && pnpm test
rm -rf .next && pnpm build                   # construir limpio
HASH_SALT=<32+ caracteres> ADMIN_TOKEN=<16+ caracteres> NODE_ENV=production pnpm exec next start -p 3199
# ataques (SOLO en una base desechable distinta):
DATABASE_URL=.../agua_sim pnpm exec tsx scripts/simular-ataques.ts --confirmo-base-desechable
```

La base `agua_final` quedó en el contenedor para que la revises (datos reales de colonias y externos, más ~16 reportes de prueba míos). Puedes borrarla con `DROP DATABASE agua_final`. La base `agua_zmg` no se tocó.
