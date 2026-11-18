r"""Builds the font for the fontbend.com "Soon" page.

Source: Recursive v1.085, SIL Open Font License 1.1, from google/fonts
(ofl/recursive/Recursive[CASL,CRSV,MONO,slnt,wght].ttf and OFL.txt).
Output: the Sans Linear cut (CASL 0, MONO 0, slnt 0, CRSV 0.5) with variable
weight 400-700, Basic Latin only, as WOFF2, plus a copy of OFL.txt.

The WOFF2 is named recursive-sans.<hash>.woff2, where <hash> is the first 8 hex
digits of its SHA-256. site/_headers lets browsers and Cloudflare keep .woff2 files
for a year without asking again, so a changed font must get a new name or visitors
keep the old one. The script writes the new file, points site/index.html at it and
then removes the previous file. The build is reproducible: the same source gives the
same bytes, so running it again changes nothing.

Usage: python scripts/build-soon-font.py <folder with the Recursive .ttf and OFL.txt>
"""
import glob, hashlib, io, os, re, shutil, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

FONT_REF = re.compile(r"/fonts/recursive-sans(?:\.[0-9a-f]{8})?\.woff2")
# index.html names the font twice: the preload link and the @font-face rule.
EXPECTED_REFS = 2


def build(source_ttf: str) -> bytes:
    # recalcTimestamp=False keeps head.modified from the source, so the output does not
    # change with the clock and the name only changes when the font does.
    font = TTFont(source_ttf, recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, {"CASL": 0, "MONO": 0, "slnt": 0, "CRSV": 0.5, "wght": (400, 700)})
    # Reload after instancing: subsetting the in-memory instance fails on gvar.
    buffer = io.BytesIO(); font.save(buffer); buffer.seek(0)
    font = TTFont(buffer, recalcTimestamp=False)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=list(range(0x20, 0x7F)))
    subsetter.subset(font)
    font.flavor = "woff2"
    out = io.BytesIO(); font.save(out)
    return out.getvalue()


def write_atomic(path: str, data: bytes) -> None:
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def publish(data: bytes, site_dir: str) -> str:
    """Writes the font under its hashed name, updates index.html, removes older fonts."""
    name = "recursive-sans." + hashlib.sha256(data).hexdigest()[:8] + ".woff2"
    fonts_dir = os.path.join(site_dir, "fonts")
    index = os.path.join(site_dir, "index.html")
    with open(index, "rb") as f:
        html = f.read().decode("utf-8")
    refs = FONT_REF.findall(html)
    if len(refs) != EXPECTED_REFS:
        sys.exit(f"Expected {EXPECTED_REFS} font references in {index}, found {len(refs)}; nothing written")

    os.makedirs(fonts_dir, exist_ok=True)
    write_atomic(os.path.join(fonts_dir, name), data)
    new_html = FONT_REF.sub("/fonts/" + name, html)
    if new_html != html:
        write_atomic(index, new_html.encode("utf-8"))
    for old in glob.glob(os.path.join(fonts_dir, "recursive-sans*.woff2")):
        if os.path.basename(old) != name:
            os.remove(old)
    return name


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    source_dir = sys.argv[1]
    fonts = sorted(glob.glob(os.path.join(source_dir, "Recursive*.ttf")))
    license_file = os.path.join(source_dir, "OFL.txt")
    if len(fonts) != 1 or not os.path.isfile(license_file):
        sys.exit("Expected exactly one Recursive*.ttf and OFL.txt in " + source_dir)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    site_dir = os.path.join(repo_root, "site")

    data = build(fonts[0])
    name = publish(data, site_dir)
    shutil.copy2(license_file, os.path.join(site_dir, "fonts", "OFL.txt"))
    print(name, len(data))


if __name__ == "__main__":
    main()
