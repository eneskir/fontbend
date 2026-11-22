r"""Builds the font catalog: copies the catalog fonts from a google/fonts checkout into
app/public/catalog/ and writes app/src/catalog.json from what the font files declare.

Each font file is copied byte for byte, so anyone can compare it with google/fonts at the
recorded commit. The browser previews and edits these same files: HarfBuzz instances a
TrueType font, not WOFF2. A file is named <id>[-italic].<hash>.ttf, where <hash> is the
first 8 hex digits of its SHA-256, so a changed font gets a new name and a long cache
never serves the old one. Each font folder also gets the font's own OFL.txt, which the
download bundles with every font made from it.

The font list shows each name in its own font. Loading the 20 upright fonts for that would
cost about 16 MB, so each font also gets <id>-name.<hash>.woff2: its default instance cut down to the
letters of its own name, a few kilobytes.

The script records facts (axes, copyright, version, Turkish letters, the fi ligature); it
does not judge them. app/src/core/catalog.ts decides what may enter the catalog, and its
tests run on the written catalog.json. Running the script again on the same checkout
changes nothing.

Usage: python scripts/build-catalog.py <google/fonts checkout>
"""
import hashlib, io, json, os, re, subprocess, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# id, folder under ofl/ in google/fonts, category. The picks and their reasons are the
# maintainer's catalog decision of 2026-11-22.
FONTS = (
    ("roboto-flex", "robotoflex", "sans"),
    ("recursive", "recursive", "sans"),
    ("commissioner", "commissioner", "sans"),
    ("bricolage-grotesque", "bricolagegrotesque", "sans"),
    ("instrument-sans", "instrumentsans", "sans"),
    ("nunito", "nunito", "sans"),
    ("inter", "inter", "sans"),
    ("geologica", "geologica", "sans"),
    ("science-gothic", "sciencegothic", "sans"),
    ("literata", "literata", "serif"),
    ("fraunces", "fraunces", "serif"),
    ("playfair", "playfair", "serif"),
    ("newsreader", "newsreader", "serif"),
    ("montagu-slab", "montaguslab", "slab"),
    ("big-shoulders", "bigshoulders", "display"),
    ("shantell-sans", "shantellsans", "display"),
    ("martian-mono", "martianmono", "mono"),
    ("jetbrains-mono", "jetbrainsmono", "mono"),
    ("sono", "sono", "mono"),
    ("caveat", "caveat", "handwriting"),
)
# Letters Turkish text needs beyond Basic Latin, including the circumflex vowels.
TURKISH = "ÇçĞğİıÖöŞşÜüÂâÎîÛû"
LANG_TAGS = {"TRK", "AZE", "CRT"}  # languages that keep the dot on i

OUT_FONTS = os.path.join("app", "public", "catalog")
OUT_CATALOG = os.path.join("app", "src", "catalog.json")


def fi_ligature_without_locl(font: TTFont) -> bool:
    """True when liga turns f + i into one glyph and no Turkish locl feature exists to stop it.
    Whether that glyph keeps the dot is checked by eye; the catalog flags the font either way."""
    if "GSUB" not in font:
        return False
    gsub = font["GSUB"].table
    cmap = font.getBestCmap()
    f, i = cmap.get(ord("f")), cmap.get(ord("i"))
    liga = False
    for rec in gsub.FeatureList.FeatureRecord:
        if rec.FeatureTag != "liga":
            continue
        for index in rec.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for table in lookup.SubTable:
                table = getattr(table, "ExtSubTable", table)
                ligatures = getattr(table, "ligatures", None) or {}
                liga = liga or any(l.Component == [i] for l in ligatures.get(f, []))
    if not liga:
        return False
    for script in gsub.ScriptList.ScriptRecord:
        for lang in script.Script.LangSysRecord:
            if lang.LangSysTag.strip() in LANG_TAGS:
                tags = {gsub.FeatureList.FeatureRecord[k].FeatureTag for k in lang.LangSys.FeatureIndex}
                if "locl" in tags:
                    return False
    return True


def describe(path: str) -> dict:
    font = TTFont(path, lazy=True)
    name = font["name"]
    cmap = font.getBestCmap()
    return {
        "family": name.getDebugName(16) or name.getDebugName(1),
        "version": re.sub(r"^Version\s+", "", name.getDebugName(5) or "").split(";")[0],
        "copyright": name.getDebugName(0) or "",
        "licenseDescription": name.getDebugName(13) or "",
        "glyphs": font["maxp"].numGlyphs,
        "axes": [{"tag": a.axisTag, "min": a.minValue, "default": a.defaultValue, "max": a.maxValue} for a in font["fvar"].axes],
        "missingTurkish": [c for c in TURKISH if ord(c) not in cmap],
        "fiLigatureWithoutLocl": fi_ligature_without_locl(font),
    }


