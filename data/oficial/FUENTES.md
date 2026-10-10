# Fuentes de `mediciones_externas.csv`

Compilado el 2026-10-08. Todo lo que aparece aqui fue leido por quien compilo en esta sesion (HTML o PDF descargado y revisado), salvo lo que se marca en "Lo que NO pude leer". Nada se completo de memoria.

## Archivos de esta carpeta

| Archivo | Que contiene |
|---|---|
| `mediciones_externas.csv` | 673 filas, una por (colonia, parametro), ventana 2025-2026 (en la practica 2026). Columnas exactas: `colonia,municipio,fuente,tipo_fuente,fecha,parametro,valor,unidad,url,notas`. Toda fila tiene municipio y URL. |
| `mediciones_sin_colonia.csv` | 24 filas con la misma estructura pero SIN colonia (agregados por municipio o ZMG, o puntos de la auditoria del SIAPA que solo traen cruces de calles). No deben pintarse en el mapa por colonia. |
| `mediciones_historicas_pre2025.csv` | 6 filas de 2020 (laboratorio privado a peticion de vecinos). Fuera de la ventana 2025-2026; se separan para no mezclarlas. |

### Como leer el CSV principal

- `parametro = reporte_calidad_deficiente` (619 filas): la fuente solo dice "esta colonia esta afectada / tuvo queja / esta en el listado". `valor` vacio. **No es una medicion.**
- Filas con parametro real (`plomo`, `mercurio`, `aluminio`, `fluoruros`, `nitritos`, `e_coli`, `turbiedad`, `cloro_residual_libre`): casi todas con `valor` vacio porque la fuente solo dice "detectado / fuera de norma" por colonia. Solo hay 2 valores numericos por colonia en este CSV: plomo 20 mg/L en El Fresno (tira reactiva, dudoso, ver abajo) y turbiedad 40 en El Moral (Tonala, UdeG). En el archivo historico hay otros 2 (turbiedad 616 NTU y color 500 Pt/Co en Arcos de Zapopan, 2020).
- `tipo_fuente`: `oficial` = lo emite o lo entrega una autoridad (SIAPA, CEDHJ, COPRISJAL, Secretaria de Salud); `academica` = universidad; `ciudadana` = monitoreo vecinal/organizacion civil; `periodistica` = reporte de prensa sin documento primario.
- `municipio` usa "San Pedro Tlaquepaque" para Tlaquepaque. Los nombres de colonia son los de la fuente (con variantes de nomenclatura); hay que normalizarlos contra la cartografia antes de cruzar.
- Todo lo de esta carpeta es externo y real, pero con calidad muy desigual; mostrarlo siempre con su `tipo_fuente` y `notas`.

## Advertencias que cambian como se debe presentar el dato

1. **"Listado de descuento" no es "medicion".** Las 342 colonias del SIAPA y las 243 de la CEDHJ son listados administrativos para el descuento del 80% (Decreto 30216/LXIV/26). La propia CEDHJ aclaro que el suyo "no constituye un dictamen tecnico". Se cargan como `reporte_calidad_deficiente` y asi hay que etiquetarlos.
2. **Monitoreo IMDEC/ITESO = tira reactiva semicuantitativa.** Su informe dice que es "orientativo" y que no sustituye laboratorio acreditado. Los valores extremos (plomo 20 mg/L, mercurio 0.25-0.5 mg/L, fluoruros hasta 50 mg/L) son implausiblemente altos para agua de red y probablemente reflejan el limite de la tecnica; la propia nota recomienda confirmar en laboratorio. Presentarlos como "indicio a confirmar", nunca como cifra certificada.
3. **El IMDEC cita limites que no coinciden con el DOF.** El texto oficial de la NOM-127-SSA1-2021 (leido en el DOF) fija mercurio 0.006 mg/L (el informe usa 0.001), nitratos 11 mg/L como N-NO3 (usa 10), sulfatos 400 mg/L (usa 250). Por eso los multiplos de "500 veces el limite" para mercurio no son confiables. Ver `docs/research/fuentes-oficiales.md`.
4. **Discrepancias internas del informe IMDEC (29-jun-2026):** dice mercurio en 7 muestras pero el Anexo 2 lista 9-10 colonias; una tabla dice "154 de 152 muestras" con cloro 0; el texto menciona una "zona de la Colonia Seattle" con mercurio pero Seattle no aparece en su lista de colonias muestreadas ni en el Anexo 2 (por eso no se cargo).
5. **Giardia y microcistinas NO estan confirmadas.** La UdeG las plantea como riesgo por las algas de la presa Calderon; no encontre ningun resultado de laboratorio positivo. No hay filas de Giardia en el CSV a proposito.
6. **Descuento: 80%, no 50%.** Telediario (2026-10-01) escribe "50 %" en el texto de su nota sobre el listado; el comunicado del SIAPA citado por El Informador, UDGTV y el decreto hablan de 80%. Se asume 80%.

