"""Check that every installed npm package carries a permissive license.

The license is read from the package's own LICENSE file, not only from the
"license" field in package.json, because the two can disagree. A package whose
file is missing, unrecognised, copyleft, or different from its declared license
fails the check.

Run: python3 tools/check_licenses.py [node_modules folder]
     add --table to print one Markdown row per package.
"""
import json
import pathlib
import re
import sys

PERMISSIVE = {"MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "BlueOak-1.0.0", "CC0-1.0"}

# Each license is told apart by a sentence only its own text has.
SIGNS = [
    ("COPYLEFT", r"GNU (LESSER |AFFERO )?GENERAL PUBLIC LICENSE|Mozilla Public License|Eclipse Public License"),
    ("Apache-2.0", r"Apache License\s+Version 2\.0"),
    ("BlueOak-1.0.0", r"Blue Oak Model License"),
    ("0BSD", r"Permission to use, copy, modify, and/or distribute this software for any\s+purpose with or without fee is hereby granted\.\s+THE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS(?![\s\S]*copyright notice and this permission notice appear)"),
    ("ISC", r"Permission to use, copy, modify, and/?or distribute this software for any\s+purpose with or without fee is hereby granted, provided that the above\s+copyright notice and this permission notice appear in all copies"),
    ("MIT", r"Permission is hereby granted, free of charge, to any person obtaining"),
    ("BSD-3-Clause", r"Redistribution and use in source and binary forms[\s\S]*Neither the name"),
    ("BSD-2-Clause", r"Redistribution and use in source and binary forms"),
    ("CC0-1.0", r"CC0 1\.0 Universal"),
]
# Packages that fail the rules above but were checked by hand, keyed by name prefix
# (native packages come in one variant per platform). Each needs its reason.
EXCEPTIONS = {
    # Vite's CSS minifier. It runs only while building and none of its code reaches the
    # site, so its MPL-2.0 sets no duty on Fontbend; the maintainer accepted it on 2026-11-22.
    "lightningcss": "MPL-2.0, build tool only",
    # The compiled part of rolldown, published from the same folder of the same repository
    # as rolldown, whose package carries the MIT license file.
    "@rolldown/binding-": "MIT, license file in the rolldown package",
}
LICENSE_FILE = re.compile(r"^(LICEN[CS]E|COPYING)(\.(md|txt))?$|^LICENSE-MIT$", re.I)


def classify(text):
    """The package's own license is the one whose text comes first; a file may go on to
    quote the licenses of code bundled inside it. Copyleft anywhere in the file counts."""
    text = re.sub(r"[ \t]+", " ", text)
    # Ties (both BSD texts start alike) go to the earlier, more specific entry in SIGNS.
    hits = [(m.start(), i, name) for i, (name, pattern) in enumerate(SIGNS) if (m := re.search(pattern, text, re.I))]
    if any(name == "COPYLEFT" for *_, name in hits):
        return "COPYLEFT"
    return min(hits)[2] if hits else None


def packages(root):
    for manifest in sorted(root.glob("**/package.json")):
        rel = manifest.parent.relative_to(root).parts
        # A package folder is node_modules/<name> or node_modules/@scope/<name>,
        # possibly nested under another package's node_modules.
        if not rel or rel[-1] == "node_modules":
            continue
        tail = rel[-2:] if len(rel) >= 2 and rel[-2].startswith("@") else rel[-1:]
        parent = rel[: len(rel) - len(tail)]
        if parent and parent[-1] != "node_modules":
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if "name" in data and "version" in data:
            yield manifest.parent, data


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = pathlib.Path(args[0] if args else "node_modules")
    if not root.is_dir():
        print(f"no {root} folder: run npm ci first")
        return 2
    problems, rows = [], []
    for folder, data in packages(root):
        declared = data.get("license")
        if isinstance(declared, dict):
            declared = declared.get("type")
        files = [f for f in folder.iterdir() if f.is_file() and LICENSE_FILE.match(f.name)]
        found = sorted({classify(f.read_text(encoding="utf-8", errors="replace")) for f in files} - {None})
        name = f"{data['name']}@{data['version']}"
        excepted = next((why for prefix, why in EXCEPTIONS.items() if data["name"].startswith(prefix)), None)
        if excepted:
            rows.append(f"| {data['name']} | {data['version']} | {excepted} |")
            continue
        if not files:
            problems.append(f"{name}: no license file (declares {declared})")
        elif "COPYLEFT" in found:
            problems.append(f"{name}: copyleft license text")
        elif not found:
            problems.append(f"{name}: license file not recognised (declares {declared})")
        elif declared not in found and not (declared and set(re.split(r"\s+OR\s+|[()]", declared)) & set(found)):
            problems.append(f"{name}: declares {declared}, file reads {', '.join(found)}")
        elif not set(found) <= PERMISSIVE:
            problems.append(f"{name}: {', '.join(found)} is not on the permissive list")
        rows.append(f"| {data['name']} | {data['version']} | {', '.join(found) or '?'} |")
    if "--table" in sys.argv:
        print("\n".join(rows))
    for p in problems:
        print("FAIL", p)
    print(f"{len(rows)} packages, {len(problems)} problems")
    return 1 if problems or not rows else 0


if __name__ == "__main__":
    sys.exit(main())
