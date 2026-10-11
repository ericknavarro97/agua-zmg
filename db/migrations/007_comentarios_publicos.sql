-- Comentarios que se muestran en la página de la colonia.
-- Solo son públicos los comentarios enviados DESPUÉS de que el formulario avisa que se muestran: los anteriores se
-- escribieron bajo la promesa de que no se publicaban y por eso quedan en false (no se rellena hacia atrás).
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS comentario_publico boolean NOT NULL DEFAULT false;
