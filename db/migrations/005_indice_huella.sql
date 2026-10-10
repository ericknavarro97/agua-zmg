-- 005: índice por (huella, dia) y marca de última actualización de cada reporte.
-- Idempotente: se puede aplicar más de una vez sin efectos secundarios.

-- guardar() (POST /api/reportes) busca "¿cuántas colonias reportó hoy esta huella?" con
-- WHERE huella = $1 AND dia = $2, dentro de una transacción con candado. El único índice con huella es
-- UNIQUE (colonia_id, huella, dia), que no sirve (colonia_id va primero): sin este índice era un seq scan
-- de toda la tabla en cada envío. Parcial: tras la retención `huella` queda en NULL y no se consulta.
CREATE INDEX IF NOT EXISTS reportes_huella_dia_idx ON reportes (huella, dia) WHERE huella IS NOT NULL;

-- El mínimo de 30 s entre actualizaciones se mide contra la última actualización, no contra la creación
-- (con creado_en, pasados 30 s del primer envío se podía actualizar sin límite). NULL = nunca se ha actualizado.
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS actualizado_en timestamptz;
