import type { Lang } from "../i18n";

/** Preview texts. The paragraph is Article 1 of the Universal Declaration of Human Rights. */
export const SAMPLES = {
  pangram: {
    line: "Sphinx of black quartz, judge my vow.",
    paragraph: "All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood.",
    source: "Universal Declaration of Human Rights, Article 1",
    lang: "en",
  },
  turkish: {
    line: "Pijamalı hasta yağız şoföre çabucak güvendi.",
    paragraph: "Bütün insanlar hür, haysiyet ve haklar bakımından eşit doğarlar. Akıl ve vicdana sahiptirler ve birbirlerine karşı kardeşlik zihniyeti ile hareket etmelidirler.",
    source: "İnsan Hakları Evrensel Beyannamesi, 1. madde",
    lang: "tr",
  },
  spanish: {
    line: "Jovencillo emponzoñado de whisky: ¡qué figurota exhibe!",
    paragraph: "Todos los seres humanos nacen libres e iguales en dignidad y derechos y, dotados como están de razón y conciencia, deben comportarse fraternalmente los unos con los otros.",
    source: "Declaración Universal de Derechos Humanos, artículo 1",
    lang: "es",
  },
  portuguese: {
    line: "Luís argüia à Júlia que «brações, fé, chá, óxido, pôr, zângão» eram palavras do português.",
    paragraph: "Todos os seres humanos nascem livres e iguais em dignidade e em direitos. Dotados de razão e de consciência, devem agir uns para com os outros em espírito de fraternidade.",
    source: "Declaração Universal dos Direitos Humanos, artigo 1",
    lang: "pt",
  },
  french: {
    line: "Voix ambiguë d’un cœur qui, au zéphyr, préfère les jattes de kiwis.",
    paragraph: "Tous les êtres humains naissent libres et égaux en dignité et en droits. Ils sont doués de raison et de conscience et doivent agir les uns envers les autres dans un esprit de fraternité.",
    source: "Déclaration universelle des droits de l’homme, article premier",
    lang: "fr",
  },
  german: {
    line: "Victor jagt zwölf Boxkämpfer quer über den großen Sylter Deich.",
    paragraph: "Alle Menschen sind frei und gleich an Würde und Rechten geboren. Sie sind mit Vernunft und Gewissen begabt und sollen einander im Geist der Brüderlichkeit begegnen.",
    source: "Allgemeine Erklärung der Menschenrechte, Artikel 1",
    lang: "de",
  },
  indonesian: {
    line: "Muharjo seorang xenofobia universal yang takut pada warga jazirah, contohnya Qatar.",
    paragraph: "Semua orang dilahirkan merdeka dan mempunyai martabat dan hak-hak yang sama. Mereka dikaruniai akal dan hati nurani dan hendaknya bergaul satu sama lain dalam semangat persaudaraan.",
    source: "Deklarasi Universal Hak Asasi Manusia, Pasal 1",
    lang: "id",
  },
  russian: {
    line: "Съешь же ещё этих мягких французских булок, да выпей чаю.",
    paragraph: "Все люди рождаются свободными и равными в своем достоинстве и правах. Они наделены разумом и совестью и должны поступать в отношении друг друга в духе братства.",
    source: "Всеобщая декларация прав человека, статья 1",
    lang: "ru",
  },
  alphabet: {
    line: "Aa Bb Cc Çç Dd Ee Ff Gg Ğğ Hh Iı İi Jj Kk",
    paragraph: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ abcçdefgğhıijklmnoöprsştuüvyz 0123456789 fi fl & ? ! « » “ ” ‘ ’",
    source: "",
    lang: "tr",
  },
} as const;

export type SampleId = keyof typeof SAMPLES;
export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

/** The sample each interface language opens on, so its own letters show first. */
export const LANG_SAMPLE: Readonly<Record<Lang, SampleId>> = {
  en: "pangram", tr: "turkish", de: "german", es: "spanish", fr: "french", id: "indonesian", pt: "portuguese", ru: "russian",
};

/** Sizes of the smaller preview lines under the main one, as in the design. */
export const WATERFALL = [40, 32, 24, 20] as const;
export const SIZES = [24, 32, 48, 64, 96, 128, 160] as const;
