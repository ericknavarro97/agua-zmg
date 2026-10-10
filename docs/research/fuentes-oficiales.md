# Que se sabe de la calidad del agua en la ZMG (2025-2026): fuentes oficiales, academicas y ciudadanas

Corte: 2026-10-08. Investigacion documental hecha en esa fecha. Cada afirmacion factual lleva la URL de la fuente que se leyo. Donde no pude verificar algo lo digo ("SIN VERIFICAR"). Los datos por colonia estan en `data/oficial/mediciones_externas.csv` y el detalle de cada fuente en `data/oficial/FUENTES.md`.

## 1. Resumen en diez lineas

- La crisis de agua turbia, con olor y color en la Zona Metropolitana de Guadalajara se volvio publica en marzo de 2026, pero hay antecedentes de reportes recurrentes desde 2024 y de hallazgos internos del propio SIAPA desde 2025.
- La causa que reconocen el gobierno estatal y el SIAPA: agua contaminada que llega por el Sistema Antiguo (Lago de Chapala, canal Atequiza, canal y presa Las Pintas) por descargas irregulares, que la Planta Potabilizadora 1 (PP1, Miravalle, 1956) no esta disenada para tratar. A eso se suman una red de distribucion envejecida y perdida de cloro en la red.
- El 6-oct-2026 el gobernador anuncio suspender el uso de Las Pintas y del sistema antiguo unos seis meses, con tandeos de 2-3 dias por colonia y cerca de 30% menos agua disponible.
- Hay descuento del 80% en el recibo (Decreto 30216/LXIV/26) para 342 colonias aprobadas el 30-sep-2026, vigente hasta el 15-dic-2026.
- Datos de laboratorio oficiales por colonia son casi inexistentes: COPRISJAL solo reporta "dentro/fuera de norma", sin valor ni colonia; no hay tablero publico.
- Los datos mas detallados son monitoreo ciudadano (IMDEC/ITESO, tiras reactivas): cloro residual 0 mg/L en 93% de 184 muestras; plomo, mercurio, aluminio, fluoruros y E. coli en colonias concretas. Son orientativos, no certificados, y citan limites que en varios casos no coinciden con el DOF.
- El dato academico mas citado (UdeG): turbiedad "hasta 40" frente a un limite de 3. No se publico informe de laboratorio; Giardia y microcistinas son riesgos planteados, no hallazgos.
- Salud Jalisco y COPRISJAL niegan alerta sanitaria y dicen que no hay aumento atipico de enfermedades gastrointestinales; aclaran que solo la autoridad federal puede emitirla. Academicos y organizaciones la exigen por principio precautorio.
- Cifras de "colonias afectadas" que circulan (176, 200, 230, 342, 475, 655) miden cosas distintas; no son intercambiables (seccion 6).
- Para el mapa: tratar los datos externos como capa aparte, con etiqueta de tipo de fuente y metodo; no mezclar con reportes vecinales ni con datos demo.

## 2. Cronologia verificada

