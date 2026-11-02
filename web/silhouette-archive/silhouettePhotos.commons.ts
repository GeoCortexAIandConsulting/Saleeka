/**
 * Credits for photos in web/public/silhouettes/<women|men>/<style>/, keyed by the photo's URL.
 * The quiz shows whatever is in those folders; this list adds the author and licence, shown on
 * hover and on /credits (CC BY and CC BY-SA require crediting the author).
 * Add an entry here whenever you drop in a photo that needs credit.
 * Files named wc-*.jpg are Wikimedia Commons photos; they sort after your own photos, so yours show first.
 */
export interface PhotoCredit {
  title?: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
}

export const PHOTO_CREDITS: Record<string, PhotoCredit> = {
  "/silhouettes/women/shalwar-kameez/wc-1.jpg": { title: "Shivani rajput in salwar.jpg", author: "Shivani rajput", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Shivani_rajput_in_salwar.jpg" },
  "/silhouettes/women/shalwar-kameez/wc-2.jpg": { title: "Salwar Suit.jpg", author: "ਕੁਲਜੀਤ ਕੌਰ", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Salwar_Suit.jpg" },
  "/silhouettes/women/shalwar-kameez/wc-3.jpg": { title: "In my salwar suit.jpg", author: "Linda", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0", source: "https://commons.wikimedia.org/wiki/File:In_my_salwar_suit.jpg" },
  "/silhouettes/women/shirt-trouser/wc-1.jpg": { title: "Latest Design and Patterns in Palazzo Suits.jpg", author: "Zoya36", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Latest_Design_and_Patterns_in_Palazzo_Suits.jpg" },
  "/silhouettes/women/anarkali/wc-1.jpg": { title: "Yogita Grover, Well Groomed Fashion Show (5420850558).jpg", author: "Brendan", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0", source: "https://commons.wikimedia.org/wiki/File:Yogita_Grover,_Well_Groomed_Fashion_Show_(5420850558).jpg" },
  "/silhouettes/women/anarkali/wc-2.jpg": { title: "Illustrator Anarkali.png", author: "Monikaa Baskar", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Illustrator_Anarkali.png" },
  "/silhouettes/women/sharara/wc-1.jpg": { title: "Gharara.jpg", author: "Farmina Khan", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Gharara.jpg" },
  "/silhouettes/women/sharara/wc-2.jpg": { title: "The Gharara, Pakistan Quarterly (1950).jpg", author: "Staff of Pakistan Quarterly", license: "Public domain", licenseUrl: "", source: "https://commons.wikimedia.org/wiki/File:The_Gharara,_Pakistan_Quarterly_(1950).jpg" },
  "/silhouettes/women/angrakha/wc-1.jpg": { title: "Angarkha MET CI64.78.2 F.jpg", author: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Angarkha_MET_CI64.78.2_F.jpg" },
  "/silhouettes/women/angrakha/wc-2.jpg": { title: "MFM - Angrakha.jpg", author: "Wolfgang Sauber", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:MFM_-_Angrakha.jpg" },
  "/silhouettes/women/angrakha/wc-3.jpg": { title: "Angarkha MET 1976.149.4 B.jpg", author: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Angarkha_MET_1976.149.4_B.jpg" },
  "/silhouettes/women/a-line/wc-1.jpg": { title: "Kurta MET CI50.16.6 F.jpg", author: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Kurta_MET_CI50.16.6_F.jpg" },
  "/silhouettes/women/a-line/wc-2.jpg": { title: "Kurta MET CI43.90.44 F.jpg", author: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Kurta_MET_CI43.90.44_F.jpg" },
  "/silhouettes/women/a-line/wc-3.jpg": { title: "Kurta MET CI43.84.10 F.jpg", author: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Kurta_MET_CI43.84.10_F.jpg" },
  "/silhouettes/women/peplum/wc-1.jpg": { title: "Peplum jacket.jpg", author: "David Ring", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Peplum_jacket.jpg" },
};
