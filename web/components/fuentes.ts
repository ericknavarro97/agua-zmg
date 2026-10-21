// URL de las fuentes citadas en las páginas informativas. Todas se abrieron y leyeron el 2026-10-08
// (ver docs/research/guia-contenido.md). Las de medios solo respaldan lo que DICEN las autoridades u otros.
export const F = {
  saludDesinfeccion: "https://www.gob.mx/salud/documentos/consumo-de-agua-desinfeccion-para-consumo",
  saludEdas: "https://www.gob.mx/salud/articulos/enfermedades-diarreicas-agudas-edas",
  saludEdasPrevencion: "https://www.gob.mx/salud/articulos/medidas-preventivas-en-enfermedades-diarreicas-agudas",
  censiaEdas: "https://www.gob.mx/salud/censia/articulos/enfermedades-diarreicas-agudas-edas-131075",
  nom127: "https://platiica.economia.gob.mx/wp-content/uploads/sites/2/PDF_Normas_Publicas/127ssa12021.pdf",
  constitucion: "https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf",
  leyCedhj:
    "https://transparencia.info.jalisco.gob.mx/sites/default/files/Ley%20de%20la%20Comisi%C3%B3n%20Estatal%20de%20Derechos%20Humanos_11.pdf",
  cedhj: "https://cedhj.org.mx",
  cedhjQueja: "https://cedhj.org.mx/queja",
  siapaQuejas: "https://www.siapa.gob.mx/quejas-y-sugerencias",
  siapaDescuentos: "https://www.siapa.gob.mx/alertas/colonias-con-descuentos-directos-en-consumo-por-deficiencias-en-la-calidad-de-agua-potable",
  cea: "https://www.ceajalisco.gob.mx",
  cofeprisGuia: "https://www.gob.mx/cms/uploads/attachment/file/1081202/Gu_a_de_denuncia_sanitaria_28052026.pdf",
  nueveUnoUno: "https://www.gob.mx/911/articulos/numero-unico-de-emergencias-9-1-1",
  profecoRequisitos: "https://www.gob.mx/profeco/articulos/proceso-y-requisitos-de-quejas-y-denuncias",
  cdcAgua: "https://www.cdc.gov/water-emergency/about/index.html",
  cdcAguaSegura: "https://www.cdc.gov/water-emergency/media/pdfs/make-water-safe-during-emergency-p.pdf",
  cdcHervir: "https://www.cdc.gov/natural-disasters/psa-toolkit/boil-water-advisory.html",
  cdcGiardiaPrev: "https://www.cdc.gov/giardia/prevention/index.html",
  cdcGiardia: "https://www.cdc.gov/giardia/about/index.html",
  cdcPlomoAgua: "https://www.cdc.gov/lead-prevention/prevention/drinking-water.html",
  cdcPlomo: "https://www.cdc.gov/lead-prevention/about/index.html",
  cdcFormula: "https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/preparation-and-storage.html",
  cdcTratamientoCasero: "https://www.cdc.gov/drinking-water/about/about-home-water-treatment-systems.html",
  epaPlomo: "https://www.epa.gov/ground-water-and-drinking-water/basic-information-about-lead-drinking-water",
  epaAlgas: "https://www.epa.gov/sites/default/files/2016-11/documents/harmful_algal_blooms_and_cyanotoxins_frequently_asked_questions.pdf",
  omsPlomo: "https://www.who.int/news-room/fact-sheets/detail/lead-poisoning-and-health",
  omsDiarrea: "https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease",
  // Medios
  udgtvSalud: "https://udgtv.com/noticias/secretario-salud-jalisco-informa-calidad-agua-2026/323833",
  nmasRecomendaciones:
    "https://www.nmas.com.mx/jalisco/salud/emiten-recomendaciones-por-agua-sucia-y-con-mal-olor-en-la-zona-metropolitana-de-guadalajara/",
  procesoCrisis:
    "https://www.proceso.com.mx/nacional/estados/2026/10/7/guadalajara-reducira-suministro-de-agua-potable-por-crisis-sin-precedentes-gobierno-niega-alerta-san-381431.html",
  laSillaRotaUdeG: "https://lasillarota.com/estados/2026/3/23/agua-potable-en-guadalajara-mas-sucia-de-lo-que-reconocen-autoridades-502398.html",
  informadorDescuento:
    "https://www.informador.mx/jalisco/siapa-amplia-a-342-las-colonias-con-descuento-por-servicio-de-agua-turbia-20260930-0216.html",
  aztecaDecreto: "https://www.aztecajalisco.com/local/publican-decreto-descuento-del-siapa-por-mala-calidad-del-agua/",
  adn40Muestras:
    "https://www.adn40.mx/mexico/2026-03-12/autoridades-de-jalisco-alertan-no-beber-agua-la-llave-en-zonas-guadalajara-analisis-270-muestras-de-plantas-potabilizadoras",
  imparcialUsos:
    "https://www.elimparcial.com/mexico/2026/07/08/habitantes-del-area-metropolitana-de-guadalajara-deben-usar-agua-de-garrafon-o-purificada-para-beber-cocinar-y-cepillarse-los-dientes-mientras-continuan-los-reportes-ciudadanos-por-agua-de-la-red-con-coloracion-oscura-turbiedad-y-malos-olores/",
  telediarioCedhj: "https://www.telediario.mx/comunidad/como-poner-una-queja-en-la-cedhj-requisitos-y-proceso",
  unotvTandeo:
    "https://www.unotv.com/estados/jalisco/siapa-aplicara-tandeos-de-agua-en-627-colonias-de-guadalajara-desde-el-15-de-octubre-hasta-marzo-de-2027/",
  cronicaRotacion:
    "https://www.cronica.com.mx/jalisco/guadalajara/2026/10/19/siapa-habilita-plataforma-para-consultar-la-rotacion-del-agua/",
  // Oficial (consulta de la rotación del servicio del SIAPA por domicilio)
  siapaRotacion: "https://rotaciondeserviciosiapa.jalisco.gob.mx",
} as const;

