CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS colonias (
  id         serial PRIMARY KEY,
  nombre     text NOT NULL,
  municipio  text,
  geom       geometry(MultiPolygon, 4326) NOT NULL,
  -- true cuando el polígono viene de datos de demostración
  demo       boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS colonias_geom_gix ON colonias USING gist (geom);

CREATE TABLE IF NOT EXISTS reportes (
  id          bigserial PRIMARY KEY,
  colonia_id  integer NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  -- 1 turbia/olor leve, 2 color/sedimentos, 3 no apta para uso, 4 riesgo a la salud
  gravedad    smallint NOT NULL CHECK (gravedad BETWEEN 1 AND 4),
  sintomas    text[] NOT NULL DEFAULT '{}',
  comentario  text CHECK (char_length(comentario) <= 500),
  -- hash diario de IP+UA; no se guardan datos personales
  huella      text NOT NULL,
  dia         date NOT NULL DEFAULT current_date,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colonia_id, huella, dia)
);
CREATE INDEX IF NOT EXISTS reportes_colonia_fecha_idx ON reportes (colonia_id, creado_en DESC);
