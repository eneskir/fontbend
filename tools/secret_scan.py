"""Scans every tracked file for secrets, credential files and personal data.

Commits are scanned locally before they are made; this is the second gate in CI,
because a commit made elsewhere (the web editor, a machine without the hook) skips
the local scan. Scanning zero files fails too: "clean" over nothing proves nothing.

Exit code: 0 clean, 1 findings, 2 nothing to scan or git could not be read.
"""

import re
import subprocess
import sys
from pathlib import Path

PATTERNS = {
    "private-key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "github-token": re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    "aws-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "google-key": re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    "slack-token": re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}\b"),
    "openai-style-key": re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}\b"),
    "cloudflare-token-assignment": re.compile(r"(?i)cloudflare_api_token\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{30,}"),
    "quoted-password": re.compile(r"(?i)\b(?:password|passwd|parola|sifre|şifre)\s*[:=]\s*['\"][^'\"]{4,}['\"]"),
    "tr-phone": re.compile(r"(?<!\d)(?:\+90|0)\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}(?!\d)"),
    "email": re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"),
    # A path into a Windows user folder carries the account name and the layout of the
    # machine. Written as C:\Users\, C:\\Users\\ (escaped), C:/Users/, or the Git Bash,
    # WSL and Cygwin forms /c/Users/, /mnt/c/Users/, /cygdrive/c/Users/. Other drive paths
    # are left alone: made-up ones such as C:/x.json are common in test data.
    "local-user-path": re.compile(
        r"(?i)(?<![A-Za-z0-9])[A-Z]:(?:\\+|/)Users(?:\\+|/)"
        r"|(?<![\w.\-])/(?:mnt/|cygdrive/)?[A-Z]/Users/"
    ),
}

# Addresses published on purpose. A personal address never goes here.
ALLOWED_EMAIL = re.compile(r"@users\.noreply\.github\.com$|^noreply@anthropic\.com$|@example\.com$")

CREDENTIAL_NAMES = re.compile(
    r"(^|/)(\.env(\..*)?|\.dev\.vars|\.npmrc|\.git-credentials|\.credentials\.json|key\.properties|id_rsa|id_ed25519)$"
    r"|\.(pem|p12|key|jks|keystore)$"
)
ENV_EXAMPLES = re.compile(r"(^|/)\.env\.(example|sample|template)$")
TEXT_SUFFIXES = {".html", ".css", ".js", ".mjs", ".ts", ".json", ".md", ".txt", ".py", ".yml", ".yaml", ".toml", ".svg", ".xml", ""}
SELF = "tools/secret_scan.py"


def tracked_files(root: Path) -> list[str]:
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, check=True)
    return [p for p in out.stdout.decode("utf-8").split("\0") if p]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    try:
        files = tracked_files(root)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"ERROR: could not list tracked files ({exc})")
        return 2
    if not files:
        print("ERROR: no tracked files to scan")
        return 2

    findings = []
    scanned = 0
    for rel in files:
        if CREDENTIAL_NAMES.search(rel) and not ENV_EXAMPLES.search(rel):
            findings.append((rel, 0, "credential-file"))
            continue
        path = root / rel
        if path.suffix.lower() not in TEXT_SUFFIXES or rel == SELF:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # A text file that is not UTF-8 breaks the repository's rule and could hide a secret.
            findings.append((rel, 0, "not-utf8"))
            continue
        except OSError:
            continue
        scanned += 1
        for lineno, line in enumerate(text.splitlines(), 1):
            for name, pattern in PATTERNS.items():
                for match in pattern.finditer(line):
                    if name == "email" and ALLOWED_EMAIL.search(match.group(0)):
                        continue
                    findings.append((rel, lineno, name))

    if scanned == 0:
        print(f"ERROR: none of the {len(files)} tracked files could be read as text")
        return 2
    for rel, lineno, name in findings:
        print(f"FOUND {name}: {rel}:{lineno}")
    print(f"text files scanned: {scanned} / tracked: {len(files)} / findings: {len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
