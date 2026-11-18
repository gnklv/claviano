"""Rebuild the PDF fixture with Verovio 6.4.1, pypdf 7.1.0 and Chrome.

Run python scripts/showcase-pdf.py; CHROME can point to a Chromium executable.
"""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET

from pypdf import PdfReader, PdfWriter
import verovio


root = Path(__file__).resolve().parents[1]
source = root / "public/demos/showcase.musicxml"
output = root / "tests/fixtures/pdf/showcase.pdf"
chrome = (os.environ.get("CHROME") or shutil.which("chromium") or shutil.which("google-chrome")
          or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
engraver = verovio.toolkit()
engraver.setOptions({
    "font": "Bravura", "xmlIdSeed": 1, "pageMarginLeft": 160, "pageMarginRight": 100,
    "measureMinWidth": 30, "spacingLinear": 0.38,
})
if not engraver.loadFile(str(source)) or not engraver.getPageCount():
    raise ValueError("Verovio could not engrave the showcase")

# Verovio imports MusicXML line pedals as separate down/bounce/up timestamps.
# Give its MEI engraver explicit spans so it can place releases after the last
# note onset, including releases in later measures. Symbol-only pedals stay as events.
mei = ET.fromstring(engraver.getMEI())
mei_ns = "{http://www.music-encoding.org/ns/mei}"
ET.register_namespace("", mei_ns[1:-1])
active = {}
for index, measure in enumerate(mei.iter(mei_ns + "measure")):
    for pedal in measure.findall(mei_ns + "pedal"):
        if pedal.get("form") != "line":
            continue
        staff = pedal.get("staff")
        direction = pedal.get("dir")
        if direction in ("bounce", "up") and staff in active:
            start_index, start = active.pop(staff)
            start.set("tstamp2", f"{index - start_index}m+{pedal.attrib['tstamp']}")
            if direction == "up":
                measure.remove(pedal)
        if direction in ("down", "bounce"):
            active[staff] = (index, pedal)
if not engraver.loadData(ET.tostring(mei, encoding="unicode")):
    raise ValueError("Verovio could not engrave the pedal spans")

# Print each independently engraved page at A4 with its original positions and scales.
# Use the very same Verovio Bravura glyphs as font text so PDF readers can identify them.
svg_ns = "http://www.w3.org/2000/svg"
ET.register_namespace("", svg_ns)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
font = Path(engraver.getResourcePath(), "Bravura.css").read_text()
html = ["<!doctype html><meta charset=utf-8><style>", font, """
@page { size: A4; margin: 0 }
* { margin: 0; padding: 0 }
body > svg { display: block; width: 210mm; height: 297mm; break-after: page }
</style>"""]
for number in range(1, engraver.getPageCount() + 1):
    page = ET.fromstring(engraver.renderToSVG(number))
    for group in page.iter(f"{{{svg_ns}}}g"):
        if "mNum" in group.get("class", "").split():
            # Raise measure numbers above the showcase captions at system starts.
            label = group.find(f"{{{svg_ns}}}text")
            label.set("y", str(int(label.attrib["y"]) - 420))
    for glyph in page.findall(f"{{{svg_ns}}}defs/{{{svg_ns}}}g"):
        codepoint = glyph.get("id", "").split("-")[0]
        if len(codepoint) == 4 and all(c in "0123456789ABCDEF" for c in codepoint):
            for path in list(glyph):
                glyph.remove(path)
            # Verovio's Bravura outline definitions use 1000 units per em.
            ET.SubElement(glyph, f"{{{svg_ns}}}text", {"style": "font:1000px Bravura"}).text = chr(int(codepoint, 16))
    html.append(ET.tostring(page, encoding="unicode"))

with TemporaryDirectory() as directory:
    temp = Path(directory)
    document = temp / "showcase.html"
    document.write_text("".join(html), encoding="utf-8")
    printed = temp / "showcase.pdf"
    subprocess.run([chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    f"--user-data-dir={temp / 'profile'}", f"--print-to-pdf={printed}",
                    document.as_uri()], check=True)
    pdf = PdfWriter()
    pdf.append_pages_from_reader(PdfReader(printed))
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    pdf.add_metadata({
        "/Title": "Claviano showcase",
        "/Creator": f"Verovio {engraver.getVersion()}",
        "/Subject": f"MusicXML-SHA256: {digest}",
    })
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf.write(output)
