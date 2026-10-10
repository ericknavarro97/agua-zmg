-- Retira del producto los datos de demostración: filas, columna, regla de coherencia y fuente de polígonos.
-- Los reportes de una colonia demo se borran en cascada (ON DELETE CASCADE de reportes.colonia_id).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'colonias' AND column_name = 'demo') THEN
    DELETE FROM colonias WHERE demo;
  END IF;
END $$;

DROP TRIGGER IF EXISTS colonias_marca_demo_trg ON colonias;
DROP FUNCTION IF EXISTS colonias_marca_demo();
ALTER TABLE colonias DROP CONSTRAINT IF EXISTS colonias_demo_coherente_chk;
ALTER TABLE colonias DROP COLUMN IF EXISTS demo;

ALTER TABLE colonias DROP CONSTRAINT IF EXISTS colonias_fuente_geom_chk;
ALTER TABLE colonias ADD CONSTRAINT colonias_fuente_geom_chk
  CHECK (fuente_geom IN ('ine_colonias','iieg','inegi_ageb','sepomex','osm','desconocida'));
DELETE FROM fuentes_geom WHERE clave = 'demo';
