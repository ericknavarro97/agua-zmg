-- Escala 0-4: el nivel 0 («Limpia») permite reportar que el agua llega bien (método v3).
ALTER TABLE reportes DROP CONSTRAINT IF EXISTS reportes_gravedad_check;
ALTER TABLE reportes ADD CONSTRAINT reportes_gravedad_check CHECK (gravedad BETWEEN 0 AND 4);