def name_preview(path: str, text: str) -> bytes:
    """The default instance, cut down to the letters of text, as WOFF2."""
    font = TTFont(path, recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, {a.axisTag: None for a in font["fvar"].axes})
    buffer = io.BytesIO(); font.save(buffer); buffer.seek(0)  # subsetting needs a reloaded font
    font = TTFont(buffer, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["kern", "liga"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = "woff2"  # Options.flavor only applies to the pyftsubset command line
    out = io.BytesIO(); font.save(out)
    return out.getvalue()


def write_if_changed(path: str, data: bytes) -> None:
    if os.path.exists(path) and open(path, "rb").read() == data:
        return
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    checkout = sys.argv[1]
    commit = subprocess.run(["git", "-C", checkout, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Read every source before writing, so a missing file leaves the repository untouched.
    plan = []
    for font_id, folder, category in FONTS:
        src = os.path.join(checkout, "ofl", folder)
        ttfs = sorted(f for f in os.listdir(src) if f.endswith(".ttf")) if os.path.isdir(src) else []
        upright = [f for f in ttfs if "Italic" not in f]
        italic = [f for f in ttfs if "Italic" in f]
        if len(upright) != 1 or len(italic) > 1 or not os.path.isfile(os.path.join(src, "OFL.txt")):
            sys.exit(f"{folder}: expected one upright .ttf, at most one italic and OFL.txt; nothing written")
        plan.append((font_id, folder, category, src, upright[0], italic[0] if italic else None))

    catalog = {"schemaVersion": 1, "source": {"repository": "google/fonts", "commit": commit}, "fonts": []}
    for font_id, folder, category, src, upright, italic in plan:
        out_dir = os.path.join(root, OUT_FONTS, font_id)
        os.makedirs(out_dir, exist_ok=True)
        files, keep = {}, {"OFL.txt"}
        for style, filename in (("upright", upright), ("italic", italic)):
            if not filename:
                continue
            data = open(os.path.join(src, filename), "rb").read()
            target = f"{font_id}{'-italic' if style == 'italic' else ''}.{hashlib.sha256(data).hexdigest()[:8]}.ttf"
            write_if_changed(os.path.join(out_dir, target), data)
            files[style] = {"path": f"catalog/{font_id}/{target}", "source": f"ofl/{folder}/{filename}", "bytes": len(data)}
            keep.add(target)
        facts = describe(os.path.join(out_dir, os.path.basename(files["upright"]["path"])))
        data = name_preview(os.path.join(src, upright), facts["family"])
        target = f"{font_id}-name.{hashlib.sha256(data).hexdigest()[:8]}.woff2"
        write_if_changed(os.path.join(out_dir, target), data)
        name_file = f"catalog/{font_id}/{target}"
        keep.add(target)
        # A Windows checkout may have turned the license's line ends into CRLF; the repository keeps LF.
        ofl = open(os.path.join(src, "OFL.txt"), "rb").read().replace(b"\r\n", b"\n").decode("utf-8")
        write_if_changed(os.path.join(out_dir, "OFL.txt"), ofl.encode("utf-8"))
        for old in os.listdir(out_dir):
            if old not in keep:  # an earlier build's font, replaced by a new hash
                os.remove(os.path.join(out_dir, old))
        # A Reserved Font Name is declared in the copyright lines above the license text.
        facts["licenseCopyright"] = ofl.split("This Font Software is licensed under")[0].strip()
        catalog["fonts"].append({"id": font_id, "category": category, **facts, "files": files, "nameFile": name_file, "licenseFile": f"catalog/{font_id}/OFL.txt"})

    text = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    write_if_changed(os.path.join(root, OUT_CATALOG), text.encode("utf-8"))

    # The notices list the catalog fonts from the same data, so the two cannot drift apart.
    notices_path = os.path.join(root, "THIRD-PARTY-NOTICES.md")
    notices = open(notices_path, encoding="utf-8").read()
    start, end = "<!-- catalog fonts: written by scripts/build-catalog.py -->", "<!-- end of catalog fonts -->"
    if notices.count(start) != 1 or notices.count(end) != 1:
        sys.exit("THIRD-PARTY-NOTICES.md: catalog font markers missing")
    rows = [f"| {f['family']} | {f['version']} | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/{commit}/ofl/{f['files']['upright']['source'].split('/')[1]}) | `app/public/catalog/{f['id']}/`, license text in `OFL.txt` there |" for f in catalog["fonts"]]
    table = "\n".join(["| Font | Version | License | Source | Where |", "|---|---|---|---|---|", *rows])
    head, rest = notices.split(start)
    updated = head + start + "\n" + table + "\n" + end + rest.split(end, 1)[1]
    write_if_changed(notices_path, updated.encode("utf-8"))
    total = sum(f["bytes"] for font in catalog["fonts"] for f in font["files"].values())
    print(f"{len(catalog['fonts'])} fonts, {total / 1048576:.1f} MB, google/fonts {commit[:12]}")


if __name__ == "__main__":
    main()
