"""Exporta dayzero.sqlite a src/data.js (window.DZ_DATA = {...}).

Uso: python3 tools/export_data.py ruta/a/dayzero.sqlite
- Abre la base en solo lectura.
- Repara textos con doble codificación UTF-8 (p. ej. 'ChamartÃ­n' -> 'Chamartín').
- prima_seguro_ch se exporta completa (la app filtra por año, edad y franquicia).
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

TABLAS = [
    "fuente", "moneda", "pais", "ciudad", "tipo_cambio", "zona", "tipo_vivienda", "alquiler",
    "ajuste_nuevo_contrato", "fianza_legal", "fiscal_tramo", "fiscal_parametro", "quellensteuer",
    "prima_seguro_ch", "tarifa_transporte", "cesta_producto", "precio_cesta", "permiso_trabajo",
    "tramite", "coste_arranque", "gasto_hogar", "trayecto_zona", "movilidad", "council_tax",
]


MOJIBAKE = re.compile("[Â-Ã][\u0080-¿]")


def _fix(m):
    try:
        return m.group().encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return m.group()


def reparar(v):
    if isinstance(v, str):
        return MOJIBAKE.sub(_fix, v)
    return v


def main(db_path: str) -> None:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    out = {}
    for t in TABLAS:
        rows = con.execute(f'SELECT * FROM "{t}"').fetchall()
        out[t] = [{k: reparar(r[k]) for k in r.keys()} for r in rows]
    root = Path(__file__).resolve().parent.parent
    dest = root / "src" / "data.js"
    dest.write_text(
        "// Generado por tools/export_data.py — no editar a mano\n"
        "(typeof window !== 'undefined' ? window : globalThis).DZ_DATA = "
        + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"{dest} ({dest.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
