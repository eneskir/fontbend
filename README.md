# Fontbend

English | [Türkçe](README.tr.md)

A free, open-source font maker that runs in your browser. Pick a font from the catalog, shape it with sliders, see which languages it covers and download it with its license.

The interface is in English and Turkish. German, Spanish, French, Indonesian, Portuguese and Russian are machine translations no one has checked yet. Fixes through the [translation form](https://github.com/eneskir/fontbend/issues/new?template=2-translation.yml) are welcome.

Fontbend runs at [fontbend.com](https://fontbend.com).

## For AI agents and other tools

fontbend.com serves two files at its root: `/llms.txt` and `/catalog.json`. Every build makes both from the repository's `app/src/catalog.json`, so they are not copies of it.

- `llms.txt`: what Fontbend is, what each font suits, its axes and a settings link to try it.
- `catalog.json`: every font with its axes, at `schemaVersion` 1. The version goes up when a field changes meaning or is removed.

| Field | What it holds |
|---|---|
| `source` | `repository` (`google/fonts`) and `commit`, the full hash of the commit the font files come from |
| `link` | the settings link format below |
| `fonts[].id` | the font's id in settings links |
| `fonts[].family`, `version`, `copyright` | strings from the font file |
| `fonts[].category` | `sans`, `serif`, `slab`, `display`, `mono` or `handwriting` |
| `fonts[].license` | `OFL-1.1`, for every catalog font |
| `fonts[].glyphs` | the number of glyphs in the font |
| `fonts[].turkish` | always `true`: the catalog takes only fonts with every Turkish letter |
| `fonts[].source` | the font file's GitHub page at that commit (`https://github.com/google/fonts/blob/<commit>/<path>`) |
| `fonts[].axes[].tag`, `name` | the axis tag (`wght`) and its English name (`Weight`) |
| `fonts[].axes[].min`, `default`, `max` | the font's range for the axis, or Fontbend's range for an axis it adds |
| `fonts[].axes[].reach` | `{ "min", "max" }` numbers: how far Fontbend moves the axis, on every axis half its span past each end |
| `fonts[].axes[].addedByFontbend` | `true` on Width or Slant when the font lacks it and Fontbend adds it, absent otherwise |

A settings link is the app's address followed by `#v=1&f=<id>`, one `&<tag>=<value>` for each axis moved from its default, then two required parts:

- `&sub=`: the characters kept, `all` (every glyph), `western` (what Windows-1252 draws) or `basic` (printable ASCII).
- `&out=`: the files, `ttf`, `woff2` or both comma-separated in any order.

A value outside an axis's reach is moved to its end, and a tag the font lacks is left out. The link opens the font at those settings and downloads nothing. `v=1` is the version of the link format, separate from `schemaVersion`. For example: `/#v=1&f=fraunces&wdth=90&wght=820&sub=all&out=ttf,woff2`.

## Run it locally

Fontbend needs Node.js 22.12 or later. From the repository's root, run `npm ci --ignore-scripts`, then `npm run dev` and open the address it prints. `npm test` runs the tests, and `npm run build` writes the app to `dist/`.

## How it is made

Enes Kır designs Fontbend and approves every change. Claude Code writes the code.

## License

- Code: [MIT License](LICENSE).
- Fonts: each font keeps its own license, listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). A font you make from an SIL Open Font License font stays under that license. Catalog fonts reserve no font names. When a font file you open reserves its name, Fontbend asks you for a new one.
- The Fontbend name and logo are not licensed under the MIT License. See [TRADEMARKS.md](TRADEMARKS.md).

## Contributing

Bug reports, translation fixes and ideas are welcome through the [issue forms](https://github.com/eneskir/fontbend/issues/new/choose). Pull requests from outside the project aren't accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).
