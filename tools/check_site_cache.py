"""Checks that files cached as immutable change their name when they change.

site/_headers can tell browsers and Cloudflare to keep a file for a year without asking
again (Cache-Control: immutable). That is only safe when the file name carries a hash of
its content: a new version then has a new name. On 18.11.2026 the placeholder font kept
its name, and fontbend.com went on serving the old font from Cloudflare's cache after a
new deploy.

For every file under site/ that an immutable rule covers, the name must end in
.<hash>.<extension>, where <hash> is the first 8 hex digits of the file's SHA-256.
Every local reference in site/*.html (href, src, url()) must point to a file that exists,
so a renamed file cannot leave the page pointing at nothing. A reference ending in / means
the index.html in that folder, the way Cloudflare Pages serves it.

Exit code: 0 ok, 1 findings, 2 site/_headers missing or a rule this check cannot read.
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
    site = Path(__file__).resolve().parent.parent / "site"
    headers_file = site / "_headers"
    if not headers_file.is_file():
        print(f"ERROR: {headers_file} not found")
        return 2
    try:
        rules = [to_regex(p) for p in immutable_patterns(headers_file)]
    except ValueError as exc:
        print(f"ERROR: this check cannot read the rule {exc} in site/_headers")
        return 2

    findings = []
    files = sorted(p for p in site.rglob("*") if p.is_file())
    cached = 0
    for path in files:
        url = "/" + path.relative_to(site).as_posix()
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
    for page in (p for p in files if p.suffix == ".html"):
        for match in LOCAL_REF.finditer(page.read_text(encoding="utf-8")):
            ref = match.group(1) or match.group(2)
            refs += 1
            target = ref + "index.html" if ref.endswith("/") else ref
            if not (site / target.lstrip("/")).is_file():
                findings.append(f"{page.relative_to(site).as_posix()} points to {ref}, which does not exist")

    for finding in findings:
        print(f"FOUND {finding}")
    print(f"immutable rules: {len(rules)} / immutable files: {cached} / local references: {refs} / findings: {len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
