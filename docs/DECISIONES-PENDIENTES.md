# Decisiones que solo puede tomar una persona

Estas decisiones **no son técnicas**: implican responsabilidad legal, dinero, reputación o criterio sobre salud pública. El equipo técnico (y los agentes que programaron el proyecto) no deben tomarlas por la comunidad. Cada una incluye una **recomendación** y su justificación para que decidir sea rápido, pero la recomendación no es una decisión tomada.

Fecha de este documento: 2026-10-08. Las referencias `[§…]` apuntan a [`research/`](research/). Lo que no se pudo verificar está marcado **SIN VERIFICAR**.

> **Lo que sí bloquea abrir al público:** 1 (responsable legal), 8 (aval de salud, o aviso visible de que no lo hay) y 9 (moderación y contacto). El resto se puede decidir después, pero cada día sin decidir 4 (licencias) significa datos publicados con una licencia solo "provisional".

| # | Decisión | ¿Bloquea el lanzamiento? |
|---|---|---|
| 1 | Quién es el responsable legal | **Sí** |
| 2 | Nombre y dominio | Sí (necesitas uno para publicar) |
| 3 | Dónde se aloja | Sí |
| 4 | Licencias de código y de datos | No, pero la API declara una **provisional** |
| 5 | Proveedor del mapa base | No (hay una opción por defecto) |
| 6 | Qué se hace con el comentario libre | Decidido: se muestra en la colonia (con aviso en el formulario); falta revisión legal del aviso |
| 7 | Cuánto tiempo se conservan los datos | No (hay un valor por defecto) |
| 8 | Aval de un profesional de salud para la guía "Qué hacer" | **Sí**, o aviso visible |
| 9 | Quién modera y el contacto público / apelación | **Sí** |
| 10 | Alianzas con organizaciones y medios | No |
| 11 | Cómo se presenta el mapa frente a cifras oficiales en disputa | Sí (criterio editorial) |
| 12 | Si el mapa se vincula a la asignación de apoyos | Sí (decisión de principio) |
| 13 | Analítica, errores y herramientas de terceros | No |
| 14 | Aviso de privacidad y términos | **Sí** |

---

## 1. Quién es el responsable legal

**Qué decidir:** quién figura como "responsable" del tratamiento de datos y titular de las cuentas (hosting, dominio, base de datos): una persona física, una asociación civil o un colectivo con representante.

**Por qué importa:** la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (nueva ley, DOF 20-mar-2025) exige que el aviso de privacidad indique la identidad y el domicilio del responsable (art. 15, fracción I). Los síntomas del formulario son datos de salud, que la ley trata como sensibles [`despliegue.md` §6.1-6.2]. Además, Vercel Hobby prohíbe el uso comercial y puede considerarse comercial si alguien recibe pago por crear o alojar el sitio [`despliegue.md` §2.3].

**Recomendación:** una asociación civil o un colectivo con un representante identificable, con apoyo de una clínica jurídica universitaria o una organización de derechos digitales para revisar el aviso de privacidad y los términos antes de publicar con nombre propio. Evita que el proyecto dependa de una sola persona: cuentas con al menos dos administradores.

**Justificación:** el riesgo legal más alto no es técnico sino de titularidad (quién responde ante una solicitud de baja, un requerimiento o una queja). La investigación es una lectura técnica de la ley, **no asesoría legal**.

**Qué falta si no se decide:** el aviso de privacidad no se puede completar (`[Nombre del responsable]`, domicilio y correo quedan en blanco) y no se debe publicar.

## 2. Nombre y dominio

**Qué decidir:** nombre público y dominio (por ejemplo, uno `.org.mx` o `.mx`).

**Recomendación:** un nombre neutral y descriptivo (sin eslóganes de campañas), y un dominio propio registrado a nombre del responsable legal (no de una persona que pueda irse). `comunidad.md` recomienda neutralidad: el proyecto no debe asociarse a consignas de ningún actor.

**Justificación:** la confianza es el activo principal; un nombre que se lea como postura política resta credibilidad con autoridades, medios y vecinos.

**Antes de publicar:** actualizar `NEXT_PUBLIC_SITE_URL`, `ORIGENES_PERMITIDOS` y los textos legales.

## 3. Dónde se aloja

**Opciones:** (A) Vercel Pro + Neon Launch, ~USD 40/mes con 10 mil visitas y ~60-65 con 100 mil; (B) VPS con compose detrás de Cloudflare Free, ~5-30/mes; (C) piloto gratuito (Hobby + Neon Free), solo para validar con pocos vecinos. Cifras de `despliegue.md` §8, basadas en supuestos explícitos; revisar precios el día de contratar.

