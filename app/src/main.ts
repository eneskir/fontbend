import "./styles.css";
import data from "./catalog.json";
import { parseCatalog } from "./core/catalog";
import { startEditing } from "./core/editor";
import { madeNames } from "./core/download";
import { createStore } from "./store";
import { adjustPanel } from "./ui/adjust";
import { h } from "./ui/dom";
import { download } from "./ui/download";
import { fontList } from "./ui/fontList";
import { preview } from "./ui/preview";
import { themeMenu } from "./ui/theme";
import { wear } from "./ui/wear";

const catalog = parseCatalog(data);
const store = createStore(startEditing(catalog.fonts[0]!));

const docName = h("h1", { class: "doc-name" });
// The same name the Download panel writes into the font.
const name = () => { const s = store.get(); docName.textContent = madeNames(s.font, s.name ?? "", s.font.axes, s.settings.axes).family; };
name();
store.subscribe((now, before) => { if (now.font !== before.font || now.name !== before.name) name(); });
const dl = download(store);

const app = document.getElementById("app")!;
wear(store, app, docName);
app.replaceChildren(
  h("header", { class: "app-bar" }, docName, h("span", { class: "bar-end" }, dl.button)),
  h("div", { class: "workspace" }, h("div", { class: "drawer-column" }, fontList(store, catalog), themeMenu()), preview(store), adjustPanel(store)),
  dl.panel,
);
