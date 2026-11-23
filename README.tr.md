# Fontbend

[English](README.md) | Türkçe

Tarayıcıda çalışan ücretsiz, açık kaynak bir font yapıcı. Katalogdan bir font seç, sürgülerle biçim ver, hangi dilleri desteklediğine bak ve lisansıyla birlikte indir.

Fontbend geliştirme aşamasında. İlk sürüme kadar [fontbend.com](https://fontbend.com) bir bekleme sayfası gösteriyor.

## Yapay zekâ ajanları ve diğer araçlar için

Uygulama kataloğunu kök adresinde iki dosyayla yayımlar. İkisi de her derlemede `app/src/catalog.json`'dan üretilir:

- `llms.txt`: Fontbend'in ne olduğu, her fontun hangi işe yaradığı, eksenleri ve denemek için bir ayar bağlantısı.
- `catalog.json`: alanları [README.md](README.md) dosyasında (İngilizce).

## Nasıl geliştiriliyor

Fontbend'i Enes Kır tasarlıyor ve her değişikliği onaylıyor. Kodu Claude Code yazıyor.

## Lisans

- Kod: [MIT Lisansı](LICENSE).
- Fontlar: her font kendi lisansını korur. Lisanslar [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) dosyasında listeli. SIL Open Font License'lı bir fonttan yaptığın yeni font da aynı lisansı taşır.
- Fontbend adının ve logosunun kullanımını MIT Lisansı değil, [TRADEMARKS.md](TRADEMARKS.md) belirliyor.

## Katkı

Hata bildirimlerini, çeviri düzeltmelerini ve fikirlerini issue formlarıyla gönderebilirsin. Dışarıdan pull request şimdilik kabul edilmiyor. Katkı kuralları [CONTRIBUTING.md](CONTRIBUTING.md) dosyasında (İngilizce). Bir güvenlik sorunu bulursan [SECURITY.md](SECURITY.md) dosyasına bak.
