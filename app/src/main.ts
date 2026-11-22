import "./styles.css";
import data from "./catalog.json";
import { parseCatalog } from "./core/catalog";
import { startEditing } from "./core/editor";
import { createStore } from "./store";
import { adjustPanel } from "./ui/adjust";
import { h } from "./ui/dom";
import { fontList } from "./ui/fontList";
import { preview } from "./ui/preview";

const catalog = parseCatalog(data);
const store = createStore(startEditing(catalog.fonts[0]!));

const docName = h("h1", { class: "doc-name" });
const name = () => { docName.textContent = `My ${store.get().font.family}`; };
name();
store.subscribe((now, before) => { if (now.font !== before.font) name(); });

document.getElementById("app")!.replaceChildren(
  h("header", { class: "app-bar" }, h("span", { class: "app-name" }, "Fontbend"), h("span", { class: "divider" }), docName),
  h("div", { class: "workspace" }, fontList(store, catalog), preview(store), adjustPanel(store)),
);
