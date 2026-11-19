"""Checks that files cached as immutable change their name when they change.

site/_headers can tell browsers and Cloudflare to keep a file for a year without asking
again (Cache-Control: immutable). That is only safe when the file name carries a hash of
its content: a new version then has a new name. On 18.11.2026 the placeholder font kept
its name, and fontbend.com went on serving the old font from Cloudflare's cache after a
new deploy.

For every file under site/ that an immutable rule covers, the name must end in
.<hash>.<extension>, where <hash> is the first 8 hex digits of the file's SHA-256.
Every local reference in the pages (href, src, url()) must point to a file that exists,
so a renamed file cannot leave the page pointing at nothing. A reference ending in / means
the index.html in that folder, the way Cloudflare Pages serves it.

Usage: python3 tools/check_site_cache.py [folder ...]
With no folder it checks site/. Several folders are checked as one deployment, each
served on top of the ones before it: "site preview" is what the preview address serves.

Exit code: 0 ok, 1 findings, 2 a folder or _headers missing, or a rule this check cannot read.
"""

import hashlib
import re
import sys
from pathlib import Path

HASHED_NAME = re.compile(r"\.([0-9a-f]{8})\.[A-Za-z0-9]+$")
LOCAL_REF = re.compile(r"""(?:href|src)\s*=\s*["'](/[^"'#?]*)|url\(\s*["']?(/[^"')#?]*)""")


def immutable_patterns(headers_file: Path) -> list[str]:
    """Returns the URL patterns of rules whose Cache-Control contains immutable."""
    patterns = []
    current = None
    for line in headers_file.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            current = line.strip()
            continue
        name, _, value = line.strip().partition(":")
        if current and name.strip().lower() == "cache-control" and "immutable" in value.lower():
            patterns.append(current)
    return patterns


def to_regex(pattern: str) -> re.Pattern:
    # Only what site/_headers uses: a path with at most one splat. Placeholders and
    # absolute URLs would need Cloudflare's full matching rules, so they stop the check.
    if not pattern.startswith("/") or ":" in pattern or pattern.count("*") > 1:
        raise ValueError(pattern)
    return re.compile("^" + re.escape(pattern).replace(r"\*", ".*") + "$")


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    layers = [root / name for name in (sys.argv[1:] or ["site"])]
    served = {}
    for layer in layers:
        if not layer.is_dir():
            print(f"ERROR: {layer} not found")
            return 2
        for path in sorted(p for p in layer.rglob("*") if p.is_file()):
            served["/" + path.relative_to(layer).as_posix()] = path
    headers_file = served.get("/_headers")
    if headers_file is None:
        print(f"ERROR: no _headers in {', '.join(str(layer) for layer in layers)}")
        return 2
    try:
        rules = [to_regex(p) for p in immutable_patterns(headers_file)]
    except ValueError as exc:
        print(f"ERROR: this check cannot read the rule {exc} in {headers_file}")
        return 2

    findings = []
    cached = 0
    for url, path in sorted(served.items()):
        if not any(rule.match(url) for rule in rules):
            continue
        cached += 1
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:8]
        match = HASHED_NAME.search(path.name)
        if not match:
            findings.append(f"{url} is cached as immutable but its name has no content hash (expected .{digest}.)")
        elif match.group(1) != digest:
            findings.append(f"{url} is cached as immutable but its name says {match.group(1)} and its content hashes to {digest}")

    refs = 0
    for url, page in sorted(served.items()):
        if page.suffix != ".html":
            continue
        for match in LOCAL_REF.finditer(page.read_text(encoding="utf-8")):
            ref = match.group(1) or match.group(2)
            refs += 1
            target = ref + "index.html" if ref.endswith("/") else ref
            if target not in served:
                findings.append(f"{url.lstrip('/')} points to {ref}, which does not exist")

    for finding in findings:
        print(f"FOUND {finding}")
    print(f"immutable rules: {len(rules)} / immutable files: {cached} / local references: {refs} / findings: {len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
