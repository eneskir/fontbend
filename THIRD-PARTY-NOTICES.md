# Third-party notices

Fontbend's own code is under the [MIT License](LICENSE). The parts below come from others and keep their own licenses.

| Component | Version | License | Source | Where |
|---|---|---|---|---|
| Recursive, Sans Linear cut, Basic Latin subset | 1.085 | SIL Open Font License 1.1 | [arrowtype/recursive](https://github.com/arrowtype/recursive), file from [google/fonts](https://github.com/google/fonts/tree/main/ofl/recursive) | `site/fonts/recursive-sans.<hash>.woff2`, license text in `site/fonts/OFL.txt` |
| Recursive, text cut (MONO 0.3, CASL 0.25) and mono cut (MONO 1, CASL 0.25), Latin-1, Latin Extended-A and punctuation subset | 1.085 | SIL Open Font License 1.1 | same as above | `preview/fonts/recursive-text.<hash>.woff2` and `preview/fonts/recursive-mono.<hash>.woff2`; the preview is served on top of `site/`, so `site/fonts/OFL.txt` comes with them |

Recursive is instanced and subset by `scripts/build-site-font.py`. It declares no Reserved Font Name.

## Catalog fonts

The fonts people start from in the app. Each file is an unchanged copy from google/fonts at the linked commit, with its own `OFL.txt`; none declares a Reserved Font Name, which `app/src/core/catalog.ts` checks.

<!-- catalog fonts: written by scripts/build-catalog.py -->
| Font | Version | License | Source | Where |
|---|---|---|---|---|
| Roboto Flex | 3.200 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/robotoflex) | `app/public/fonts/roboto-flex/`, license text in `OFL.txt` there |
| Recursive | 1.085 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/recursive) | `app/public/fonts/recursive/`, license text in `OFL.txt` there |
| Commissioner | 1.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/commissioner) | `app/public/fonts/commissioner/`, license text in `OFL.txt` there |
| Bricolage Grotesque | 1.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/bricolagegrotesque) | `app/public/fonts/bricolage-grotesque/`, license text in `OFL.txt` there |
| Instrument Sans | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/instrumentsans) | `app/public/fonts/instrument-sans/`, license text in `OFL.txt` there |
| Nunito | 3.602 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/nunito) | `app/public/fonts/nunito/`, license text in `OFL.txt` there |
| Inter | 4.001 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/inter) | `app/public/fonts/inter/`, license text in `OFL.txt` there |
| Geologica | 1.010 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/geologica) | `app/public/fonts/geologica/`, license text in `OFL.txt` there |
| Science Gothic | 1.035 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/sciencegothic) | `app/public/fonts/science-gothic/`, license text in `OFL.txt` there |
| Literata | 3.103 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/literata) | `app/public/fonts/literata/`, license text in `OFL.txt` there |
| Fraunces | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/fraunces) | `app/public/fonts/fraunces/`, license text in `OFL.txt` there |
| Playfair | 2.203 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/playfair) | `app/public/fonts/playfair/`, license text in `OFL.txt` there |
| Newsreader | 1.003 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/newsreader) | `app/public/fonts/newsreader/`, license text in `OFL.txt` there |
| Montagu Slab | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/montaguslab) | `app/public/fonts/montagu-slab/`, license text in `OFL.txt` there |
| Big Shoulders | 2.002 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/bigshoulders) | `app/public/fonts/big-shoulders/`, license text in `OFL.txt` there |
| Shantell Sans | 1.011 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/shantellsans) | `app/public/fonts/shantell-sans/`, license text in `OFL.txt` there |
| Martian Mono | 1.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/martianmono) | `app/public/fonts/martian-mono/`, license text in `OFL.txt` there |
| JetBrains Mono | 2.211 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/jetbrainsmono) | `app/public/fonts/jetbrains-mono/`, license text in `OFL.txt` there |
| Sono | 2.112 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/sono) | `app/public/fonts/sono/`, license text in `OFL.txt` there |
| Caveat | 2.000 | SIL Open Font License 1.1 | [google/fonts](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/caveat) | `app/public/fonts/caveat/`, license text in `OFL.txt` there |
<!-- end of catalog fonts -->

## Build tools

These run on the developer's computer and in CI to check and build Fontbend; none of their code is in what the site serves.

| Tool | Version | License | Source |
|---|---|---|---|
| TypeScript | 7.0.2 | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| Vite | 8.3.8 | MIT | [vitejs/vite](https://github.com/vitejs/vite) |
| Vitest | 5.1.1 | MIT | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) |

Their own dependencies are permissive too, except lightningcss (MPL-2.0), the CSS minifier Vite brings. It only runs during the build, so its license sets no duty on Fontbend. `tools/check_licenses.py` reads the license file of every installed package and fails on anything else.
