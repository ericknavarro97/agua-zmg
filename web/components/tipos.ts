// Tipos del contrato de API entre flujos (ver /api/colonias/*).

export type ColoniaProps = {
  id: number;
  nombre: string;
  municipio: string | null;
  fuente_geom?: string | null;
};

export type Geo = GeoJSON.FeatureCollection<GeoJSON.Geometry, ColoniaProps>;
export type FeatureColonia = GeoJSON.Feature<GeoJSON.Geometry, ColoniaProps>;

export type Confianza = "baja" | "media" | "alta";

export type Score = {
  id: number;
  score: number;
  nivel: number;
  n: number;
  n_huellas: number;
  confianza: Confianza;
  /** Día (YYYY-MM-DD, hora de Guadalajara) del reporte más reciente; nunca la hora */
  ultimo: string;
};

export type TipoFuente = "oficial" | "academica" | "periodistica" | "ciudadana";

export type DatoOficial = {
  fuente: string;
  tipo: TipoFuente;
  fecha: string | null;
  parametro: string;
  valor: number | string | null;
  unidad: string | null;
  url: string | null;
  confianza_vinculo: "alta" | "media" | "baja";
  /** Advertencias de la fuente (p. ej. "tira reactiva, indicio a confirmar"); la UI debe mostrarlas */
  notas?: string | null;
};

/** Colonia con datos externos vinculados (marca del mapa, no es un nivel de gravedad) */
export type Externo = { id: number; n: number; medicion: boolean };

/** Comentario que su autor aceptó mostrar (solo el día, sin hora ni identificadores). gravedad null = «Hoy no llegó agua». */
export type ComentarioPublico = { dia: string; gravedad: number | null; texto: string };

export type PuntoSerie = { dia: string; n: number; score: number | null };

export type DetalleColonia = {
  id: number;
  nombre: string;
  municipio: string | null;
  fuente_geom?: string | null;
  reportes: {
    // n, n_huellas y ultimo son null mientras la colonia no alcance el mínimo publicable (igual que en /api/v1)
    n: number | null;
    n_huellas: number | null;
    score: number | null;
    nivel: number | null;
    confianza: Confianza | null;
    ultimo: string | null;
    serie: PuntoSerie[];
  };
  /** Reportes «Hoy no llegó agua» de la ventana del nivel (no entran en el nivel) */
  sin_agua?: { n: number; ultimo: string | null };
  comentarios?: ComentarioPublico[];
  oficial: DatoOficial[];
};
