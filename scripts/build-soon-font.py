r"""Builds the font for the fontbend.com "Soon" page.

Source: Recursive v1.085, SIL Open Font License 1.1, from google/fonts
(ofl/recursive/Recursive[CASL,CRSV,MONO,slnt,wght].ttf and OFL.txt).
Output: the Sans Linear cut (CASL 0, MONO 0, slnt 0, CRSV 0.5) with variable
weight 400-700, Basic Latin only, as WOFF2, plus a copy of OFL.txt.

Usage: python scripts/build-soon-font.py <folder with the Recursive .ttf and OFL.txt>
"""
import glob, io, os, shutil, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

if len(sys.argv) != 2:
    sys.exit(__doc__)
source_dir = sys.argv[1]
fonts = sorted(glob.glob(os.path.join(source_dir, "Recursive*.ttf")))
license_file = os.path.join(source_dir, "OFL.txt")
if len(fonts) != 1 or not os.path.isfile(license_file):
    sys.exit("Expected exactly one Recursive*.ttf and OFL.txt in " + source_dir)
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_dir = os.path.join(repo_root, "site", "fonts")
os.makedirs(out_dir, exist_ok=True)

font = TTFont(fonts[0])
font = instancer.instantiateVariableFont(font, {"CASL": 0, "MONO": 0, "slnt": 0, "CRSV": 0.5, "wght": (400, 700)})
# Reload after instancing: subsetting the in-memory instance fails on gvar.
buffer = io.BytesIO(); font.save(buffer); buffer.seek(0); font = TTFont(buffer)

options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["kern", "liga", "calt"]
options.name_IDs = ["*"]
options.notdef_outline = True
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=list(range(0x20, 0x7F)))
subsetter.subset(font)
out_file = os.path.join(out_dir, "recursive-sans.woff2")
font.flavor = "woff2"
font.save(out_file)
shutil.copy2(license_file, os.path.join(out_dir, "OFL.txt"))
print("woff2", os.path.getsize(out_file))
