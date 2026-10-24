#!/usr/bin/env python3
"""Build Word (.docx) copies of the legal templates.

docs/legal/templates/*.md  →  docs/legal/docx/*.docx

Standard library only (no pandoc / python-docx). Understands the Markdown the
templates use: # / ## / ### headings, paragraphs, **bold**, *italic*, `code`,
"- " bullets (two-space indent = level 2; "(a)" items are indented without a
bullet), "> " note boxes and | tables |. Output is deterministic (fixed zip
timestamps, no created date) so rebuilding without edits changes nothing.

Usage:  python3 scripts/legal-docx.py
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "legal" / "templates"
OUT = ROOT / "docs" / "legal" / "docx"

W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
       'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
TEXT_WIDTH = 9638  # A4 (11906) minus 2 cm margins each side, in twips


def runs(text: str, base: str = "") -> str:
    """Inline **bold**, *italic* and `code` → w:r runs."""
    out = []
    for tok in re.split(r"(\*\*.+?\*\*|\*[^*\s][^*]*?\*|`[^`]+`)", text):
        if not tok:
            continue
        props = base
        if tok.startswith("**") and tok.endswith("**") and len(tok) > 4:
            tok, props = tok[2:-2], props + "<w:b/>"
        elif tok.startswith("`") and tok.endswith("`"):
            tok, props = tok[1:-1], props + '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'
        elif tok.startswith("*") and tok.endswith("*") and len(tok) > 2:
            tok, props = tok[1:-1], props + "<w:i/>"
        rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
        out.append(f'<w:r>{rpr}<w:t xml:space="preserve">{escape(tok)}</w:t></w:r>')
    return "".join(out)


def para(text: str, style: str = "", ppr: str = "", prefix: str = "") -> str:
    p = (f'<w:pStyle w:val="{style}"/>' if style else "") + ppr
    pre = f'<w:r><w:t xml:space="preserve">{prefix}</w:t></w:r><w:r><w:tab/></w:r>' if prefix else ""
    return f"<w:p><w:pPr>{p}</w:pPr>{pre}{runs(text)}</w:p>"


def bullet(text: str, level: int, style: str = "") -> str:
    left = 567 * (level + 1)
    labelled = re.match(r"^\([a-z0-9ivx]+\)\s", text)
    if labelled:  # "(a) …" — a lettered sub-clause: hang the label, no bullet
        label, rest = text.split(" ", 1)
        return para(rest, style, f'<w:ind w:left="{left}" w:hanging="425"/>', escape(label))
    return para(text, style, f'<w:ind w:left="{left}" w:hanging="284"/>', "•")


def table(rows: list[list[str]]) -> str:
    cols = max(len(r) for r in rows)
    width = TEXT_WIDTH // cols
    grid = "".join(f'<w:gridCol w:w="{width}"/>' for _ in range(cols))
    trs = []
    for i, r in enumerate(rows):
        r = r + [""] * (cols - len(r))
        tall = any(c.strip().lower().startswith("signature") for c in r)
        trpr = '<w:trPr><w:trHeight w:val="680"/></w:trPr>' if tall else ""
        tcs = "".join(
            f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/></w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>{runs(c.strip(), "<w:b/>" if i == 0 else "")}</w:p></w:tc>'
            for c in r)
        trs.append(f"<w:tr>{trpr}{tcs}</w:tr>")
    return (f'<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="{TEXT_WIDTH}" w:type="dxa"/></w:tblPr>'
            f"<w:tblGrid>{grid}</w:tblGrid>{''.join(trs)}</w:tbl>"
            '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>')


def convert(md: str) -> tuple[str, str]:
    """Markdown → (document body XML, title)."""
    body, buf, rows = [], [], []
    title = ""

    def flush():
        if buf:
            body.append(para(" ".join(buf)))
            buf.clear()

    def flush_table():
        if rows:
            body.append(table(rows))
            rows.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("|"):
            flush()
            if not re.match(r"^\|[\s:|-]+\|$", line):  # skip the |---| separator
                rows.append([c for c in line.strip().strip("|").split("|")])
            continue
        flush_table()
        if not line.strip():
            flush()
        elif line.startswith("# "):
            flush()
            title = line[2:].strip()
            body.append(para(title, "Title"))
        elif line.startswith("## "):
            flush()
            body.append(para(line[3:].strip(), "Heading1"))
        elif line.startswith("### "):
            flush()
            body.append(para(line[4:].strip(), "Heading2"))
        elif line.startswith(">"):
            flush()
            t = line[1:].strip()
            if t.startswith("- "):
                body.append(bullet(t[2:], 0, "Note"))
            elif t:
                body.append(para(t, "Note"))
        elif re.match(r"^\s*- ", line):
            flush()
            level = 1 if line.startswith("  ") else 0
            body.append(bullet(line.strip()[2:], level))
        else:
            buf.append(line.strip())
    flush()
    flush_table()
    return "".join(body), title


STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/><w:spacing w:after="60"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>"""


def field(code: str) -> str:
    return ('<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r><w:instrText xml:space="preserve"> {code} </w:instrText></w:r>'
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r>'
            '<w:r><w:fldChar w:fldCharType="end"/></w:r>')


def footer(title: str) -> str:
    t = lambda s: f'<w:r><w:t xml:space="preserve">{escape(s)}</w:t></w:r>'
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {W_NS}>'
            '<w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>'
            f'{t(f"SportnNote — {title} — Page ")}{field("PAGE")}{t(" of ")}{field("NUMPAGES")}</w:p></w:ftr>')


def document(body: str) -> str:
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W_NS}><w:body>{body}'
            '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>'
            '<w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>'
            "</w:sectPr></w:body></w:document>")


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>"""


def core(title: str) -> str:
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f"<dc:title>{escape(title)}</dc:title><dc:creator>SportnNote</dc:creator></cp:coreProperties>")


APP = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
       '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
       "<Application>SportnNote legal-docx</Application></Properties>")


def write_docx(path: Path, body: str, title: str) -> None:
    parts = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": ROOT_RELS,
        "docProps/core.xml": core(title),
        "docProps/app.xml": APP,
        "word/document.xml": document(body),
        "word/styles.xml": STYLES,
        "word/_rels/document.xml.rels": DOC_RELS,
        "word/footer1.xml": footer(title),
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data.encode("utf-8"))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = sorted(SRC.glob("*.md"))
    if not sources:
        print(f"No templates in {SRC}", file=sys.stderr)
        return 1
    for src in sources:
        body, title = convert(src.read_text(encoding="utf-8"))
        dest = OUT / (src.stem + ".docx")
        write_docx(dest, body, title or src.stem)
        print(f"✓ {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
