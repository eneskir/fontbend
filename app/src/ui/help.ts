/** The Help menu at the foot of the drawer (design: Help, Theme, language): where to report a problem and read about Fontbend. */
import { t } from "../i18n";
import { h } from "./dom";
import { REPOSITORY } from "./language";
import { footMenu } from "./menu";

/** The About page (about, licences, privacy, source code), next to the app on fontbend.com. */
const ABOUT = "/about/";
/** The repository's bug form; an error's code (FB-…) goes in it. */
const REPORT = `${REPOSITORY}/issues/new?template=1-bug.yml`;

export function helpMenu(): HTMLElement {
  const link = (href: string, key: "help.report" | "help.about") => h("a", { class: "menu-link", href, target: "_blank", rel: "noopener" }, t(key));
  return footMenu("help-menu", t("help.title"), [h("span", { class: "icon-text", "aria-hidden": "true" }, "?"), t("help.title")],
    [link(REPORT, "help.report"), link(ABOUT, "help.about")]);
}