// Nombre descriptivo de cada fuente: lo leen los lectores de pantalla en los enlaces "[fuente]" (WCAG 2.4.4)
const NOMBRES: Record<keyof typeof F, string> = {
  saludDesinfeccion: "Secretaría de Salud, desinfección del agua",
  saludEdas: "Secretaría de Salud, enfermedades diarreicas agudas",
  saludEdasPrevencion: "Secretaría de Salud, prevención de diarreas",
  censiaEdas: "CENSIA, enfermedades diarreicas agudas",
  nom127: "NOM-127-SSA1-2021",
  constitucion: "Constitución Política de México",
  leyCedhj: "Ley de la CEDHJ",
  cedhj: "CEDHJ, sitio oficial",
  cedhjQueja: "CEDHJ, presentar una queja",
  siapaQuejas: "SIAPA, quejas y sugerencias",
  siapaDescuentos: "SIAPA, colonias con descuento",
  cea: "CEA Jalisco, sitio oficial",
  cofeprisGuia: "Cofepris, guía de denuncia sanitaria",
  nueveUnoUno: "Número único de emergencias 9-1-1",
  profecoRequisitos: "Profeco, requisitos de quejas y denuncias",
  cdcAgua: "CDC, agua en emergencias",
  cdcAguaSegura: "CDC, cómo hacer segura el agua",
  cdcHervir: "CDC, aviso de hervir el agua",
  cdcGiardiaPrev: "CDC, prevención de Giardia",
  cdcGiardia: "CDC, qué es la Giardia",
  cdcPlomoAgua: "CDC, plomo en el agua potable",
  cdcPlomo: "CDC, información sobre el plomo",
  cdcFormula: "CDC, preparar la fórmula infantil",
  cdcTratamientoCasero: "CDC, tratamiento casero del agua",
  epaPlomo: "EPA, plomo en el agua potable",
  epaAlgas: "EPA, algas dañinas y cianotoxinas",
  omsPlomo: "OMS, intoxicación por plomo",
  omsDiarrea: "OMS, enfermedad diarreica",
  udgtvSalud: "UDGTV, el secretario de Salud sobre la calidad del agua",
  nmasRecomendaciones: "N+, recomendaciones por agua sucia",
  procesoCrisis: "Proceso, reducción del suministro de agua",
  laSillaRotaUdeG: "La Silla Rota, agua más sucia de lo que reconocen las autoridades",
  informadorDescuento: "El Informador, colonias con descuento por agua turbia",
  aztecaDecreto: "Azteca Jalisco, decreto de descuento del SIAPA",
  adn40Muestras: "ADN 40, análisis de muestras de plantas potabilizadoras",
  imparcialUsos: "El Imparcial, para qué se puede usar el agua de la llave",
  telediarioCedhj: "Telediario, cómo poner una queja en la CEDHJ",
  unotvTandeo: "UnoTV, tandeos del SIAPA en 627 colonias",
  cronicaRotacion: "Crónica, plataforma para consultar la rotación del agua",
  siapaRotacion: "SIAPA, consulta de la rotación del servicio",
};

/** Nombre descriptivo de una fuente a partir de su URL (undefined si no es una fuente conocida) */
export const NOMBRE_FUENTE: Record<string, string> = Object.fromEntries(
  (Object.keys(F) as (keyof typeof F)[]).map((k) => [F[k], NOMBRES[k]]),
);