**Recomendación:** **A** para la crisis actual, con topes de gasto y de autoescalado. **B** como plan de contingencia o si el presupuesto no alcanza.

**Justificación:** la crisis es ahora y casi todo el tráfico es lectura cacheable; A absorbe picos sin operación manual y Pro permite uso comercial. B es más barato pero deja parches, TLS, respaldos y monitoreo en manos del equipo, con un solo servidor como punto único de falla. El precio de Hetzner **no se pudo verificar**.

**Sobre el programa de código abierto de Vercel:** existe una convocatoria de patrocinio; no se pudo confirmar criterios ni beneficios. Vale preguntar si el repositorio se publica como software libre [`despliegue.md` §2.3].

## 4. Licencias de código y de datos

**Qué decidir:** (a) licencia del código, (b) licencia de la base de datos exportada (`/api/v1`), (c) cómo se cita a las fuentes de los polígonos.

| Componente | Recomendación | Alternativa |
|---|---|---|
| Código | **AGPL-3.0** | MIT |
| Datos exportados (agregados por colonia) | **ODbL 1.0** | CC BY 4.0 |

**Justificación:**

- **AGPL-3.0:** si otra ciudad despliega una versión modificada como servicio, debe publicar sus cambios; las mejoras vuelven a la comunidad. Útil si el objetivo es que Monterrey, CDMX, etc. reutilicen el proyecto. Algunas áreas de TI de gobiernos evitan AGPL por política: si el objetivo principal es máxima adopción institucional, **MIT** tiene menos fricción pero permite cerrar forks.
- **ODbL 1.0:** es la licencia de OpenStreetMap (cualquier mezcla con datos OSM obliga a ODbL), mantiene abiertas las mejoras a la base y los mapas/notas derivados solo necesitan citar la fuente. **CC BY 4.0** es mejor si la prioridad es que SIAPA, UdeG, la CEDHJ o los medios lo integren sin ninguna obligación de reciprocidad.
- Aclara en el repositorio que **código y datos tienen licencias distintas** y que los polígonos de terceros conservan la suya.

**Estado actual:** la API declara ODbL-1.0 como **provisional** (`metadata.licencia.estado: "provisional"`). Para confirmarla: define `DATOS_LICENCIA_NOMBRE` (y `DATOS_LICENCIA_URL`) y actualiza `info.license` en `web/public/openapi.json`. El repositorio **aún no tiene archivo `LICENSE`**; hay que agregarlo con el texto de la licencia elegida cuando se decida.

**Pendientes de verificación:**

- Los polígonos principales vienen del catálogo de colonias del INE (corte dic-2020) republicado por terceros en datamx.io; la licencia CC0 la declara la ficha de un tercero y **no está confirmada con el INE**; el servidor de esa copia tiene el certificado TLS vencido [`data/raw/README.md`, `geodatos.md`]. Hasta confirmarlo, presenta los límites como aproximados, con atribución, y evalúa si redistribuir la geometría por la API es aceptable para el responsable.
- El shapefile "colonias-mexico" de datamx parece derivado de un producto comercial de códigos postales: **no se usó y no debe redistribuirse**.
- La capa alterna de ITESO/ArcGIS (1,242 colonias del núcleo del AMG) **no declara licencia**: no mezclar con la principal.
- La licencia del dataset oficial del IIEG está **SIN VERIFICAR** (el portal no resolvió DNS durante la investigación). Si el IIEG entrega el archivo oficial, citar su licencia real.
- Si el derecho mexicano protege las bases de datos de forma equivalente al derecho *sui generis* europeo: **SIN VERIFICAR**; consultar a un abogado.
- Licencias de las dependencias: solo se verificó `maplibre-gl` (BSD-3-Clause). Correr `pnpm licenses list` antes de elegir.

## 5. Proveedor del mapa base

**Opciones y estado** [`despliegue.md` §3]: `tile.openstreetmap.org` no sirve para producción (sin SLA, pueden bloquear sin aviso); MapTiler y Stadia gratuitos son solo no comerciales y con cupos bajos; **OpenFreeMap** es gratuito, sin llaves ni cuota publicada, pero **sin SLA**; PMTiles propio en Cloudflare R2 da independencia a costa de trabajo.

