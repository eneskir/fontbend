# Third-party notices

Fontbend's own code is under the [MIT License](LICENSE). The parts below come from others and keep their own licenses.

| Component | Version | License | Source | Where |
|---|---|---|---|---|
| Recursive, Sans Linear cut, Basic Latin subset | 1.085 | SIL Open Font License 1.1 | [arrowtype/recursive](https://github.com/arrowtype/recursive), file from [google/fonts](https://github.com/google/fonts/tree/main/ofl/recursive) | `site/fonts/recursive-sans.<hash>.woff2`, license text in `site/fonts/OFL.txt` |
| Recursive, text cut (MONO 0.3, CASL 0.25) and mono cut (MONO 1, CASL 0.25), Latin-1, Latin Extended-A and punctuation subset | 1.085 | SIL Open Font License 1.1 | same as above | `preview/fonts/recursive-text.<hash>.woff2` and `preview/fonts/recursive-mono.<hash>.woff2`; the preview is served on top of `site/`, so `site/fonts/OFL.txt` comes with them |
| Recursive, the same text and mono cuts, for the app's interface | 1.085 | SIL Open Font License 1.1 | same as above | `app/fonts/recursive-text.<hash>.woff2` and `app/fonts/recursive-mono.<hash>.woff2`; the app ships the same license text in `app/public/catalog/recursive/OFL.txt` |

Recursive is instanced and subset by `scripts/build-site-font.py`. It declares no Reserved Font Name.

## Catalog fonts

The fonts people start from in the app. Each `.ttf` is an unchanged copy from google/fonts at the linked commit, with its own `OFL.txt`; none declares a Reserved Font Name, which `app/src/core/catalog.ts` checks. Next to it, `<id>-name.<hash>.woff2` is a modified version under the same license: the font's default instance cut to the letters of its family name, so the font list can show each name in its own font.

<!-- catalog fonts: written by scripts/build-catalog.py -->
| Font | Version | License | Source | Where |
|---|---|---|---|---|
| Roboto Flex | 3.200 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/robotoflex) | `app/public/catalog/roboto-flex/`, license text in `OFL.txt` there |
| Recursive | 1.085 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/recursive) | `app/public/catalog/recursive/`, license text in `OFL.txt` there |
| Commissioner | 1.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/commissioner) | `app/public/catalog/commissioner/`, license text in `OFL.txt` there |
| Bricolage Grotesque | 1.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/bricolagegrotesque) | `app/public/catalog/bricolage-grotesque/`, license text in `OFL.txt` there |
| Instrument Sans | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/instrumentsans) | `app/public/catalog/instrument-sans/`, license text in `OFL.txt` there |
| Nunito | 3.602 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/nunito) | `app/public/catalog/nunito/`, license text in `OFL.txt` there |
| Inter | 4.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/inter) | `app/public/catalog/inter/`, license text in `OFL.txt` there |
| Geologica | 1.010 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/geologica) | `app/public/catalog/geologica/`, license text in `OFL.txt` there |
| Science Gothic | 1.035 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/sciencegothic) | `app/public/catalog/science-gothic/`, license text in `OFL.txt` there |
| Literata | 3.103 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/literata) | `app/public/catalog/literata/`, license text in `OFL.txt` there |
| Fraunces | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/fraunces) | `app/public/catalog/fraunces/`, license text in `OFL.txt` there |
| Playfair | 2.203 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/playfair) | `app/public/catalog/playfair/`, license text in `OFL.txt` there |
| Newsreader | 1.003 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/newsreader) | `app/public/catalog/newsreader/`, license text in `OFL.txt` there |
| Montagu Slab | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/montaguslab) | `app/public/catalog/montagu-slab/`, license text in `OFL.txt` there |
| Big Shoulders | 2.002 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/bigshoulders) | `app/public/catalog/big-shoulders/`, license text in `OFL.txt` there |
| Shantell Sans | 1.011 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/shantellsans) | `app/public/catalog/shantell-sans/`, license text in `OFL.txt` there |
| Martian Mono | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/martianmono) | `app/public/catalog/martian-mono/`, license text in `OFL.txt` there |
| JetBrains Mono | 2.211 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/jetbrainsmono) | `app/public/catalog/jetbrains-mono/`, license text in `OFL.txt` there |
| Sono | 2.112 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/sono) | `app/public/catalog/sono/`, license text in `OFL.txt` there |
| Caveat | 2.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/caveat) | `app/public/catalog/caveat/`, license text in `OFL.txt` there |
<!-- end of catalog fonts -->

## App libraries

Code from these packages is served with the app and runs in the user's browser.

| Library | Version | License | Source | Where |
|---|---|---|---|---|
| harfbuzzjs, the `harfbuzz-subset.wasm` build | 1.6.4 | MIT | [harfbuzz/harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) | makes the font files people download (`app/src/core/harfbuzz.ts`); license text in `app/public/licenses/harfbuzz.txt` |
| HarfBuzz, compiled into that wasm file | 15.0.0 | Old MIT | [harfbuzz/harfbuzz](https://github.com/harfbuzz/harfbuzz) at the commit harfbuzzjs 1.6.4 pins | same file as above, with its copyright notice |
| woff2-encoder | 2.0.0 | MIT | [itskyedo/woff2-encoder](https://github.com/itskyedo/woff2-encoder) | makes the WOFF2 files people download (`app/src/ui/woff2.worker.ts`); license text in `app/public/licenses/woff2.txt` |
| WOFF2, compiled into woff2-encoder | commit 4721483 (2022) | MIT | [google/woff2](https://github.com/google/woff2) | same file as above |
| Brotli, compiled into woff2-encoder | 1.0.3 | MIT | [google/brotli](https://github.com/google/brotli) | same file as above |

woff2-encoder also carries Brotli's decoder, whose versions before 1.0.9 mishandle some crafted input (CVE-2020-8927). Fontbend only encodes fonts it has just made and never decodes WOFF2 with it.

## Build tools

These run on the developer's computer and in CI to check and build Fontbend; none of their code is in what the site serves.

| Tool | Version | License | Source |
|---|---|---|---|
| TypeScript | 7.0.2 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| Vite | 8.3.8 | MIT | [vitejs/vite](https://github.com/vitejs/vite) |
| Vitest | 5.1.1 | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| Wrangler | 4.162.0 | MIT OR Apache-2.0 | [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) |

Their own dependencies are permissive too, except lightningcss (MPL-2.0), the CSS minifier Vite brings, and the libvips binaries (LGPL-3.0) in sharp, which Wrangler brings. They only run while building or uploading the site, so their licenses set no duty on Fontbend. `tools/check_licenses.py` reads the license file of every installed package and fails on anything else.