| Fecha | Hecho | Fuente |
|---|---|---|
| 2024 (ene-jun) | Un especialista documenta 293 reportes de agua sucia en 181 colonias en redes sociales; el SIAPA decia que eran entre 50 y 80 colonias | https://www.ntrguadalajara.com/post.php?id_nota=216080 |
| 2025-03-12 | Orden de auditoria del Organo Interno de Control del SIAPA sobre calidad del agua (muestreo ago-sep 2025; resultados recibidos 10-oct-2025: 141 puntos domiciliarios con anomalias, 15 con coliformes fecales; 4 tanques con plomo en exceso) | https://labcsa.org/2026/08/03/siapa-sabia-desde-2025-de-agua-sucia/ |
| 2026-03-06 | Reportes ciudadanos escalan; el SIAPA admite mal olor/sucio en colonias abastecidas por PP1 Miravalle y atribuye el evento al deterioro del sistema antiguo y a trabajos de desazolve que subieron turbiedad y solidos | https://www.aztecajalisco.com/noticias-local/aumenta-el-numero-colonias-agua-sucia-y-mal-olor-en-guadalajara-lista-las-afectadas/ ; https://fabricadeperiodismo.com/noticias/agua-contaminada-guadalajara/ |
| 2026-03-11 (y dias siguientes) | El secretario de Salud descarta alerta sanitaria el 11-mar; la CEDHJ abre investigacion de oficio y dicta medidas cautelares contra SIAPA y COPRISJAL (antes del 19-mar); COPRISJAL habia recomendado dias antes no usar agua de la llave ni para cocinar ni para cepillarse los dientes | https://www.milenio.com/comunidad/guadalajara-vive-emergencia-biologica-inminente-por-agua-turbia |
| 2026-03-18/19 | Academicos de la UdeG reportan turbiedad hasta 40, microorganismos vivos, y piden alerta sanitaria | https://udgtv.com/noticias/universidad-de-guadalajara-denuncia-calidad-agua-siapa-en-jalisco/309411 ; https://labcsa.org/2026/03/20/hallan-bacterias-en-agua-de-tonala/ |
| 2026-03-23 | El gobernador destituye al director del SIAPA, Antonio Juarez Trueba; llega Ismael Jauregui Castaneda. Datos de transparencia: 475 colonias con agua sucia/turbia (ene-2025 a ene-2026), 1,083 quejas, vs 176 reconocidas por el SIAPA | https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html ; https://www.somoselmedio.com/agua-contaminada-siapa-plomo-mercurio-guadalajara/ |
| 2026-04-19/24 | Primer monitoreo ciudadano (IMDEC/ITESO): 42 muestras; 41 sin cloro; E. coli en 2 de 33 pruebas | https://www.somoselmedio.com/monitoreo-agua-siapa-ecoli-plomo-aluminio-zmg/ |
| 2026-04-30 | La CEDHJ publica la Recomendacion 10/2026 (analiza la presa Las Pintas), mencionada en su oficio al Congreso | https://blob.udgtv.com/docs/2026/07/22/oficio_cedhj_1784778302884.pdf (PDF escaneado, pagina 1) |
| 2026-06-29 | Informe IMDEC/ITESO: 184 muestras en 90 colonias | https://www.imdecdhagua.org/wp-content/uploads/2026/07/Informe-Agua-Peligrosa-del-SIAPA-Muestreo-Comunitario-de-la-Calidad-del-Agua-.pdf |
| 2026-07-06 | Secretaria de Salud y COPRISJAL: sin aumento atipico de casos; 200 colonias con reportes de olor/color/sedimento | https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833 |
| 2026-07-21/27 | El Congreso aprueba (21-jul) y se publica (27-jul) el decreto de descuento del 80%; el mismo 21-jul la CEDHJ fecha su oficio P/EXT/95/2026 al Congreso | https://udgtv.com/noticias/siapa-publica-primeras-203-colonias-que-recibiran-descuento/330890 ; https://www.informador.mx/jalisco/siapa-amplia-a-342-las-colonias-con-descuento-por-servicio-de-agua-turbia-20260930-0216.html ; https://labcsa.org/2026/08/05/enlistan-colonias-con-agua-contaminada/ |
| 2026-07-29 | Salud Jalisco: coliformes (E. coli) positivos en 18 de 297 muestras (mar-jun), sobre todo Zapopan; admite hipocloracion en puntos de llegada | https://www.nmas.com.mx/jalisco/salud/confirman-presencia-de-una-bacteria-en-el-agua-del-area-metropolitana-de-guadalajara-que-es/ ; https://jalisco.quadratin.com.mx/sucesos/detectan-coliformes-en-18-muestras-de-agua-la-mayoria-en-zapopan/ |
| 2026-08-04 / 08-07 | La CEDHJ entrega listado de 243 colonias con quejas; el SIAPA aprueba 203 y deja 32 en revision | https://jalisco.quadratin.com.mx/sucesos/entrega-la-cedhj-listado-de-colonias-para-aplicar-descuentos-del-siapa/ ; https://udgtv.com/noticias/siapa-reduce-colonias-beneficiadas-con-descuento/327557 |
| 2026-09-30 | El SIAPA amplia a 342 colonias | https://www.informador.mx/jalisco/siapa-amplia-a-342-las-colonias-con-descuento-por-servicio-de-agua-turbia-20260930-0216.html |
| 2026-10-03 a 10-05 | Repuntan reportes (Monumental, Americana, Oblatos, Jardines de la Paz, 18 de Marzo...); el 4-oct el SIAPA reconoce agua con olor/color desde Las Pintas por el Sistema Antiguo y advierte bajas presiones; el 5-oct bloqueos en Av. Colon, Periferico Sur y Lopez Mateos y suspension parcial de la Linea 1 del Tren Ligero | https://www.informador.mx/jalisco/siapa-reporta-baja-presion-en-el-servicio-para-los-proximos-dias-en-estas-colonias-20261004-0076.html ; https://tribunadelabahia.com.mx/agua-sucia-guadalajara-metales-coliformes-siapa/ |
| 2026-10-05 | IMDEC actualiza: 256 muestras, 110 colonias | https://www.informador.mx/jalisco/analisis-independientes-arrojan-presencia-de-metales-pesados-en-agua-de-la-zmg-20261005-0114.html |
| 2026-10-06 | Lemus reconoce "crisis de agua potable sin precedentes" y anuncia suspender Las Pintas/sistema antiguo | https://politica.expansion.mx/estados/2026/10/07/guadalajara-tendra-menos-agua-por-seis-meses-crisis ; https://www.proceso.com.mx/nacional/estados/2026/10/7/guadalajara-reducira-suministro-de-agua-potable-por-crisis-sin-precedentes-gobierno-niega-alerta-san-381431.html |
| 2026-10-08 | Sheinbaum dice que Conagua ya trabaja con Jalisco y que hay "acuerdo final" de reparto de obras | https://www.eluniversal.com.mx/nacion/sheinbaum-garantiza-apoyo-a-guadalajara-por-crisis-en-calidad-del-agua-senala-a-enrique-alfaro-por-no-construir-un-acueducto/ |

