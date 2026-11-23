/** Which Latin languages a made font can write: the letters each one needs beyond ASCII. */

export type Group = { readonly name: string; readonly letters: readonly string[] };

export type GroupResult = { readonly name: string; readonly total: number; readonly have: number; readonly missing: readonly string[] };

const letters = (s: string) => [...s.replace(/ /g, "")];

export const GROUPS: readonly Group[] = [
  { name: "Czech", letters: letters("Áá Čč Ďď Éé Ěě Íí Ňň Óó Řř Šš Ťť Úú Ůů Ýý Žž") },
  { name: "French", letters: letters("Àà Ââ Ææ Çç Éé Èè Êê Ëë Îî Ïï Ôô Œœ Ùù Ûû Üü Ÿÿ") },
  { name: "German", letters: letters("Ää Öö Üü ẞß") },
  { name: "Nordic", letters: letters("Åå Ææ Øø Ää Öö Ðð Þþ") },
  { name: "Polish", letters: letters("Ąą Ćć Ęę Łł Ńń Óó Śś Źź Żż") },
  { name: "Portuguese", letters: letters("Àà Áá Ââ Ãã Çç Éé Êê Íí Óó Ôô Õõ Úú") },
  { name: "Spanish", letters: letters("Áá Éé Íí Ññ Óó Úú Üü ¡¿") },
  { name: "Turkish", letters: letters("Çç Ğğ İı Öö Şş Üü") },
];

/** The row in the Download panel: letters from several groups that fonts often leave out. */
export const SAMPLE = letters("Åçðßłøşğİıžő");

export function checkCharacters(chars: ReadonlySet<number>): GroupResult[] {
  return GROUPS.map(({ name, letters }) => {
    const missing = letters.filter((l) => !chars.has(l.codePointAt(0)!));
    return { name, total: letters.length, have: letters.length - missing.length, missing };
  });
}
