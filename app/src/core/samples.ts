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
  alphabet: {
    line: "Aa Bb Cc Çç Dd Ee Ff Gg Ğğ Hh Iı İi Jj Kk",
    paragraph: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ abcçdefgğhıijklmnoöprsştuüvyz 0123456789 fi fl & ? ! « » “ ” ‘ ’",
    source: "",
    lang: "tr",
  },
} as const;

export type SampleId = keyof typeof SAMPLES;
export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

/** Sizes of the smaller preview lines under the main one, as in the design. */
export const WATERFALL = [40, 32, 24, 20] as const;
export const SIZES = [24, 32, 48, 64, 96, 128, 160] as const;
