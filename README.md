# Maç Rehberi

Türkiye üst ligleri, Şampiyonlar Ligi (UEFA / FIBA / CEV) ve A milli takım maçlarının
yayın rehberi. Hangi kanalda, hangi platformda, hangi tarihte ve saatte yayınlandığını gösterir.

Berkay Çelik tarafından hazırlanmıştır. Kişisel kullanım içindir.

## Nasıl çalışır

- `scripts/fetch.py` yaklaşık 30 dakikada bir GitHub Actions üzerinde çalışır ve `docs/data.json` dosyasını günceller.
  - Yayın takvimi ve kanallar: Spor Ekranı (sporekrani.com) günlük sayfaları
  - Futbol skorları: ESPN
- `docs/` klasörü GitHub Pages ile yayınlanır. Telefonda "Ana ekrana ekle" ile uygulama gibi kullanılır.

## Kapsam

| Branş | Kulüp | Milli (A takım, resmi) |
|---|---|---|
| Futbol (erkek) | Trendyol Süper Lig, UEFA Şampiyonlar Ligi | Erkek |
| Basketbol | BSL, KBSL, FIBA Şampiyonlar Ligi | Kadın + Erkek |
| Voleybol | Efeler Ligi, Sultanlar Ligi, CEV Şampiyonlar Ligi | Kadın + Erkek |

Kapsam kuralları `scripts/fetch.py` içindeki `CLUB_LEAGUES`, `NATIONAL_TEAM` ve `NATIONAL_EXCLUDE` alanlarındadır.

## Yerelde deneme

```bash
python scripts/fetch.py --leagues
python -m http.server 8000 --directory docs
```

Ardından tarayıcıda http://localhost:8000 adresini açın.
