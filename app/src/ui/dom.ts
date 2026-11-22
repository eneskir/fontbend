type Attr = string | number | boolean | undefined;
type Props = { [key: string]: Attr | ((event: Event) => void) };

/** Builds an element: props starting with "on" become listeners, true sets an empty attribute, false and undefined are left out. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else if (value !== false && value !== undefined) el.setAttribute(key, String(value));
  }
  el.append(...children);
  return el;
}
