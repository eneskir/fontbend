# Fontbend

[English](README.md) | Türkçe

Tarayıcıda çalışan, Türkçe ve İngilizce, ücretsiz ve açık kaynaklı bir font yapıcı. Katalogdan bir font seç, sürgülerle biçim ver, hangi dilleri desteklediğine bak ve lisansıyla birlikte indir.

Fontbend geliştirme aşamasında. İlk sürüme kadar [fontbend.com](https://fontbend.com) bir bekleme sayfası gösteriyor.

## Yapay zekâ ajanları ve diğer araçlar için

Uygulama yayımlandığında adresinin kökünde iki dosya sunar: `/llms.txt` ve `/catalog.json`. İkisi de her derlemede depodaki `app/src/catalog.json`'dan üretilir.

- `llms.txt`: Fontbend'in ne olduğu, her fontun hangi işe yaradığı, eksenleri ve denemek için bir ayar bağlantısı.
- `catalog.json`: her font ve eksenleri, `schemaVersion` 1. Alanları [README.md](README.md) dosyasında anlatılıyor (İngilizce).

Ayar bağlantısı uygulamanın adresiyle başlar, ardından `#v=1&f=<font kimliği>` gelir. Varsayılandan oynatılan her eksen için `&<eksen etiketi>=<değer>` eklenir. Sonda iki zorunlu parça vardır. `&sub=` kalan karakterleri söyler: `all` (bütün glifler), `western` (Windows-1252'nin çizdikleri) ya da `basic` (yazdırılabilir ASCII). `&out=` dosyaları söyler: `ttf`, `woff2` ya da ikisi virgülle. Eksenin erişimi dışındaki değer ucuna çekilir, fontta olmayan eksen atlanır. Bağlantı fontu bu ayarlarla açar, bir şey indirmez. Örnek: `/#v=1&f=fraunces&wdth=90&wght=820&sub=all&out=ttf,woff2`.

## Bilgisayarında çalıştır

Node.js 22.12 ya da üstü gerekir. Deponun kök klasöründe önce `npm ci --ignore-scripts`, sonra `npm run dev` çalıştır ve yazdığı adresi aç. `npm test` testleri çalıştırır, `npm run build` uygulamayı `dist/` klasörüne yazar.

## Nasıl geliştiriliyor

Fontbend'i Enes Kır tasarlıyor ve her değişikliği onaylıyor. Kodu Claude Code yazıyor.

## Lisans

- Kod: [MIT Lisansı](LICENSE).
- Fontlar: her font kendi lisansını korur. Lisanslar [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) dosyasında yer alıyor. SIL Open Font License'lı bir fonttan yaptığın yeni font da aynı lisansı taşır. Katalogdaki fontların saklı adı yok. Açtığın font dosyası adını saklı tutuyorsa Fontbend senden yeni bir ad ister.
- Fontbend adının ve logosunun kullanımını MIT Lisansı değil, [TRADEMARKS.md](TRADEMARKS.md) belirliyor.

## Katkı

Hata bildirimlerini, çeviri düzeltmelerini ve fikirlerini [issue formlarıyla](https://github.com/eneskir/fontbend/issues/new/choose) gönderebilirsin. Dışarıdan pull request şimdilik kabul edilmiyor. Katkı kuralları [CONTRIBUTING.md](CONTRIBUTING.md) dosyasında (İngilizce). Bir güvenlik sorunu bulursan [SECURITY.md](SECURITY.md) dosyasına bak.
