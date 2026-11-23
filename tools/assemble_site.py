"""Puts the built app and site/ together into the folder fontbend.com serves.

The app (dist/) is the home page; site/ adds the hand-written pages and files around it.
A file may come from one of them only, so site/ can never quietly replace a file of the
app. The one file both have is _headers: site/'s rules are added after the app's, which
give every page its security headers.

Usage: python3 tools/assemble_site.py <out folder>
Run it after `npm run build`. Exit code: 0 ok, 1 a file in both, 2 a folder missing or
the out folder not empty.
"""

import shutil
import sys
from pathlib import Path

HEADERS = "_headers"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    root = Path(__file__).resolve().parent.parent
    app, site, out = root / "dist", root / "site", Path(sys.argv[1])
    for layer in (app, site):
        if not (layer / HEADERS).is_file():
            print(f"ERROR: no {HEADERS} in {layer}")
            return 2
    if out.exists() and any(out.iterdir()):
        print(f"ERROR: {out} is not empty")
        return 2

    files = {}
    both = []
    for layer in (app, site):
        for path in sorted(p for p in layer.rglob("*") if p.is_file()):
            name = path.relative_to(layer).as_posix()
            if name == HEADERS:
                continue
            if name in files:
                both.append(name)
            files[name] = path
    for name in both:
        print(f"FOUND {name} is in both dist/ and site/")
    if both:
        return 1

    for name, path in files.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    headers = [(layer / HEADERS).read_text(encoding="utf-8").rstrip("\n") for layer in (app, site)]
    (out / HEADERS).write_text("\n\n".join(headers) + "\n", encoding="utf-8")
    print(f"files: {len(files) + 1} in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
