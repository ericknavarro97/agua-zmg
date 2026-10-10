#!/usr/bin/env python3
"""Convierte data/raw/mapa-agua-zmg/reportes_semilla.json (MIT) al CSV de datos externos de este proyecto.

Reglas:
- Excluye filas de prueba / sin URL de fuente (p. ej. «Reporte de prueba para verificar visualizacion»).
- Una fila por categoría. tipo_fuente: academico_ong -> ciudadana (monitoreo vecinal/ONG, siempre con aviso de
  «no es medición confirmada»), prensa -> periodistica, oficial -> oficial.
- Fechas parciales (solo año o año-mes) no se inventan: fecha vacía y la original queda en notas.
- La fuente visible es la ORIGINAL (IMDEC, Milenio, CEDHJ...), con su URL. El crédito al proyecto que las recopiló
  (MIT, pide atribuir) va en la página «Acerca de» y en data/raw/mapa-agua-zmg/README.md.
"""
import csv, json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "data/raw/mapa-agua-zmg/reportes_semilla.json"
SALIDA = RAIZ / "data/oficial/mediciones_mapa_agua_zmg.csv"

PARAM = {
    "metales_pesados": "reporte_metales_pesados",
    "fecal_bacteriologico": "reporte_contaminacion_fecal",
    "color_anormal": "reporte_color_anormal",
    "olor": "reporte_mal_olor",
    "sedimentos": "reporte_sedimentos",
    "desabasto": "reporte_desabasto",
    "otro": "reporte_sin_especificar",
}
TIPO = {"academico_ong": "ciudadana", "prensa": "periodistica", "oficial": "oficial"}
COLS = ["colonia", "municipio", "fuente", "tipo_fuente", "fecha", "parametro", "valor", "unidad", "url", "notas"]

filas, excluidas, vistos = [], [], set()
for r in json.loads(ENTRADA.read_text(encoding="utf-8")):
    url = (r.get("fuente_url") or "").strip()
    desc = (r.get("descripcion") or "").strip()
    if not url.startswith("http") or r["fuente_tipo"] not in TIPO or re.search(r"\bprueba\b", desc, re.I):
        excluidas.append(f'{r["colonia"]} ({r["municipio"]}): {desc[:60]}')
        continue
    fecha_orig = r["fecha_reporte"]
    fecha = fecha_orig if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha_orig) else ""
    for cat in r["categorias"]:
        notas = desc + ("" if fecha else f" (Fecha de la fuente: {fecha_orig}.)")
        fila = {
            "colonia": r["colonia"], "municipio": r["municipio"], "fuente": r["fuente_nombre"],
            "tipo_fuente": TIPO[r["fuente_tipo"]], "fecha": fecha, "parametro": PARAM[cat], "valor": "", "unidad": "",
            "url": url, "notas": notas,
        }
        clave = tuple(fila[c] for c in COLS)
        if clave in vistos:
            excluidas.append(f'{r["colonia"]}: fila idéntica duplicada ({cat})')
            continue
        vistos.add(clave)
        filas.append(fila)

with SALIDA.open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, COLS, lineterminator="\n")
    w.writeheader()
    w.writerows(filas)
print(f"{len(filas)} filas -> {SALIDA.relative_to(RAIZ)}")
for e in excluidas:
    print("  excluida:", e)