**Recomendación:** OpenFreeMap `positron` ahora (el código ya lo usa, configurable con `NEXT_PUBLIC_MAP_STYLE_URL`) y, antes de un evento mediático grande, decidir si se implementa la contingencia: estilo local mínimo que dibuje solo las colonias sobre fondo liso si falla el proveedor (costo cero; el mapa de colonias sigue siendo útil sin calles) y, en una fase 2, un extracto PMTiles de la ZMG en R2. Hacer una donación al proyecto OpenFreeMap si el sitio depende de él.

**Justificación:** el mapa de colonias, no las calles, es el producto. Mantener visible la atribución a OpenStreetMap y OpenMapTiles (la política de OSM prohíbe esconderla).

## 6. Qué se hace con el comentario libre

**Estado:** el comentario (hasta 500 caracteres) se depura al recibirlo (teléfonos, correos, enlaces y @usuarios enmascarados) y **se muestra en la página de la colonia** (solo día y gravedad; solo los enviados después del aviso del formulario, `comentario_publico`); se borra a los 30 días con la tarea de retención.

**Decisión:** ¿se publicará algún día?

**Recomendación:** **no publicarlo** en v1 (y evaluar eliminar el campo si no se usa para moderación). Si algún día se publica: moderación previa, botón de "reportar contenido" y términos claros.

**Justificación:** es la mayor fuente de riesgo (datos personales, acusaciones contra terceros, difamación). Los reportes estructurados (gravedad 1-4 y síntomas de un catálogo) son suficientes para pintar el mapa. Hay una discrepancia entre fuentes sobre si la difamación sigue siendo delito penal en Jalisco: **sin resolver**, requiere revisión legal [`comunidad.md`].

## 7. Cuánto tiempo se conservan los datos

**Estado:** `pnpm purge` anonimiza identificadores y borra comentarios a los 30 días por defecto (mínimo 14, la ventana de cálculo).

**Recomendación:** mantener 30 días para comentarios e identificadores y publicar el plazo en el aviso de privacidad. No exportar nunca `huella` ni los demás identificadores.

**Justificación:** menos retención, menos riesgo en caso de filtración. Aun así, la huella es un **seudónimo, no una disociación**: la frase "no guardamos datos personales" **no es defendible tal cual**; el aviso debe describir con precisión qué se guarda [`despliegue.md` §6.1]. Si un HMAC diario de IP+UA es dato personal bajo la ley: **SIN VERIFICAR**, consultar abogado.

## 8. Aval de un profesional de salud para la guía "Qué hacer"

**Estado:** la guía de contenido (`research/guia-contenido.md`) tiene fuente en cada afirmación, pero:

- La recomendación vigente de Salud Jalisco proviene de medios, no de un comunicado oficial; las notas difieren sobre si recomiendan hervir.
- La dosis de cloro para agua turbia es una conversión de una referencia de los CDC (EE. UU.), no una cifra mexicana.
- No hay fuente oficial sobre cómo y dónde hacerse una prueba de plomo en sangre, ni laboratorios acreditados para agua.
- No se confirmó si PROFECO es competente para quejas contra el SIAPA por calidad del agua.
- Hay teléfonos **SIN VERIFICAR** que no se incluyeron (SIAPA, Salud Jalisco, Protección Civil); el de COPRISJAL sale solo en una ficha posiblemente desactualizada.

**Recomendación:** que un médico/a de salud pública o epidemiólogo/a (por ejemplo, de la UdeG o el ITESO) revise y firme la guía antes del lanzamiento. Mientras tanto, publica solo lo que tiene fuente oficial verificada y mantén visible el aviso "no es consejo médico". **Llamar por teléfono** a los números antes de imprimirlos en carteles.

**Justificación:** es salud pública; equivocarse es peor que omitir. El proyecto dejó fuera todo lo que no pudo verificar.

## 9. Quién modera, y el contacto público / apelación

**Qué decidir:** (a) quién(es) operan `/admin` y en qué turnos, con respaldo; (b) un correo o canal público de contacto; (c) cómo apela alguien que dice "mi reporte no se contó".

**Estado:** no existe canal de apelación (no se inventó ninguno). El panel exige `ADMIN_TOKEN`; el sistema solo puede degradar, ocultar es decisión humana con motivo escrito, y la bitácora es de solo agregado.

**Recomendación:** al menos **dos** moderadores con reglas escritas (OPERACION.md §6), de organizaciones distintas si es posible (una organización ciudadana y una académica) para reducir sospechas de sesgo. Un correo propio del dominio como contacto público, con compromiso de respuesta en un plazo que ustedes puedan cumplir (por ejemplo, 5 días hábiles; el plazo es decisión de ustedes). Publicar cada semana cuántos reportes se degradaron, ocultaron y restauraron, **sin contenido ni identificadores**.

