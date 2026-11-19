# Third-party notices

Fontbend's own code is under the [MIT License](LICENSE). The parts below come from others and keep their own licenses.

| Component | Version | License | Source | Where |
|---|---|---|---|---|
| Recursive, Sans Linear cut, Basic Latin subset | 1.085 | SIL Open Font License 1.1 | [arrowtype/recursive](https://github.com/arrowtype/recursive), file from [google/fonts](https://github.com/google/fonts/tree/main/ofl/recursive) | `site/fonts/recursive-sans.<hash>.woff2`, license text in `site/fonts/OFL.txt` |
| Recursive, text cut (MONO 0.3, CASL 0.25) and mono cut (MONO 1, CASL 0.25), Latin-1, Latin Extended-A and punctuation subset | 1.085 | SIL Open Font License 1.1 | same as above | `preview/fonts/recursive-text.<hash>.woff2` and `preview/fonts/recursive-mono.<hash>.woff2`; the preview is served on top of `site/`, so `site/fonts/OFL.txt` comes with them |

Recursive is instanced and subset by `scripts/build-site-font.py`. It declares no Reserved Font Name.
