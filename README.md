# Fontbend

English | [Türkçe](README.tr.md)

A free, open-source font maker that runs in your browser. Pick a font from the catalog, shape it with sliders, see which languages it covers and download it with its license.

Fontbend is in development. Until the first release, [fontbend.com](https://fontbend.com) shows a placeholder page.

## For AI agents and other tools

The app publishes its catalog at its root, made from `app/src/catalog.json` on every build:

- `llms.txt`: what Fontbend is, what each font suits, its axes and a settings link to try it.
- `catalog.json`, `schemaVersion` 1. `source` is the google/fonts commit the fonts come from; `link` is the settings link format. Each font in `fonts` has `id`, `family`, `category` (`sans`, `serif`, `slab`, `display`, `mono` or `handwriting`), `version`, `license` (`OFL-1.1`), `copyright`, `glyphs`, `turkish`, `source` (the font file at that commit) and `axes`. Each axis has `tag`, `name`, the font's own `min`, `default` and `max`, `reach` (how far Fontbend moves it, past the font's range on Weight, Width and Slant) and `addedByFontbend` when the font has no such axis and Fontbend adds it.

A settings link is the app's address followed by `#v=1&f=<id>`, one `&<tag>=<value>` per changed axis, `&sub=all|western|basic` and `&out=ttf,woff2`.

## How it is made

Enes Kır designs Fontbend and approves every change. Claude Code writes the code.

## License

- Code: [MIT License](LICENSE).
- Fonts: each font keeps its own license, listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). A font you make from an SIL Open Font License font stays under that license.
- The Fontbend name and logo are not licensed under the MIT License. See [TRADEMARKS.md](TRADEMARKS.md).

## Contributing

Bug reports, translation fixes and ideas are welcome through the issue forms. Pull requests from outside the project aren't accepted for now. See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).