## 3. Causas: que dicen las fuentes

### 3.1 Sistema Antiguo / Las Pintas / PP1 (la explicacion oficial)

- El agua del Sistema Antiguo viene del Lago de Chapala por el rio Santiago y los canales Atequiza y Las Pintas hasta la presa Las Pintas y la PP1 Miravalle; aporta hasta 2.5 m3/s. El gobernador y el SIAPA detectaron descargas irregulares a lo largo del canal que terminan en la presa. https://politica.expansion.mx/estados/2026/10/07/guadalajara-tendra-menos-agua-por-seis-meses-crisis ; https://www.informador.mx/jalisco/que-pasa-con-el-agua-en-guadalajara-la-razon-detras-de-las-medidas-para-mejorar-su-calidad-20261007-0083.html
- En la investigacion de la CEDHJ, el propio SIAPA informo que las descargas sanitarias y residuales al canal Las Pintas alteran la calidad del agua cruda que entra a sus instalaciones y que la PP1 "no fue disenada para procesar ese tipo de influente" (segun resumen de Somos el Medio, 6-oct-2026): https://www.somoselmedio.com/jalisco-crisis-agua-sucia-guadalajara-siapa/
- El 4-oct-2026 el SIAPA dijo que "en los ultimos dias se ha detectado agua con olor y/o color procedente de la presa de Las Pintas a traves del sistema antiguo" y que trabaja en reforzar la PP1 y limpiar lineas de distribucion: https://www.informador.mx/jalisco/siapa-reporta-baja-presion-en-el-servicio-para-los-proximos-dias-en-estas-colonias-20261004-0076.html
- Serie historica: analisis del propio SIAPA (2018-2024) revisados por el investigador Juan Pablo Macias muestran en el sistema Chapala-Guadalajara (agua cruda) excedencias de coliformes totales y fecales, hierro, aluminio, nitrogeno amoniacal, arsenico y sustancias activas al azul de metileno, y picos de color y turbiedad, con maximos en la Planta de Bombeo de Las Pintas (No. 2). https://labcsa.org/2026/09/10/se-elevan-contaminantes-en-agua-en-8-anos/ (MURAL, 10-sep-2026)
- El sistema antiguo aporta aprox. 19% del agua de la metropoli (J. P. Macias): https://www.informador.mx/jalisco/cortes-de-agua-en-zmg-estiman-hasta-950-mil-habitantes-afectados-por-los-tandeos-20261006-0195.html

### 3.2 La Planta Potabilizadora 1 Miravalle

