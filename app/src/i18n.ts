/**
 * The interface language. Every text the user reads comes from locales/<lang>.json by an English
 * key; en.json is the source, and a test keeps every other file to its keys. Font names, file
 * names, sample texts and the signature written into fonts stay as they are in every language.
 */
import de from "./locales/de.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import id from "./locales/id.json" with { type: "json" };
import pt from "./locales/pt.json" with { type: "json" };
import ru from "./locales/ru.json" with { type: "json" };
import tr from "./locales/tr.json" with { type: "json" };

export type Lang = "en" | "tr" | "de" | "es" | "fr" | "id" | "pt" | "ru";
export type Key = keyof typeof en;
/** Keys with a form per count ("share.changes.one", "share.changes.other"), named without the ending. */
export type CountKey = { [K in Key]: K extends `${infer B}.one` ? B : never }[Key];
type Vars = Readonly<Record<string, string | number>>;

/**
 * The interface languages, each named in its own language. `checked`: a person who reads the language
 * has read every text; the others are machine translations waiting for one. `beta`: the interface
 * font lacks the script, so the text shows in the system font.
 */
export const LANGS: readonly { readonly code: Lang; readonly name: string; readonly checked: boolean; readonly beta?: true }[] = [
  { code: "en", name: "English", checked: true },
  { code: "tr", name: "Türkçe", checked: true },
  { code: "id", name: "Bahasa Indonesia", checked: false },
  { code: "de", name: "Deutsch", checked: false },
  { code: "es", name: "Español", checked: false },
  { code: "fr", name: "Français", checked: false },
  { code: "pt", name: "Português", checked: false },
  { code: "ru", name: "Русский", checked: false, beta: true },
];
/** Languages named in the menu but not offered yet: they need their own fonts, samples and, for Arabic, a right-to-left layout. */
export const SOON: readonly { readonly code: string; readonly name: string; readonly dir?: "rtl" }[] = [
  { code: "zh", name: "中文" },
  { code: "hi", name: "हिन्दी" },
  { code: "ar", name: "العربية", dir: "rtl" },
];
export const MESSAGES: Readonly<Record<Lang, Readonly<Record<string, string>>>> = { en, tr, de, es, fr, id, pt, ru };
const KEY = "fontbend.lang";

/** A saved choice wins; else the first of the browser's languages Fontbend has; else English. */
export function pickLang(saved: string | null, preferred: readonly string[]): Lang {
  const known = (code: string) => LANGS.find((l) => l.code === code.toLowerCase().split("-")[0])?.code;
  return (saved && known(saved)) || preferred.map(known).find((l) => l !== undefined) || "en";
}

function savedLang(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

// Set once, before any text is made: the page reloads to change it (ui/language.ts), with ?lang= where
// the browser keeps nothing. Tests run in English.
let lang: Lang = typeof document === "undefined" ? "en"
  : pickLang(new URLSearchParams(location.search).get("lang") ?? savedLang(), navigator.languages ?? [navigator.language]);
if (typeof document !== "undefined") document.documentElement.lang = lang;

export const currentLang = (): Lang => lang;

/** Saves a choice for the next time the page opens; false when the browser keeps nothing. */
export function saveLang(next: Lang): boolean {
  try { localStorage.setItem(KEY, next); return true; } catch { return false; }
}

/** For tests: texts in another language. */
export function useLang(next: Lang): void { lang = next; }

/** The text for `key`, each {name} replaced by its value; numbers are written as the language writes them. */
export function t(key: Key, vars: Vars = {}): string {
  const text = MESSAGES[lang][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    const v = vars[name];
    return v === undefined ? all : typeof v === "number" ? num(v) : v;
  });
}

/** The form of `key` for a count, which also fills {n}. */
export function tn(key: CountKey, n: number, vars: Vars = {}): string {
  const form = new Intl.PluralRules(lang).select(n) === "one" ? "one" : "other";
  return t(`${key}.${form}` as Key, { n, ...vars });
}

/** A number with at most `decimals` decimals, no grouping: "1.5", in Turkish "1,5". */
export function num(n: number, decimals = 2): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: decimals, useGrouping: false }).format(n);
}

/** The space these languages put before the percent sign: French a narrow one, the others a no-break space. */
const PERCENT_SPACE: Partial<Record<Lang, string>> = { de: "\u00A0", es: "\u00A0", fr: "\u202F", ru: "\u00A0" };

/** A written number with its unit: Turkish puts the percent sign first ("%75", "+%5"); French, German, Spanish and Russian put a space before it. */
export function withUnit(text: string, unit: string): string {
  if (unit === "%" && PERCENT_SPACE[lang]) return text + PERCENT_SPACE[lang] + unit;
  if (unit !== "%" || lang !== "tr") return text + unit;
  const sign = /^[+\-−]/.test(text) ? text.charAt(0) : "";
  return `${sign}%${text.slice(sign.length)}`;
}

/** "A", "A and B", "A, B and C" in the interface language. */
export function listText(items: readonly string[]): string {
  return new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
}

/** The text with its first letter capitalized as the language does it (Turkish i → İ). */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
}

/** Folds letters for search: case, accents and the Turkish dotted and dotless i ("İnter", "ınter" find Inter). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase();
}
