-- «Hoy no llegó agua»: un reporte sin gravedad (NULL) registra el desabasto sin tocar el nivel de la colonia.
-- La gravedad describe cómo se ve y huele el agua; quien no recibe agua no tiene qué describir.
-- Compatible con el código ya desplegado: solo relaja una restricción (el código anterior nunca inserta NULL).
-- El CHECK de 008 (gravedad BETWEEN 0 AND 4) deja pasar NULL, como cualquier CHECK de SQL.
ALTER TABLE reportes ALTER COLUMN gravedad DROP NOT NULL;