## Fuentes con filas en el CSV

### A. SIAPA, listado de 342 colonias con descuento (30-sep-2026)
- URL: https://www.informador.mx/jalisco/siapa-amplia-a-342-las-colonias-con-descuento-por-servicio-de-agua-turbia-20260930-0216.html
- Publica: El Informador, reproduciendo el comunicado de la Junta de Gobierno del SIAPA ("el miercoles", 30-sep-2026). Lista completa numerada 1-342 con municipio (Guadalajara 199, Tlaquepaque 83, Zapopan 49, Tonala 11), parseada y verificada que suma 342.
- Cubre: colonias con descuento automatico del 80% (uso habitacional, pequenos comercios, condominios, consumo < 25 m3/mes), vigente hasta el 15-dic-2026 una vez publicado el listado en el Periodico Oficial. 86 se mantienen del listado anterior.
- Verificabilidad: MEDIA-ALTA. Es la lista oficial mas reciente, pero la leo en un medio, no en el Periodico Oficial ni en el sitio del SIAPA.
- Contraste: Telediario (https://www.telediario.mx/comunidad/colonias-con-descuento-de-siapa-por-agua-sucia-en-guadalajara-lista, 2026-10-01) publica una lista de 324 colonias (le faltan 18 de Guadalajara, todas las demas coinciden) y dice 50%. No se uso.
- No pude leer: el Periodico Oficial del Estado de Jalisco con el listado final; el comunicado original del SIAPA.

### B. CEDHJ, listado de 243 colonias con quejas (entrega 4-ago-2026)
- URL de la transcripcion usada: https://www.aztecajalisco.com/noticias-local/agua-sucia-guadalajara-lista-las-colonias-que-podran-acceder-al-descuento-80 (TV Azteca Jalisco, 2026-08-05)
- Corroboran cifras: Quadratin https://jalisco.quadratin.com.mx/sucesos/entrega-la-cedhj-listado-de-colonias-para-aplicar-descuentos-del-siapa/ (2026-08-04); LABCSA/NTR https://labcsa.org/2026/08/05/enlistan-colonias-con-agua-contaminada/ (2026-08-05); UDGTV https://udgtv.com/noticias/cedhj-entrega-listado-colonias-para-descuento-agua-jalisco/327310
- Publica: la CEDHJ elaboro la lista (quejas recibidas entre el 6-dic-2024 y el 27-jul-2026; 151 quejas, de ellas 102 por desabasto o mala calidad). Distribucion segun CEDHJ: Zapopan 103-104, Guadalajara 93, Tlaquepaque 32-33, Tonala 13-14 (las notas difieren en 1).
- Mi transcripcion tiene 242 nombres unicos tras quitar duplicados exactos (Zapopan 104, Guadalajara 92, Tlaquepaque 33, Tonala 13): falta 1 de Guadalajara. La CEDHJ dice que los homonimos son colonias distintas; aqui quedan fusionados en una fila por (nombre, municipio).
- Verificabilidad: MEDIA. La lista viene de un medio; el documento original de la CEDHJ no se pudo leer. La CEDHJ misma aclaro que no certifica calidad. Un especialista (Carlos Ruiz Chavez, via NTR) encontro nombres inexistentes o ambiguos (p. ej. "Alcalde", "Barranquitas", "Agua Azul", "Puerto Melaque").
- Relacionado y NO cargado: la CEDHJ entrego un segundo listado (103 colonias, ~3-sep-2026) y un tercer listado (39 colonias, 1-oct-2026) https://www.informador.mx/jalisco/cedhj-tercer-listado-con-39-colonias-relacionadas-con-fallas-en-el-suministro-y-calidad-del-agua-20261001-0102.html ; solo pude leer las cifras, no los nombres. El listado del SIAPA de 342 colonias ya integra el segundo listado.
- Relacionado y NO cargado: oficio P/EXT/95/2026 de la CEDHJ al Congreso con 655 colonias abastecidas por la Planta Potabilizadora 1 Miravalle (https://blob.udgtv.com/docs/2026/07/22/oficio_cedhj_1784778302884.pdf). Lo lei (primeras paginas) y confirma que la CEDHJ aclara que NO son colonias con queja sino el universo abastecido por esa planta (65 Zapopan, 168 Guadalajara, 171 Tlaquepaque, 251 Tonala). Las paginas con la lista son imagen escaneada y no hay OCR disponible; transcribir 655 nombres a ojo seria propenso a error.
- Relacionado y NO cargado: primer listado del SIAPA de 203 colonias (7-ago-2026) https://www.informador.mx/jalisco/siapa-avala-descuentos-para-colonias-que-recibieron-agua-sucia-lista-completa-20260807-0159.html . Lo lei (203 nombres) pero es un subconjunto depurado de la lista de 243 de la CEDHJ y el de 342 lo sustituye.

### C. IMDEC / ITESO, informe "Agua peligrosa del SIAPA: muestreo comunitario" (29-jun-2026)
- URL (PDF leido completo, 15 paginas): https://www.imdecdhagua.org/wp-content/uploads/2026/07/Informe-Agua-Peligrosa-del-SIAPA-Muestreo-Comunitario-de-la-Calidad-del-Agua-.pdf
- Publica: Instituto Mexicano para el Desarrollo Comunitario (IMDEC, coord. Maria Gonzalez Valencia), analisis de Hector Morales Gil de la Torre y Jose Juan Lira Calderon (ITESO / Resistencia Civil por el Valle), campana "El SIAPA que queremos". Pagina del IMDEC: https://www.imdecdhagua.org/monitoreo-ciudadano-revela-agua-contaminada-con-plomo-fluoruros-y-sin-cloro-en-42-puntos-de-la-zmg/
- Cubre: 184 muestras, 9 jornadas (22-mar a 27-jun-2026), 90 colonias de 5 municipios (Anexo 1). Resultados agregados: cloro residual 0 mg/L en 172 de 184 (93.48%); plomo en 20 muestras (todas > 0.01 mg/L); mercurio en 7; aluminio en 7; fluoruros en 52 (todas > 1.5); nitratos en 62 (29 excedencias); nitritos en 17; E. coli en 4 (una por municipio de GDL, Zapopan, Tonala y Tlaquepaque). El Anexo 2 da la lista de colonias por contaminante (sin valores); de ahi salen las filas de plomo, mercurio, aluminio, E. coli, fluoruros y nitritos.
- Verificabilidad: MEDIA. Documento primario leido, pero metodo de tira reactiva + R-Card hecho por voluntarios, sin cadena de custodia ni laboratorio acreditado (lo dice el Anexo 3). No se cargaron nitratos, hierro, cobre, zinc, sulfatos ni "bromo": en el Anexo 2 no queda claro si la colonia listada excedio la norma (o el informe dice expresamente que estuvieron dentro de norma). El renglon de mercurio de El Sauz (Tlaquepaque) quedo al cambiar de pagina junto a "Bromo" y es ambiguo; no se cargo.
- Actualizacion posterior (5-oct-2026): 256 muestras en 110 colonias, 14 jornadas; 32 con plomo, 17 mercurio, 15 aluminio, 9 hierro; coliformes fecales en 6 puntos de 4 colonias; 19 colonias de "alta toxicidad neurologica"; 1,323 denuncias en 452 colonias y 766 reportes de afectacion a la salud en 315 colonias. Fuentes leidas: https://www.informador.mx/jalisco/analisis-independientes-arrojan-presencia-de-metales-pesados-en-agua-de-la-zmg-20261005-0114.html , https://www.notisistema.com/noticias/detectan-plomo-y-mercurio-en-muestras-de-agua-de-la-zmg/ , https://www.meganoticias.mx/guadalajara/noticia/monitoreo-detecta-plomo-y-mercurio-en-muestras-de-agua-de-la-ciudad/776300 . NO pude leer el informe de octubre ni la lista de las 19 colonias; solo el agregado queda en `mediciones_sin_colonia.csv`.
- Informe previo (23-abr-2026, 42 muestras, 25-26 colonias): leido solo via Somos el Medio https://www.somoselmedio.com/monitoreo-agua-siapa-ecoli-plomo-aluminio-zmg/ (2026-04-24). De ahi salen: plomo 20 mg/L en El Fresno (punto 1) y 5 mg/L en "Parque Rojo" (punto 4); fluoruros hasta 50 mg/L en "Parque Rojo"; mercurio 0.25-0.5 mg/L en 5 muestras; solo la muestra de Santa Margarita (Zapopan) alcanzo 0.2 mg/L de cloro. "Parque Rojo" no tiene municipio en la fuente, por eso no se cargo. No lei el PDF de abril.
- Detalle contradictorio: Fabrica de Periodismo (https://fabricadeperiodismo.com/noticias/agua-guadalajara-contaminada/) dice que las 4 E. coli las hallaron "especialistas de la UdeG" en laboratorio; el informe dice tarjetas R-Card. Prevalece el informe.

### D. Telediario, "lista de colonias con agua de Siapa contaminada por materia fecal segun IMDEC" (24-abr-2026)
- URL: https://www.telediario.mx/comunidad/agua-de-siapa-con-materia-fecal-senala-estudio-lista-de-colonias
- Publica: Telediario Guadalajara. Lista 30 colonias "con reportes activos" segun registros de la campana "Cerdo Corrupto".
- Verificabilidad: BAJA-MEDIA. El titular exagera: el texto solo atribuye E. coli al 10% de las muestras de Guadalajara y Tonala (2 de 21, segun J. Lira, ITESO) sin nombrar colonias. Las colonias coinciden en gran parte con los sitios del primer monitoreo del IMDEC. Se cargan como reporte, no como contaminacion fecal confirmada.
- Tambien dice que el IMDEC y el ITESO documentaron 642 denuncias desde marzo de 2025 (fecha dudosa: otras fuentes ubican el inicio de la campana en marzo de 2026).

### E. El Informador, colonias citadas en la nota del comunicado del SIAPA (4-oct-2026)
- URL: https://www.informador.mx/jalisco/siapa-reporta-baja-presion-en-el-servicio-para-los-proximos-dias-en-estas-colonias-20261004-0076.html
- 8 colonias de Guadalajara mencionadas como con olor "a drenaje, azufre o metal", color y turbiedad segun ciudadanos. SIAPA no publico lista. Verificabilidad: BAJA (testimonio recogido por prensa).

### F. UDGTV / LABCSA, colonias del oriente de Guadalajara (5-ago-2026)
- URL: https://labcsa.org/2026/08/06/la-coprisjal-realiza-nuevas-pruebas-de-agua-del-siapa-resultados-en-2-semanas/
- Hermosa Provincia, Pablo Valdez, Miguel Hidalgo: agua "cochina o con olor a fierro". Municipio inferido de la frase "oriente de Guadalajara". Verificabilidad: BAJA.

### G. UdeG (CUTonala) y turbiedad
- Notas: https://labcsa.org/2026/03/20/hallan-bacterias-en-agua-de-tonala/ (MURAL, 19-mar-2026); https://www.milenio.com/comunidad/guadalajara-vive-emergencia-biologica-inminente-por-agua-turbia (Milenio, 19-mar-2026); https://udgtv.com/noticias/universidad-de-guadalajara-denuncia-calidad-agua-siapa-en-jalisco/309411 (UDGTV, 18-mar-2026); https://fabricadeperiodismo.com/noticias/agua-contaminada-guadalajara/ ; https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html
- Quien: Aida Alejandra Guerrero de Leon (Unidad de Analisis Ambientales, Instituto de Energia Renovable, CUTonala), Eduardo Juarez Carrillo (CUCBA), Jose Arturo Gleason Espindola (CUAAD), Alicia Torres Rodriguez.
- Dato: turbiedad "hasta 40" (limite 3) en agua del SIAPA, especialmente Tonala y el oriente; microorganismos vivos (algas, rotiferos, invertebrados). Solo una colonia identificada: Fraccionamiento El Moral (Tonala), fila unica con valor 40 (unidad asumida UNT; la nota dice "unidades"). El resto va a `mediciones_sin_colonia.csv`.
- Verificabilidad: MEDIA-BAJA. Declaraciones de academicos en rueda de prensa; no se publico un informe de laboratorio con metodo, fecha de muestreo ni puntos. NO pude leer ningun informe de la UdeG. Giardia y microcistinas son riesgos planteados, no resultados.

## Fuentes solo en `mediciones_sin_colonia.csv`

### H. COPRISJAL / Secretaria de Salud Jalisco
- UDGTV (28-jul-2026) https://udgtv.com/noticias/coprisjal-reporta-incumplimiento-coliformes-fecales/326382 : 18 de las primeras 100 muestras microbiologicas del 1er semestre de 2026 fuera de norma por coliformes fecales, todas en Zapopan (mar-jun). Documentos de transparencia; COPRISJAL no dio colonias.
- Quadratin (29-jul-2026) https://jalisco.quadratin.com.mx/sucesos/detectan-coliformes-en-18-muestras-de-agua-la-mayoria-en-zapopan/ y N+ (29-jul-2026) https://www.nmas.com.mx/jalisco/salud/confirman-presencia-de-una-bacteria-en-el-agua-del-area-metropolitana-de-guadalajara-que-es/ : 18 de 297 muestras positivas a coliformes, "predominantemente" Zapopan; el secretario H. R. Perez Gomez admite hipocloracion en los puntos de llegada. Puede ser el mismo hallazgo que el anterior pero las bases (100 vs 297) difieren; no pude reconciliarlo.
- UDGTV (6-jul-2026) https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833 : sin incremento atipico de enfermedades gastrointestinales (54,869 casos hasta la semana epidemiologica 24 de 2026 vs 56,448 en 2025; conjuntivitis 8,474 vs 9,326); 200 de ~2,000 colonias con reportes de olor, color o sedimentos; la alerta sanitaria solo la puede emitir la autoridad federal. Cifras del propio Secretario, no verificadas de forma independiente.
- J. Lomeli, El Informador https://www.informador.mx/ideas/monitoreo-de-coprisjal-si-revela-agua-fuera-de-norma-20260709-0023.html : datos de COPRISJAL obtenidos por transparencia (211 pruebas, ene-2024 a mar-2026): cloro residual fuera de norma en 149 (70%), fluoruros en 34 (16%); COPRISJAL solo informo dentro/fuera, solo 7 parametros, sin metales. Es columna de opinion. No pude acceder a la base de datos que el autor dice compartir.
- NO pude leer: ningun reporte del Laboratorio Estatal de Salud Publica ni de COPRISJAL por colonia o punto; el compromiso de nuevos resultados "en dos semanas" (5-ago-2026) no tiene resultados publicados que yo haya encontrado.

### I. Organo Interno de Control (OIC) del SIAPA, auditoria de calidad del agua 2025
- URL: https://labcsa.org/2026/08/03/siapa-sabia-desde-2025-de-agua-sucia/ (NTR Guadalajara, 2026-08-03) via transparencia.
- Orden de auditoria 12-mar-2025; muestreo en 34 tanques (12-ago a 23-sep-2025) y en domicilios (12-ago a 25-sep-2025); resultados recibidos el 10-oct-2025. 15 de 34 tanques con parametros fuera de norma (4 plomo, 2 nitrogeno amoniacal, manganeso en el tanque Polanco, 1 turbiedad, 4 fluoruros, 2 color verdadero). En domicilios: 141 puntos con anomalias (72 turbiedad, 51 color verdadero, 1 pH, 2 cloro libre residual, 15 coliformes fecales). La nota lista 14 cruces de calles con coliformes fecales (dice 15), sin colonia: no se asigno colonia por inferencia.
- Verificabilidad: MEDIA-ALTA en origen (documento oficial interno) pero leido solo en la nota; no vi el documento.
- Importa porque el SIAPA tenia en octubre de 2025 el dato de coliformes fecales y metales en su propia red.

## Fuentes historicas (`mediciones_historicas_pre2025.csv`)

- MURAL / El Norte, 7-oct-2020 https://www.elnorte.com/surte-siapa-agua-con-restos-fecales/amp/ar2044531 : laboratorio privado Amycsa, a peticion de vecinos: Arcos de Zapopan 1a seccion (21-sep-2020) turbiedad 616 NTU (limite citado 5), color 500 Pt/Co (limite 20), coliformes fuera de limite; Miraflores, Colinas de La Normal y Jardines Alcalde (18-ago-2020) coliformes fecales y totales. Se conserva por ser una de las pocas mediciones con valor por colonia, pero NO es del periodo y la cadena de custodia no se conoce.

## Otros conteos de colonias leidos (no cargados por falta de lista de nombres con municipio)

| Conteo | Fuente | Por que no hay filas |
|---|---|---|
| 129 colonias con reportes de agua de mala calidad del 19 al 22-jun-2026 (GDL 70, Tlaquepaque 20, Tonala 10, Zapopan 29), mapeo de Josue Sanchez Tapetillo | TV Azteca Jalisco 2026-06-24 https://www.aztecajalisco.com/local/reportan-129-colonias-agua-sucia-y-maloliente-en-el-area-metropolitana-guadalajara | La lista de nombres esta en una imagen de mapa en Bluesky (no legible aqui). El texto solo nombra 5 sin municipio: Beatriz Hernandez, Fraccionamiento Revolucion, Camichines, Puente Viejo, La Olimpica. |
| 135-137 colonias con reportes (6-mar-2026, mapeo Sanchez Tapetillo, GDL mayoria) y lista de ~41 nombres de reportes recibidos por Azteca Noticias | https://www.aztecajalisco.com/noticias-local/aumenta-el-numero-colonias-agua-sucia-y-mal-olor-en-guadalajara-lista-las-afectadas/ | La lista de nombres no trae municipio y hay homonimos; no se cargo para no asignar mal. |
| 181 colonias con 293 reportes en el primer semestre de 2024 (Sanchez Tapetillo) | NTR 2024-07-03 https://www.ntrguadalajara.com/post.php?id_nota=216080 | Es de 2024, fuera de la ventana. |
| 475 colonias con agua sucia o turbia entre ene-2025 y ene-2026 y 1,083 quejas (datos de transparencia vs 176 reconocidas por el SIAPA) | La Silla Rota 2026-03-23 https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html | La base de transparencia no esta publicada en la nota; es probablemente la fuente de la cifra "400+" que circula. SIN VERIFICAR la lista. |
| 170-180 colonias reconocidas por el SIAPA (marzo), 230 (30-jul) | Milenio 2026-03-19; Informador 2026-07-30 | Solo cifras. |

## Lo que NO pude leer (resumen)

- La Jornada (3 notas: 19-mar, 1-jul y 30-jul-2026), Sin Embargo, Sintesis (2026-10-07, "400 colonias") y El Occidental/OEM respondieron HTTP 403 a descarga directa: solo vi titulares/resumenes de buscador; no los uso como fuente.
- PDF escaneado de la CEDHJ con las 655 colonias (sin OCR en el entorno).
- Periodico Oficial de Jalisco (decreto 30216/LXIV/26 y listado final), sitio del SIAPA, Gobierno de Jalisco y CEA: no encontre ahi un comunicado o tablero de calidad del agua accesible; todo lo "oficial" llega via prensa o documentos de transparencia citados por prensa.
- CONAGUA y COFEPRIS federal: no encontre datos tecnicos propios de calidad del agua de la ZMG; solo mencion de coordinacion de Conagua con Jalisco (El Universal, 8-oct-2026).
- Informes de laboratorio de la UdeG, resultados de la CEA ("laboratorio de la Comision Estatal del Agua", mencionado por el director del SIAPA en abril) y resultados de nuevos muestreos de COPRISJAL posteriores a julio.
- Telefonos y canales: SIAPATEL 073 aparece en dos notas que citan el comunicado del SIAPA (Informador 2026-10-04 y UnoTV https://www.unotv.com/estados/jalisco/agua-con-olor-y-color-en-jalisco-siapa-pide-reportarla-y-advierte-baja-presion/); no lo verifique en el sitio del SIAPA (la portada no lo mostro). La linea de Salud Jalisco 33-3823-3220 sale solo en la nota de UDGTV del 6-jul-2026: SIN VERIFICAR en sitio oficial.
