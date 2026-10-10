-- 002: anti-abuso, moderación y retención (ver docs/research/anti-abuso.md).
-- Idempotente: se puede aplicar más de una vez sin efectos secundarios.
-- Regla de privacidad: IP y User-Agent NUNCA se guardan; solo identificadores HMAC
-- (clave derivada de HASH_SALT, fuera de la base) que se anonimizan con `pnpm purge`.

-- 1) reportes: señales anónimas + estado de moderación
ALTER TABLE reportes ALTER COLUMN huella DROP NOT NULL;  -- permite anonimizar tras la retención
ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS red_hash       text,      -- HMAC DIARIO del prefijo /24 (IPv4) o /48 (IPv6)
  ADD COLUMN IF NOT EXISTS red_sem        text,      -- HMAC SEMANAL del mismo prefijo (frena ataques lentos de una red)
  ADD COLUMN IF NOT EXISTS ua_familia     text,      -- grueso: 'chrome-android'... (nunca el UA completo)
  ADD COLUMN IF NOT EXISTS comentario_hash text,     -- HMAC diario del comentario normalizado (detecta copiar/pegar)
  ADD COLUMN IF NOT EXISTS tiempo_ms      integer,   -- ms entre abrir el formulario y enviarlo (lo declara el cliente)
  ADD COLUMN IF NOT EXISTS canal          text NOT NULL DEFAULT 'web'
      CHECK (canal IN ('web', 'sin_cabeceras')),
  -- true = honeypot lleno o formulario instantáneo: se guarda marcado y NO cuenta
  ADD COLUMN IF NOT EXISTS sospechoso     boolean NOT NULL DEFAULT false,
  -- 'revision' (ráfaga/límite blando) y 'oculto' (moderador) NO cuentan en los scores
  ADD COLUMN IF NOT EXISTS estado         text NOT NULL DEFAULT 'visible'
      CHECK (estado IN ('visible', 'revision', 'oculto')),
  ADD COLUMN IF NOT EXISTS motivo         text CHECK (char_length(motivo) <= 200),
  ADD COLUMN IF NOT EXISTS anonimizado_en timestamptz;

-- Lo que alimenta los scores: solo visibles y no sospechosos
CREATE INDEX IF NOT EXISTS reportes_contables_idx ON reportes (creado_en, colonia_id)
  WHERE estado = 'visible' AND NOT sospechoso;
-- Cola de revisión
CREATE INDEX IF NOT EXISTS reportes_revision_idx ON reportes (creado_en) WHERE estado = 'revision';
-- Retención: encuentra rápido lo que aún tiene identificadores
CREATE INDEX IF NOT EXISTS reportes_sin_anonimizar_idx ON reportes (creado_en) WHERE anonimizado_en IS NULL;

-- 2) límites de tasa: ventana fija, una fila por (clave, ventana). Las claves son hashes, nunca IP en claro.
CREATE TABLE IF NOT EXISTS rate_limits (
  clave   text        NOT NULL,
  ventana timestamptz NOT NULL,
  n       integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (clave, ventana)
);
CREATE INDEX IF NOT EXISTS rate_limits_ventana_idx ON rate_limits (ventana);

-- 3) bitácora de moderación: solo se agrega; nunca se edita ni se borra
CREATE TABLE IF NOT EXISTS moderacion_log (
  id             bigserial PRIMARY KEY,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actor          text   NOT NULL,                       -- 'sistema' | 'mod:<alias>'
  accion         text   NOT NULL CHECK (accion IN ('degradar', 'ocultar', 'restaurar', 'nota')),
  colonia_id     integer,
  reporte_ids    bigint[] NOT NULL DEFAULT '{}',
  regla          text,
  motivo         text   NOT NULL CHECK (char_length(motivo) >= 10),
  estado_despues text,
  estado_antes   jsonb                                   -- {reporte_id: estado} para poder revertir
);
CREATE INDEX IF NOT EXISTS moderacion_log_creado_idx ON moderacion_log (creado_en DESC);

CREATE OR REPLACE FUNCTION moderacion_log_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'moderacion_log es solo de agregado';
END $$;
DROP TRIGGER IF EXISTS moderacion_log_no_mod ON moderacion_log;
CREATE TRIGGER moderacion_log_no_mod BEFORE UPDATE OR DELETE ON moderacion_log
  FOR EACH ROW EXECUTE FUNCTION moderacion_log_inmutable();
DROP TRIGGER IF EXISTS moderacion_log_no_trunc ON moderacion_log;
CREATE TRIGGER moderacion_log_no_trunc BEFORE TRUNCATE ON moderacion_log
  FOR EACH STATEMENT EXECUTE FUNCTION moderacion_log_inmutable();

-- 4) moderar(): ÚNICO camino para cambiar el estado de reportes; cambia y registra en una transacción.
--    degradar : visible -> revision
--    ocultar  : visible|revision -> oculto
--    restaurar: revision|oculto -> visible
--    El sistema (actor 'sistema') solo puede degradar: ocultar es decisión humana ('mod:<alias>').
--    Devuelve cuántos reportes cambiaron (0 si no había nada por cambiar: no ensucia la bitácora).
CREATE OR REPLACE FUNCTION moderar(
  p_ids bigint[], p_accion text, p_actor text, p_motivo text, p_regla text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_nuevo text;
  v_ids   bigint[];
  v_col   integer;
  v_antes jsonb;
BEGIN
  v_nuevo := CASE p_accion WHEN 'degradar' THEN 'revision' WHEN 'ocultar' THEN 'oculto'
                           WHEN 'restaurar' THEN 'visible' END;
  IF v_nuevo IS NULL THEN RAISE EXCEPTION 'accion invalida: %', p_accion; END IF;
  IF p_motivo IS NULL OR char_length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'el motivo es obligatorio (minimo 10 caracteres)';
  END IF;
  IF p_actor <> 'sistema' AND p_actor NOT LIKE 'mod:%' THEN
    RAISE EXCEPTION 'actor invalido: %', p_actor;
  END IF;
  IF p_actor = 'sistema' AND p_accion <> 'degradar' THEN
    RAISE EXCEPTION 'el sistema solo puede degradar; % es decision humana', p_accion;
  END IF;

  WITH previos AS (
    SELECT id, colonia_id, estado FROM reportes
     WHERE id = ANY (p_ids)
       AND CASE p_accion
             WHEN 'degradar'  THEN estado = 'visible'
             WHEN 'ocultar'   THEN estado IN ('visible', 'revision')
             ELSE                  estado IN ('revision', 'oculto')
           END
     FOR UPDATE
  ), cambios AS (
    UPDATE reportes r
       SET estado = v_nuevo,
           motivo = CASE WHEN v_nuevo = 'visible' THEN NULL ELSE left(p_motivo, 200) END
      FROM previos p WHERE r.id = p.id
    RETURNING r.id
  )
  SELECT array_agg(p.id ORDER BY p.id),
         CASE WHEN count(DISTINCT p.colonia_id) = 1 THEN min(p.colonia_id) END,
         jsonb_object_agg(p.id::text, p.estado)
    INTO v_ids, v_col, v_antes
    FROM previos p JOIN cambios c USING (id);

  IF v_ids IS NULL THEN RETURN 0; END IF;
  INSERT INTO moderacion_log (actor, accion, colonia_id, reporte_ids, regla, motivo, estado_despues, estado_antes)
  VALUES (p_actor, p_accion, v_col, v_ids, p_regla, p_motivo, v_nuevo, v_antes);
  RETURN cardinality(v_ids);
END $$;
