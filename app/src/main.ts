import "./styles.css";
import data from "./catalog.json";
import { parseCatalog } from "./core/catalog";
import { startEditing } from "./core/editor";
import { madeNames } from "./core/download";
import { createStore } from "./store";
import { adjustPanel } from "./ui/adjust";
import { h } from "./ui/dom";
import { download } from "./ui/download";
import { drawerTabs } from "./ui/drawer";
import { fontList } from "./ui/fontList";
import { preview } from "./ui/preview";
import { recent } from "./ui/recent";
import { copyLinkButton, sharedLinks } from "./ui/share";
import { themeMenu } from "./ui/theme";
import { wear } from "./ui/wear";

const catalog = parseCatalog(data);
const store = createStore(startEditing(catalog.fonts[0]!));
const recentFonts = recent(store, catalog, () => tabs.select("fonts"));
const links = sharedLinks(store, catalog, recentFonts);
// A shared link wins, else the latest Recent font comes back; both before anything is drawn, so no font is fetched for nothing.
if (!links.open()) recentFonts.openLatest();

const docName = h("h1", { class: "doc-name" });
// The same name the Download panel writes into the font.
const name = () => { const s = store.get(); docName.textContent = madeNames(s.font, s.name ?? "", s.font.axes, s.settings.axes).family; };
name();
store.subscribe((now, before) => { if (now.font !== before.font || now.name !== before.name) name(); });
const dl = download(store);

const fonts = fontList(store, catalog);
const tabs = drawerTabs([
  { id: "fonts", label: "Fonts", icon: h("span", { class: "icon-text", "aria-hidden": "true" }, "Aa"), panel: fonts },
  { id: "recent", label: "Recent", icon: h("span", { class: "icon icon-recent", "aria-hidden": "true" }), panel: recentFonts.view, shown: recentFonts.render },
]);

const app = document.getElementById("app")!;
wear(store, app, docName);
app.replaceChildren(
  h("header", { class: "app-bar" }, docName, h("span", { class: "bar-end" }, copyLinkButton(store), dl.button)),
  h("div", { class: "workspace" }, h("div", { class: "drawer-column" }, tabs.bar, fonts, recentFonts.view, themeMenu()), preview(store, links.banner), adjustPanel(store)),
  dl.panel,
);