- Construida en 1956 y ampliada en 1978; abastece 655 colonias y fraccionamientos (65 Zapopan, 168 Guadalajara, 171 Tlaquepaque, 251 Tonala) segun el SIAPA, citado en el oficio de la CEDHJ: https://blob.udgtv.com/docs/2026/07/22/oficio_cedhj_1784778302884.pdf
- Aporta alrededor de 5 m3/s (~60% del agua potable de Guadalajara). El Plan Maestro de Modernizacion hecho para la CEA y enviado al Congreso describe medicion poco confiable, dosificacion quimica rebasada y operacion que depende de la experiencia de los trabajadores; propone telemetria, un nuevo tren de potabilizacion de 2 m3/s con ozono y carbon activado y ajuste de pH. https://labcsa.org/2026/07/16/la-planta-miravalle-es-un-gigante-envejecido-abastece-a-guadalajara-y-opera-con-equipos-obsoletos/ (UDGTV, 16-jul-2026). El mismo documento dice que la calidad del Lago de Chapala es cada vez mas variable (pH, turbiedad, hierro, manganeso, materia organica).
- Capacidad: el Plan Maestro habla de 7.5 m3/s instalados; otra nota cita el POTmet con 9 m3/s de diseno. Cifras contradictorias; no resolvi cual es la correcta. https://labcsa.org/2026/10/07/planta-de-miravalle-origen-de-la-crisis-de-agua-sucia-en-guadalajara/
- Director saliente en el Congreso (marzo): la planta de 1956 es "totalmente obsoleta" y la red "ha superado su vida util", lo que desprende sedimentos y biopeliculas: https://www.milenio.com/comunidad/guadalajara-vive-emergencia-biologica-inminente-por-agua-turbia

### 3.3 Red de distribucion y cloro