**Justificación:** hay incentivos reales para manipular el mapa (escasez de apoyos: más de 7,500 solicitudes contra unas 4,000 atendidas, según la investigación, y disputa política). La moderación opaca desacredita el mapa más que cualquier ataque.

## 10. Alianzas

**Hallazgo:** ya existe un ecosistema (IMDEC, ITESO, UdeG, CEDHJ, Red de monitoreo vecinal, medios) [`comunidad.md`]. El proyecto debe ser el mapa por colonia que ellos puedan citar, embeber y alimentar, no competir.

**Qué decidir:** con quién hablar primero, en qué términos, y qué se promete.

**Recomendación:** primero **IMDEC e ITESO** (territorio, confianza y método; revisión del lenguaje de riesgo), luego **UdeG** (validación del índice) y **medios** (la API y el CSV existen para ellos). Proponerles enlazar y alimentar, no sustituir su formulario. Quien contacte lo hace en nombre del responsable legal (decisión 1). **Nada de esto se envió**: no se contactó a nadie.

## 11. Cómo se presenta el mapa frente a cifras oficiales en disputa

**Hallazgo:** no hay un número oficial único de colonias afectadas: se citan 243, 475 y 600 según la fuente (CEDHJ, registros oficiales citados por medios, nota de prensa); el gobierno estatal sostiene que no hay alerta sanitaria y las organizaciones piden declararla [`comunidad.md` §1.1].

**Recomendación:** mostrar solo los conteos propios del mapa, con fecha, y citar cada cifra externa **con su fuente y fecha**; la capa externa siempre separada del puntaje ciudadano. Nunca el texto "esta agua es / no es potable". No contar en "colonias afectadas" las colonias con confianza baja. Tono neutral: ni alarmista ni tranquilizador.

**Justificación:** un solo caso de manipulación o de afirmación sin respaldo puede desacreditar el mapa; la transparencia del método es lo que lo protege.

## 12. Vincular o no el mapa a la asignación de apoyos

**Hallazgo:** existe un descuento del 80 % en la tarifa del SIAPA (decreto 30216, hasta el 15 dic 2026, 342 colonias) que se conoce solo por medios y con detalles contradictorios [`guia-contenido.md`]; los apoyos son escasos. Mientras el mapa sea autorreportado, vincularlo a apoyos crea un incentivo fuerte a exagerar [`anti-abuso.md` §12].

**Recomendación:** **no vincular** el mapa a la asignación de apoyos mientras no exista una capa verificada. Si una autoridad quiere usarlo, que sea como una señal para priorizar visitas de verificación, no como un criterio.

## 13. Analítica, errores y herramientas de terceros

**Estado:** el código **no** incluye analítica, pixeles ni servicios de errores.

**Recomendación:** no usar Google Analytics ni pixeles de terceros. Para métricas de uso, medir sin rastreo (conteos de servidor, o una analítica sin cookies si se decide; que Cloudflare Web Analytics no use cookies o huellas **no se pudo verificar**). Un servicio de errores (Sentry tiene plan gratuito) implica una dependencia nueva y decidir qué datos envía: solo si hay quien lo atienda.

**Justificación:** el sitio promete no rastrear; cada tercero rompe esa promesa o exige reflejarla en el aviso.

## 14. Aviso de privacidad y términos

**Estado:** hay borradores en `despliegue.md` §6.2-6.4 (aviso simplificado, descargo, términos), con campos por completar y **sin revisión legal**. Sin verificar: si el consentimiento por clic cumple el "por escrito" del art. 8 para datos sensibles; la regulación estatal de daño moral en Jalisco; el desenlace del caso Richter vs. Google (el riesgo para intermediarios no está cerrado).

**Recomendación:** que un abogado (idealmente de una asociación civil o clínica jurídica universitaria) revise el aviso y los términos con el nombre del responsable ya definido; publicar con fecha y versión. Mantener un correo visible para solicitudes de baja o rectificación (decisión 9).

---

## Orden sugerido para decidir

1. Responsable legal (1) y nombre/dominio (2): desbloquean todo lo demás.
2. Hosting (3) y moderación/contacto (9).
3. Aval de salud (8) y aviso/términos (14), en paralelo con revisión legal.
4. Licencias (4) antes de que terceros empiecen a reutilizar la API.
5. El resto, en cuanto haya quien lo atienda.
