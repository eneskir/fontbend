r"""Builds the fonts that fontbend.com and its preview serve, from Recursive.

Source: Recursive v1.085, SIL Open Font License 1.1, from google/fonts
(ofl/recursive/Recursive[CASL,CRSV,MONO,slnt,wght].ttf and OFL.txt).

Each entry in FONTS is one instance of Recursive, subset and saved as WOFF2 in the
fonts/ folder of its tree:
- recursive-sans (site/): the placeholder pages. The Sans Linear cut (CASL 0, MONO 0),
  Basic Latin only.
- recursive-text and recursive-mono (preview/ and app/): pages that are not public yet and
  the font maker's interface. The text
  cut chosen for the site on 19.11.2026, MONO 0.3 and CASL 0.25: wider and softer than
  Sans Linear and close to the logo's single stroke. Numbers and code use the same
  casualness at MONO 1. Both cover Latin-1, Latin Extended-A and typographic
  punctuation, because the interface is in English and Turkish.
All cuts are upright (slnt 0) with CRSV 0.5, so no cursive letter forms appear.

A font is named <name>.<hash>.woff2, where <hash> is the first 8 hex digits of its SHA-256.
site/_headers lets browsers and Cloudflare keep .woff2 files for a year without asking
again, so a changed font must get a new name or visitors keep the old one. The script
writes the new file, points every page of its tree at it and then removes the previous
file. Every page of a tree names each of that tree's fonts exactly twice, in the preload
link and in the @font-face rule. The build is reproducible: the same source gives the
same bytes, so running it again changes nothing.

Usage: python scripts/build-site-font.py <folder with the Recursive .ttf and OFL.txt>
"""
import glob, hashlib, io, os, re, sys
from dataclasses import dataclass
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

BASIC_LATIN = tuple(range(0x20, 0x7F))
# Latin-1 Supplement and Latin Extended-A hold the Turkish letters (ç ğ ı İ ö ş ü) and most
# European ones. The rest is what typeset text needs: dashes, curly quotes, bullet,
# ellipsis, single guillemets, euro and lira signs.
TEXT = BASIC_LATIN + tuple(range(0xA0, 0x180)) + (
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
    0x2022, 0x2026, 0x2039, 0x203A, 0x20AC, 0x20BA,
)


@dataclass(frozen=True)
class Font:
    name: str
    tree: str
    axes: dict
    unicodes: tuple


FONTS = (
    Font("recursive-sans", "site", {"CASL": 0, "MONO": 0, "slnt": 0, "CRSV": 0.5, "wght": (400, 700)}, BASIC_LATIN),
    Font("recursive-text", "preview", {"CASL": 0.25, "MONO": 0.3, "slnt": 0, "CRSV": 0.5, "wght": (400, 700)}, TEXT),
    Font("recursive-mono", "preview", {"CASL": 0.25, "MONO": 1, "slnt": 0, "CRSV": 0.5, "wght": 400}, TEXT),
    # The font maker's interface wears the same cuts as the preview pages.
    Font("recursive-text", "app", {"CASL": 0.25, "MONO": 0.3, "slnt": 0, "CRSV": 0.5, "wght": (400, 700)}, TEXT),
    Font("recursive-mono", "app", {"CASL": 0.25, "MONO": 1, "slnt": 0, "CRSV": 0.5, "wght": 400}, TEXT),
)
# Every page names each font of its tree twice: the preload link and the @font-face rule.
EXPECTED_REFS = 2


def font_ref(name: str) -> re.Pattern:
    return re.compile(r"/fonts/" + re.escape(name) + r"(?:\.[0-9a-f]{8})?\.woff2")


def build(source_ttf: str, font_spec: Font) -> bytes:
    # recalcTimestamp=False keeps head.modified from the source, so the output does not
    # change with the clock and the name only changes when the font does.
    font = TTFont(source_ttf, recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, font_spec.axes)
    # Reload after instancing: subsetting the in-memory instance fails on gvar.
    buffer = io.BytesIO(); font.save(buffer); buffer.seek(0)
    font = TTFont(buffer, recalcTimestamp=False)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=list(font_spec.unicodes))
    subsetter.subset(font)
    font.flavor = "woff2"
    out = io.BytesIO(); font.save(out)
    return out.getvalue()


def write_atomic(path: str, data: bytes) -> None:
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def read_pages(tree_dir: str) -> dict:
    pages = {}
    for page in sorted(glob.glob(os.path.join(tree_dir, "**", "*.html"), recursive=True)):
        with open(page, "rb") as f:
            pages[page] = f.read().decode("utf-8")
    return pages


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    source_dir = sys.argv[1]
    sources = sorted(glob.glob(os.path.join(source_dir, "Recursive*.ttf")))
    license_file = os.path.join(source_dir, "OFL.txt")
    if len(sources) != 1 or not os.path.isfile(license_file):
        sys.exit("Expected exactly one Recursive*.ttf and OFL.txt in " + source_dir)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Check every page before anything is written, so a page without the expected
    # references stops the build with the files untouched.
    pages = {}
    for spec in FONTS:
        tree_dir = os.path.join(repo_root, spec.tree)
        pages.setdefault(spec.tree, read_pages(tree_dir))
        if not pages[spec.tree]:
            sys.exit(f"No pages in {tree_dir}; nothing written")
        for page, html in pages[spec.tree].items():
            refs = font_ref(spec.name).findall(html)
            if len(refs) != EXPECTED_REFS:
                sys.exit(f"Expected {EXPECTED_REFS} references to {spec.name} in {page}, found {len(refs)}; nothing written")

    built = [(spec, build(sources[0], spec)) for spec in FONTS]

    for spec, data in built:
        name = spec.name + "." + hashlib.sha256(data).hexdigest()[:8] + ".woff2"
        fonts_dir = os.path.join(repo_root, spec.tree, "fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        write_atomic(os.path.join(fonts_dir, name), data)
        for page, html in pages[spec.tree].items():
            pages[spec.tree][page] = font_ref(spec.name).sub("/fonts/" + name, html)
        for old in glob.glob(os.path.join(fonts_dir, spec.name + "*.woff2")):
            if font_ref(spec.name).fullmatch("/fonts/" + os.path.basename(old)) and os.path.basename(old) != name:
                os.remove(old)
        print(f"{spec.tree}/fonts/{name} {len(data)}")

    for tree in pages:
        for page, html in pages[tree].items():
            with open(page, "rb") as f:
                current = f.read().decode("utf-8")
            if current != html:
                write_atomic(page, html.encode("utf-8"))
    # The preview is deployed on top of site/, so one copy of the license serves both.
    # A Windows checkout may have turned its line ends into CRLF; the repository keeps LF.
    with open(license_file, "rb") as f:
        license_text = f.read().replace(b"\r\n", b"\n")
    target = os.path.join(repo_root, "site", "fonts", "OFL.txt")
    if not os.path.exists(target) or open(target, "rb").read() != license_text:
        write_atomic(target, license_text)


if __name__ == "__main__":
    main()
