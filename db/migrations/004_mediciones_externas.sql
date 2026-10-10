-- Datos externos (oficiales, académicos, periodísticos, ciudadanos) vinculados a colonias.
-- NO son reportes de vecinos ni entran al score. Cada fila conserva la fuente y la URL.
-- colonia_id puede ser NULL: filas sin vincular (o de ámbito municipal/ZMG) se guardan igual.

CREATE TABLE IF NOT EXISTS mediciones_externas (
  id                 bigserial PRIMARY KEY,
  hash_fila          text NOT NULL UNIQUE,      -- sha1 de la fila de origen (importación idempotente)
  ambito             text NOT NULL DEFAULT 'colonia' CHECK (ambito IN ('colonia','municipio','zmg')),
  colonia_id         integer REFERENCES colonias(id) ON DELETE SET NULL,
  confianza_vinculo  text CHECK (confianza_vinculo IN ('alta','media','baja')),
  metodo_vinculo     text,
  similitud          real,
  colonia_texto      text NOT NULL DEFAULT '',  -- tal como la escribió la fuente
  municipio_texto    text NOT NULL DEFAULT '',
  fuente             text NOT NULL,
  tipo_fuente        text NOT NULL CHECK (tipo_fuente IN ('oficial','academica','periodistica','ciudadana')),
  fecha              date,
  parametro          text NOT NULL,
  valor              double precision,
  unidad             text,
  url                text NOT NULL,
  notas              text,
  archivo_origen     text,
  importada_en       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mediciones_vinculo_coherente CHECK (colonia_id IS NULL OR confianza_vinculo IS NOT NULL),
  CONSTRAINT mediciones_ambito_colonia CHECK (colonia_id IS NULL OR ambito = 'colonia')
);
CREATE INDEX IF NOT EXISTS mediciones_externas_colonia_idx ON mediciones_externas (colonia_id, fecha DESC);
CREATE INDEX IF NOT EXISTS mediciones_externas_parametro_idx ON mediciones_externas (parametro);