- La red tiene mas de 70 anos y pierde cerca de 40% del agua segun academicos de la UdeG (https://udgtv.com/noticias/universidad-de-guadalajara-denuncia-calidad-agua-siapa-en-jalisco/309411); 40-50% segun el IMDEC (https://www.somoselmedio.com/agua-no-potable-siapa-mercurio-amg/).
- El secretario de Salud reconoce que en las plantas el cloro es adecuado, pero en puntos de llegada a domicilios hay "hipocloracion": se pierde cloro en la red (https://www.nmas.com.mx/jalisco/salud/confirman-presencia-de-una-bacteria-en-el-agua-del-area-metropolitana-de-guadalajara-que-es/). La auditoria del OIC del SIAPA habla de "recontaminacion de la red de distribucion" y "posibles fluctuaciones en la dosificacion o perdidas de concentracion a lo largo de la red" (https://labcsa.org/2026/08/03/siapa-sabia-desde-2025-de-agua-sucia/).
- Contradiccion util: en abril el director del SIAPA dijo que en una zona de Zapopan (el Hospitalito) COPRISJAL habia observado cloracion "un poco alta" (https://www.nmas.com.mx/jalisco/salud/detectan-metales-pesados-y-materia-fecal-en-agua-potable-de-colonias-de-guadalajara-y-tonala/). El problema de cloro puede ser tanto defecto como exceso segun la zona.

### 3.4 Otras hipotesis (marcadas como hipotesis, no confirmadas)

- Fluoruros: el IMDEC los atribuye a pozos profundos sobreexplotados; es una hipotesis suya. COPRISJAL encontro fluoruros fuera de norma en 34 de 211 pruebas (https://www.informador.mx/ideas/monitoreo-de-coprisjal-si-revela-agua-fuera-de-norma-20260709-0023.html).
- Plomo: el IMDEC sugiere tuberias antiguas o soldaduras; no hay confirmacion de origen. El OIC del SIAPA encontro plomo en exceso en 4 tanques en 2025 (misma nota del OIC).
- Algas y microcistinas en la presa Calderon: riesgo planteado por la UdeG; sin resultado publicado.

## 4. Medidas conocidas

| Medida | Estado / detalle | Fuente |
|---|---|---|
| Suspender Las Pintas y el sistema antiguo | Anunciada 6-oct; ~6 meses; Informador matiza que se dejara de usar "cuando afecte la calidad". Proceso: ~30% menos disponibilidad, tandeos de 2-3 dias por colonia, sin precisar colonias ni fecha de inicio (a 7-oct) | https://www.proceso.com.mx/nacional/estados/2026/10/7/guadalajara-reducira-suministro-de-agua-potable-por-crisis-sin-precedentes-gobierno-niega-alerta-san-381431.html ; https://www.informador.mx/jalisco/que-pasa-con-el-agua-en-guadalajara-la-razon-detras-de-las-medidas-para-mejorar-su-calidad-20261007-0083.html |
| Obras | Acueducto de desvio La Calera (bypass de Las Pintas); primera etapa de ampliacion de PP1; acueducto sustituto Chapala-Guadalajara (~2 anos, iniciativa enviada al Congreso); completar El Zapotillo (opera al 45%, a cargo de la Federacion segun Lemus) | https://politica.expansion.mx/estados/2026/10/07/guadalajara-tendra-menos-agua-por-seis-meses-crisis |
| Descuento del 80% | Decreto 30216/LXIV/26; automatico en las 342 colonias para uso habitacional, pequenos comercios y condominios, solo consumos < 25 m3/mes; vigente al 15-dic-2026; en Guadalajara se aplica automatico en los recibos de sept-oct | https://www.informador.mx/jalisco/siapa-amplia-a-342-las-colonias-con-descuento-por-servicio-de-agua-turbia-20260930-0216.html |
| Plantas potabilizadoras moviles de la CEA | Filtracion, pulimiento y desinfeccion y llenado de garrafones; tres dias por colonia; han estado en El Sauz, Colonia Modelo, Polideportivo La Colmena y Loma Dorada; siguiente: Las Huertas (Tonala), jueves a sabado (nota del 27-jul) | https://udgtv.com/noticias/instalan-planta-potabilizadora-en-loma-dorada/326335 |
| Apoyos puntuales del SIAPA | En Alcalde Barranquitas: filtros, pastillas de cloro y algunos tinacos tras una mesa de trabajo (segun una vecina, insuficiente) | https://www.somoselmedio.com/agua-contaminada-siapa-plomo-mercurio-guadalajara/ |
| Monitoreo oficial | COPRISJAL toma muestras que va al Laboratorio Estatal de Salud Publica (tercero autorizado de Cofepris); resultados se entregan a municipios y al SIAPA; nuevos resultados anunciados "en dos semanas" el 5-ago | https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833 ; https://labcsa.org/2026/08/06/la-coprisjal-realiza-nuevas-pruebas-de-agua-del-siapa-resultados-en-2-semanas/ |
| Alerta sanitaria | Rechazada por Salud Jalisco; la autoridad estatal dice que solo la federal puede emitirla | https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833 |
| Coordinacion federal | Sheinbaum (8-oct): Conagua trabaja con Jalisco; acuerdo para repartir obras | https://www.eluniversal.com.mx/nacion/sheinbaum-garantiza-apoyo-a-guadalajara-por-crisis-en-calidad-del-agua-senala-a-enrique-alfaro-por-no-construir-un-acueducto/ |

Dato util para vecinos y para el mapa: a 7-oct no habia anuncio de que colonias entrarian a tandeo (Proceso, mismo enlace). No inventar un calendario de tandeos.

## 5. Normas aplicables: NOM-127-SSA1-2021

Texto leido en el DOF (publicada el 2022-05-02, entra en vigor 360 dias naturales despues, es decir finales de abril de 2023): https://dof.gob.mx/nota_detalle.php?amp=&codigo=5650705&fecha=02%2F05%2F2022

| Parametro | Limite permisible en el DOF | Notas |
|---|---|---|
| Turbiedad | 4.0 UNT; 3.0 UNT a partir del segundo ano posterior a la entrada en vigor | Con vigencia de abril de 2023, el 3.0 aplica desde 2025 por lectura literal; prensa y UdeG citan 3. UNT = unidades nefelometricas de turbiedad (equivalentes a NTU). |
| Cloro residual libre | 0.2 a 1.5 mg/L (si se desinfecta con cloro) | Es un rango: tanto por debajo como por encima incumple. El informe del IMDEC se contradice (dice 0.2-1.5 y tambien "0.1 a 1.5"). |
| Plomo | 0.01 mg/L | Coincide con IMDEC. |
| Aluminio | 0.20 mg/L | Coincide. |
| Hierro | 0.30 mg/L | Coincide. |
| Manganeso | 0.15 mg/L | |
| Mercurio | 0.006 mg/L | El IMDEC usa 0.001 mg/L: no coincide con este texto. |
| Fluoruros | 1.50 mg/L, con ajuste gradual a 1.0 mg/L (Tabla 3) para localidades de mas de 500,000 habitantes un ano despues de la entrada en vigor | El IMDEC compara con 1.5; para la ZMG el criterio mas estricto parece aplicar (SIN VERIFICAR si hubo modificaciones posteriores a la norma). |
| Nitrogeno de nitratos (N-NO3) | 11.00 mg/L | El IMDEC usa 10 mg/L. Cuidado con la base (como N o como nitrato). |
| Nitrogeno de nitritos (N-NO2) | 0.90 mg/L | |
| E. coli / coliformes termotolerantes | < 1.1 NMP/100 mL o no detectable (< 1 UFC/100 mL; ausencia) | |
| Giardia lamblia | Ausencia (quistes/20 L), solo si la fuente es superficial o influenciada por agua superficial | Aplica a las presas (Calderon, Las Pintas). |
| Microcistina-LR | 1.0 microgramo/L, si el agua viene de fuente superficial | |
| pH | 6.5 a 8.5 | |
| Color verdadero | 15 UC | |
| Sulfatos | 400 mg/L | El IMDEC usa 250. |
| Dureza total | 500 mg/L | Coincide. |

Advertencias: (1) lei la version publicada el 2022-05-02; hay paginas que mencionan modificaciones posteriores a la norma (por ejemplo https://laboratoriociaj.com.mx/nuevas-modificaciones-a-la-nom-127-ssa1-2021-agua-para-uso-y-consumo-humano-limites-permisibles-de-la-calidad-del-agua/) que no verifique; antes de fijar umbrales en el producto, confirmar contra la version vigente. (2) La norma regula el agua de los sistemas de abastecimiento; es el estandar con el que se compara todo lo de este documento.

## 6. Cifras de "colonias afectadas": que mide cada una

| Cifra | Que es | Fuente |
|---|---|---|
| 126 (2019) y 140 (2020) | Colonias con reportes de agua turbia reconocidas por el SIAPA en esos anos | https://politica.expansion.mx/estados/2026/10/07/guadalajara-tendra-menos-agua-por-seis-meses-crisis |
| 176 / ~180 / 170+ | Reconocidas por el SIAPA en marzo de 2026 (~10% de las 1,840 que atiende) | https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html ; https://www.milenio.com/comunidad/guadalajara-vive-emergencia-biologica-inminente-por-agua-turbia |
| 200 de ~2,000 | Colonias con reportes de olor/color/sedimento, segun el secretario de Salud (3-jul) | https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833 |
| 230 | Colonias reconocidas por el SIAPA al 30-jul | https://www.informador.mx/jalisco/esta-es-la-lista-de-las-posibles-colonias-afectadas-por-mala-calidad-del-agua-en-guadalajara-segun-la-cedhj-cuales-tendran-descuentos-20260730-0073.html |
| 243 | Colonias en quejas ante la CEDHJ (dic-2024 a jul-2026); no certifica calidad | ver FUENTES.md |
| 342 | Colonias con descuento aprobadas por el SIAPA (30-sep) | ver FUENTES.md |
| 475 / 1,083 quejas | Colonias con agua sucia o turbia ene-2025 a ene-2026 por transparencia (La Silla Rota). La lista no esta publicada: SIN VERIFICAR | La Silla Rota (enlace arriba) |
| 452 colonias / 1,323 denuncias; 315 colonias / 766 afectaciones de salud | Consulta/registro ciudadano del IMDEC (no estadistico) | https://www.informador.mx/jalisco/analisis-independientes-arrojan-presencia-de-metales-pesados-en-agua-de-la-zmg-20261005-0114.html |
| 129 y 135-137 | Colonias con reportes en redes en 4 dias (jun-2026) y en un conteo de marzo (J. Sanchez Tapetillo); no hay lista de nombres legible | https://www.aztecajalisco.com/local/reportan-129-colonias-agua-sucia-y-maloliente-en-el-area-metropolitana-guadalajara |
| 655 | Colonias que abastece la PP1 (universo en riesgo, no colonias con queja) | oficio CEDHJ (enlace arriba) |

La cifra "400+ colonias" del brief del proyecto parece corresponder a la de transparencia (475) o a las consultas ciudadanas; no la pude rastrear a un documento publico.

## 7. Calidad medida: que se sabe

### 7.1 Oficial (laboratorio)

- COPRISJAL, 1er semestre 2026: 18 de 100 muestras microbiologicas revisadas fuera de norma por coliformes fecales, todas en Zapopan (https://udgtv.com/noticias/coprisjal-reporta-incumplimiento-coliformes-fecales/326382). El secretario de Salud habla de 18 positivas de 297 (mar-jun) y que coliformes no implican por si mismos origen fecal (https://jalisco.quadratin.com.mx/sucesos/detectan-coliformes-en-18-muestras-de-agua-la-mayoria-en-zapopan/).
- COPRISJAL 2024-mar 2026 (transparencia, 211 pruebas): cloro residual fuera de norma en 70%, fluoruros en 16%; solo 7 parametros, sin metales pesados; sin valores, solo dentro/fuera (https://www.informador.mx/ideas/monitoreo-de-coprisjal-si-revela-agua-fuera-de-norma-20260709-0023.html).
- OIC del SIAPA (2025): ver cronologia. Es el hallazgo oficial mas completo, y es del propio SIAPA.
- Salud Jalisco afirma que en muestras sin sedimentos visibles los coliformes estan dentro de parametros (https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html).
- No existe (que yo haya encontrado) un reporte publico de turbiedad, cloro residual o metales por colonia emitido por el SIAPA, la CEA, COPRISJAL o Conagua.

### 7.2 Academico

- UdeG (CUTonala/CUCBA/CUAAD): turbiedad hasta 40 vs 3; algas, rotiferos e invertebrados; riesgo de microcistinas y de Giardia lamblia por la presa Calderon y la planta San Gaspar; exigen alerta sanitaria y transparentar el tratamiento (UDGTV, Milenio, MURAL, enlaces en seccion 2). Un punto concreto: Fraccionamiento El Moral, Tonala. No hay informe tecnico publico.
- ITESO participa en el diseno y analisis del monitoreo ciudadano (ver abajo); no es un estudio de laboratorio del ITESO.

### 7.3 Ciudadano (IMDEC / Red Metropolitana de Monitores Vecinales)

- Metodo: tiras reactivas de 20 parametros y tarjetas R-Card, voluntarios capacitados por el ITESO; "orientativo", no sustituye laboratorio acreditado. https://www.imdecdhagua.org/wp-content/uploads/2026/07/Informe-Agua-Peligrosa-del-SIAPA-Muestreo-Comunitario-de-la-Calidad-del-Agua-.pdf
- 184 muestras (mar-jun 2026): cloro 0 mg/L en 172; plomo en 20; mercurio en 7; aluminio en 7; fluoruros en 52; nitratos en 62 (29 sobre limite); nitritos en 17; E. coli en 4 (una por municipio). Colonias en el CSV.
- 256 muestras (hasta 5-oct): plomo 32, mercurio 17, aluminio 15, hierro 9, coliformes fecales en 6 puntos; 19 colonias de prioridad.
- Los picos numericos que circulan (plomo 20 mg/L, mercurio 0.5 mg/L, fluoruros 50 mg/L) son del informe de abril via nota de prensa; son extremos para el tipo de prueba y deben leerse como "indicio fuerte a confirmar". Ademas el limite de mercurio que usan es 0.001 y el DOF dice 0.006.
- La prensa seria subraya la salvedad: "no permiten afirmar que toda el agua distribuida en el AMG este contaminada" (https://tribunadelabahia.com.mx/agua-sucia-guadalajara-metales-coliformes-siapa/).

### 7.4 Giardia: estado de la evidencia

- Fuente: la UdeG advirtio "posible presencia" por algas en la presa Calderon (https://udgtv.com/noticias/universidad-de-guadalajara-denuncia-calidad-agua-siapa-en-jalisco/309411). No encontre ninguna prueba de laboratorio que la confirme en agua de la llave. La NOM-127 exige ausencia de Giardia cuando la fuente es superficial (DOF, tabla 6). Conclusion para el producto: no afirmar presencia de Giardia.

### 7.5 Salud publica

- Salud Jalisco: 54,869 casos de enfermedades gastrointestinales hasta la semana epidemiologica 24 de 2026 vs 56,448 en 2025; conjuntivitis 8,474 vs 9,326 (https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833). El 29-jul, N+ escribe que en esta epoca los casos gastrointestinales suben hasta 30% y que suman 101 mil en lo que va del ano (enlace de la seccion 2), y Quadratin reporta que el secretario reconocio un incremento sin evidencia de relacion con el agua distribuida. Las cifras no son comparables entre notas; usar con cautela.
- Organizaciones reportan dermatitis, conjuntivitis y diarrea; en Tonala se habrian documentado brotes de salmonelosis (Telediario cita a ITESO/IMDEC, sin cifras ni fuente primaria: SIN VERIFICAR) https://www.telediario.mx/comunidad/agua-de-siapa-con-materia-fecal-senala-estudio-lista-de-colonias

## 8. Guia util para vecinos (solo lo que tiene fuente)

Oficial (Salud Jalisco, 2026-07-06, https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833):
- No usar agua de la llave para beber ni preparar alimentos; usar garrafon o agua purificada. Para cepillarse los dientes, preferentemente garrafon o purificada.
- El agua de la red puede usarse para trastes, ropa y limpieza general solo si no presenta coloracion marcada ni olor intenso; igual para el bano y el lavado de manos.
- Con diarrea, vomito, fiebre o irritacion de piel u ojos, acudir al centro de salud. Linea de Salud Jalisco: 33-3823-3220 (segun esa nota; SIN VERIFICAR en sitio oficial).
- Lavar tinacos y cisternas una vez al ano (director del SIAPA, N+, 2026-04-27).

SIAPA (comunicado 4-oct, Informador y UnoTV): reportar agua con olor o color a SIAPATEL 073 o por las redes oficiales del SIAPA, con el numero de cuenta/contrato del recibo; almacenar agua por posibles bajas presiones. (073 SIN VERIFICAR en el sitio del SIAPA.) https://www.unotv.com/estados/jalisco/agua-con-olor-y-color-en-jalisco-siapa-pide-reportarla-y-advierte-baja-presion/

Recomendaciones del IMDEC/ITESO (organizacion civil, no oficiales; informe de junio y nota de abril):
- Hervir elimina riesgo bacteriologico pero no quita metales ni fluoruros y los concentra; 1 a 3 minutos de ebullicion para preparar alimentos si no hay riesgo quimico.
- Filtros de carbon activado y bujias ceramicas no retienen plomo, mercurio ni fluoruros; opciones: osmosis inversa o agua embotellada certificada.
- Ninos menores de 6 anos, embarazadas y personas con enfermedades cronicas: solo agua embotellada o purificada certificada (nota de abril: https://www.somoselmedio.com/monitoreo-agua-siapa-ecoli-plomo-aluminio-zmg/).
- En colonias con plomo o mercurio reportados no beber ni cocinar ni siquiera hervida (informe de junio, pagina de recomendaciones).
- Estas guias son del colectivo; para decisiones medicas remitir a Salud Jalisco o a un profesional.

## 9. Que no se sabe (y no se debe afirmar)

- Cual es la calidad real, medida en laboratorio acreditado, por colonia: no hay datos publicos.
- Si el plomo y el mercurio de las tiras reactivas se confirman en laboratorio.
- Si hay Giardia o microcistinas en el agua de red.
- Que colonias entran a tandeo ni cuando empezara.
- La lista completa de las 475 colonias de transparencia, la de las 129 del mapeo de Sanchez Tapetillo, la de las 19 prioritarias del IMDEC, la de las 39 del tercer listado de la CEDHJ y los nombres de las 655 de la PP1 (PDF escaneado).
- Resultados de los nuevos muestreos de COPRISJAL prometidos en agosto.

## 10. Recomendaciones para el producto (solo descripcion; no edite codigo)

1. Capa "datos externos" separada de los reportes vecinales y de `demo=true`. Mostrar siempre `tipo_fuente`, fecha y `notas`.
2. Etiquetar los listados (SIAPA 342, CEDHJ 243) como "colonia incluida en listado oficial de afectadas", nunca como "agua contaminada medida".
3. No traducir monitoreo ciudadano de tira reactiva a niveles de gravedad numericos sin la salvedad metodologica.
4. Umbrales de referencia: usar los de la tabla 5 (DOF), no los del IMDEC; confirmar con la version vigente de la norma.
5. Para el cruce por nombre de colonia: normalizar acentos, variantes ("Del Fresno" / "Fresno"), "San Pedro Tlaquepaque" / "Tlaquepaque" y homonimos entre municipios (se incluye municipio en todas las filas por eso).
6. Fecha de corte de los datos y aviso "esta informacion puede estar desactualizada; consulta Salud Jalisco/SIAPA".
7. Pendientes que corresponden a otros responsables (no edite fuera de `data/oficial/` y `docs/research/`): script de importacion del CSV a una tabla de fuente externa; decidir si la guia de la seccion 8 se publica en la web y revisarla con un profesional de salud; seguimiento semanal de nuevas listas (CEDHJ, SIAPA, Periodico Oficial) y de resultados de COPRISJAL.
