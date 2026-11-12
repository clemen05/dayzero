"""Une src/ en un único dist/index.html autocontenido (datos + motor + interfaz).

Uso: python3 tools/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


def script(name: str) -> str:
    code = (SRC / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return f"<script>\n{code}\n</script>\n"


html = (SRC / "index.html").read_text(encoding="utf-8")
for marker, f in [("<!--DATA-->", "data.js"), ("<!--I18N-->", "i18n.js"), ("<!--ENGINE-->", "engine.js"), ("<!--APP-->", "app.js")]:
    html = html.replace(marker, script(f))
out = ROOT / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"{out} ({out.stat().st_size / 1024:.0f} KB)")
