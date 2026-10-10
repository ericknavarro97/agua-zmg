-- Procedencia de los polígonos de colonias y metadatos para importación idempotente.
-- Regla: una colonia demo (demo=true) siempre tiene fuente_geom='demo' y viceversa.

ALTER TABLE colonias
  ADD COLUMN IF NOT EXISTS fuente_geom    text,
  ADD COLUMN IF NOT EXISTS anio_fuente    smallint,
  ADD COLUMN IF NOT EXISTS clave          text,
  ADD COLUMN IF NOT EXISTS nombre_norm    text,
  ADD COLUMN IF NOT EXISTS municipio_norm text,
  ADD COLUMN IF NOT EXISTS cp             text,
  ADD COLUMN IF NOT EXISTS area_m2        double precision,
  ADD COLUMN IF NOT EXISTS id_fuente      text,
  ADD COLUMN IF NOT EXISTS importada_en   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actualizada_en timestamptz NOT NULL DEFAULT now();

-- Filas previas: demo se identifica; el resto queda como 'desconocida' (origen no registrado)
UPDATE colonias SET fuente_geom = CASE WHEN demo THEN 'demo' ELSE 'desconocida' END WHERE fuente_geom IS NULL;
ALTER TABLE colonias ALTER COLUMN fuente_geom SET DEFAULT 'desconocida';
ALTER TABLE colonias ALTER COLUMN fuente_geom SET NOT NULL;

-- Un INSERT con demo=true sin fuente_geom explícita se marca solo como 'demo'
CREATE OR REPLACE FUNCTION colonias_marca_demo() RETURNS trigger AS $$
BEGIN
  IF NEW.demo AND NEW.fuente_geom = 'desconocida' THEN NEW.fuente_geom := 'demo'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS colonias_marca_demo_trg ON colonias;
CREATE TRIGGER colonias_marca_demo_trg BEFORE INSERT ON colonias
  FOR EACH ROW EXECUTE FUNCTION colonias_marca_demo();

ALTER TABLE colonias DROP CONSTRAINT IF EXISTS colonias_fuente_geom_chk;
ALTER TABLE colonias ADD CONSTRAINT colonias_fuente_geom_chk
  CHECK (fuente_geom IN ('ine_colonias','iieg','inegi_ageb','sepomex','osm','demo','desconocida'));
ALTER TABLE colonias DROP CONSTRAINT IF EXISTS colonias_demo_coherente_chk;
ALTER TABLE colonias ADD CONSTRAINT colonias_demo_coherente_chk
  CHECK (demo = (fuente_geom = 'demo'));

-- Clave estable (municipio normalizado | nombre normalizado [#id_fuente si hay homónimos]) para el upsert
CREATE UNIQUE INDEX IF NOT EXISTS colonias_clave_uq ON colonias (clave) WHERE clave IS NOT NULL;
CREATE INDEX IF NOT EXISTS colonias_municipio_norm_idx ON colonias (municipio_norm);
CREATE INDEX IF NOT EXISTS colonias_fuente_geom_idx ON colonias (fuente_geom);

-- Qué representa cada fuente de polígonos (se expone en /api/colonias/geometria)
CREATE TABLE IF NOT EXISTS fuentes_geom (
  clave       text PRIMARY KEY,
  titulo      text NOT NULL,
  representa  text NOT NULL,   -- 'colonia' | 'area_estadistica' | 'codigo_postal' | 'lugar' | 'demo' | 'desconocido'
  anio        smallint,
  licencia    text,
  url         text,
  aviso       text NOT NULL
);

INSERT INTO fuentes_geom (clave, titulo, representa, anio, licencia, url, aviso) VALUES
 ('ine_colonias', 'Catálogo de colonias del INE (corte 11-dic-2020), republicado en datamx.io', 'colonia', 2020,
  'CC0 según la ficha de un tercero (datamx.io); no confirmada con el INE',
  'https://datamx.io/dataset/colonias-ine-2020',
  'Límites aproximados, no oficiales. Faltan colonias posteriores a 2020 (sobre todo en Tlajomulco, Zapopan norte, Tonalá y El Salto). Los nombres no traen acentos. Algunos nombres se repiten dentro de un municipio y hay polígonos anidados.'),
 ('iieg', 'Colonias del IIEG (Planimetría ZMG / capa derivada con censo 2020)', 'colonia', 2020,
  'CC-BY según el dataset hermano del IIEG; la capa de terceros no declara licencia',
  'https://services9.arcgis.com/cgX3zRbhYaPIL2qP/arcgis/rest/services/Datos_de_Colonias_Guadalajara/FeatureServer/0',
  'Cubre sobre todo el núcleo del AMG; algunas colonias cruzan municipios. Verificar licencia antes de redistribuir.'),
 ('inegi_ageb', 'AGEB urbanas del INEGI (Marco Geoestadístico, dic-2025)', 'area_estadistica', 2025,
  'Términos de Libre Uso de la Información del INEGI',
  'https://gaia.inegi.org.mx/wscatgeo/',
  'NO son colonias: son áreas estadísticas de unas 10 a 60 manzanas. Úsese solo como respaldo de cobertura.'),
 ('sepomex', 'Polígonos de código postal de Correos de México', 'codigo_postal', NULL,
  'No declarada',
  'https://www.correosdemexico.gob.mx/datosabiertos/poligonos/cp_jal.zip',
  'NO son colonias: un código postal puede abarcar varias colonias.'),
 ('osm', 'OpenStreetMap (place=neighbourhood/suburb/quarter)', 'lugar', NULL,
  'ODbL (© colaboradores de OpenStreetMap)',
  'https://www.openstreetmap.org/copyright',
  'Cobertura muy parcial; muchos lugares son puntos o polígonos informales.'),
 ('demo', 'Cuadrícula de demostración', 'demo', NULL, NULL, NULL,
  'DATOS DE DEMOSTRACIÓN: no son colonias reales ni se deben presentar como tales.'),
 ('desconocida', 'Origen no registrado', 'desconocido', NULL, NULL, NULL,
  'Polígonos importados antes de registrar su procedencia.')
ON CONFLICT (clave) DO UPDATE SET
  titulo = EXCLUDED.titulo, representa = EXCLUDED.representa, anio = EXCLUDED.anio,
  licencia = EXCLUDED.licencia, url = EXCLUDED.url, aviso = EXCLUDED.aviso;
