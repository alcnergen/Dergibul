# Dergibul
En iyi dergileri en uygun zamanda bul.

Dergibul, akademik bir çalışma için **en yakın zamanda yayın imkânı olan** dergileri listeleyen statik bir web sitesidir.

- **TR Dizin:** Varsayılan olarak yılda 3–4 sayı çıkaran dergiler gösterilir. İlk boş sayısı 2028 veya sonrası olan (dolu) dergiler gizlenir. Liste en erken tahmini yayın tarihine göre sıralanır.
- **Uygunluk değerlendirmesi:** Çalışma tipi (araştırma, derleme, sistematik derleme, olgu sunumu, kitap incelemesi, çeviri, kısa makale, tezden üretilmiş makale), alan, dil, kelime sayısı, yayın ücreti, etik kurul izni ve hedef tarih girilir. Her dergi için uygun/uygun değil kararı, gerekçeleri ve 0–100 arası bir puan verilir.
- **Ortalama süreler:** İlk karar, gönderimden kabule, kabulden yayına ve toplam süre gösterilir.
- **ESCI:** `Motor.esciDergileri()` fonksiyonu, ESCI'da taranan dergileri listeler. Türkiye kaynaklı ve ücretsiz dergiler için ayrı filtreler vardır.
- **Yurtdışı:** `Motor.yurtdisiSec()` fonksiyonu Q1 ve Q2 dergilerini, ayrıca çeyreği ne olursa olsun SSCI dergilerini listeler. "Yalnızca SSCI" seçeneği de vardır.

> Depoyla gelen `data/*.json` dosyaları **kurgusal örnek veridir**. Sitede bu durum bir uyarı bandıyla gösterilir. Gerçek liste aşağıdaki adımlarla üretilir.

## Çalıştırma

```bash
python3 -m http.server 8000   # sonra http://localhost:8000
```

`main` dalına yapılan her push, `.github/workflows/yayinla.yml` ile önce testleri çalıştırır, ardından siteyi GitHub Pages'te yayınlar. Bunun için depo ayarlarında **Settings → Pages → Source: GitHub Actions** seçilmelidir.

## Gerçek veriyi doldurma

### 1. TR Dizin listesi (tamamen otomatik)

```bash
python3 scripts/trdizin_guncelle.py --max-dergi 100
```

Bu komut elle giriş gerektirmeden şu adımları izler:

1. **Liste:** Dizindeki tüm dergileri `search.trdizin.gov.tr` sitesinin herkese açık JSON API'sinden sayfa sayfa çeker. Dizinden çıkarılmış ya da pasif görünen dergileri atlar. Gelen dergi sayısı beklenenden çok azsa (API kesintisi gibi) mevcut listeyi silmez, durur.
2. **DergiPark adresi:** TR Dizin kaydındaki adres kullanılır (`dergipark.org.tr/slug` kısa biçimleri de çözülür). Kayıt derginin kendi sitesini gösteriyorsa o sitedeki DergiPark bağlantısı aranır.
3. **Sıklık, doluluk ve gönderim durumu:** DergiPark ana sayfasından şunları okur:
   - yayın ayları ("Yayın Modeli: Süreli Yayın (Ocak - Mayıs - Eylül)" → yılda 3 sayı)
   - "Makale Gönderimine Açık/Kapalı" durumu ve "makale kabulü 31 Ocak 2027'ye kadar kapalı" gibi açılış tarihleri. Açılış tarihi biliniyorsa tahmin o tarihten başlatılır, bilinmiyorsa dergi "şu an kapalı" olarak işaretlenir.
   - "… yılına kadar dolu" / "… yılı sayıları dolmuştur" duyuruları (`ilkBosSayi`, kaynak: *dergi duyurusu*)
4. **Resmî istatistikler:** DergiPark "Kabul-Ret İstatistikleri" sayfasından en güncel yılın kabul oranı ile gönderimden kabul/ret kararına ortalama süreler okunur (`kabulOrani`, `ortIlkKararGun`, `resmiKabulGun`). Kabul oranı %20'nin altındaysa sitede uyarı gösterilir.
5. **Süreler:** Son 4 sayıdan, her sayıda 6 makale inceler. Makale sayfalarındaki **Gönderilme / Kabul / Yayımlanma** tarihlerinden ortalama süreleri hesaplar. Sıklık başka yerden bulunamazsa sayıların yayın aralıklarından tahmin eder. Kabul edilen çalışma türlerini de bu makalelerin türlerinden çıkarır.

Her çalıştırmada en uzun süredir ölçülmemiş dergiler önce ele alınır, diğerlerinin önceki ölçümleri korunur. Böylece yaklaşık 2.000 dergilik liste birkaç haftalık otomatik çalıştırmayla dolar ve sitelere fazla yük binmez.

TR Dizin API'si dergi kayıtlarının alan adlarını belgelemiyor. Bu yüzden kayıtlar alan adlarına değil, anlamlarına göre (issn, publisher, subject, period…) eşlenir. Eşlemeyi kontrol etmek için:

```bash
python3 scripts/trdizin_api.py --incele
```

Bu komut ilk ham kaydı ve normalleştirilmiş halini yazdırır. Otomatik iş de her çalıştırmada aynı çıktıyı log'a basar.

**Düzeltmeler (isteğe bağlı):** Otomatik bulunamayan ya da yanlış çıkan değerler `data/kaynak/duzeltmeler.csv` dosyasına yazılabilir (şablon: `duzeltmeler.sablon.csv`).

- Satırlar ISSN ile eşleşir ve yalnızca dolu hücreler otomatik değerin üzerine yazar.
- TR Dizin API'sinde bulunmayan bir dergi, ad sütunu doldurularak eklenebilir.
- Çevrimdışı çalışmak için `--girdi liste.csv` ile API yerine bir CSV dosyası verilebilir.

| Sütun | Açıklama |
|---|---|
| `alanlar` | `\|` ile ayrılmış alanlar, ör. `Eğitim Bilimleri\|Sosyal Bilimler` |
| `diller` | `tr\|en` |
| `kabulEdilenTurler` | `arastirma\|derleme\|sistematik\|olgu\|kisa\|kitap\|ceviri\|tez` |
| `ilkBosSayi` | `YYYY-AA` biçiminde. 2028 veya sonrası ise dergi "dolu" sayılır. |
| `dergipark`, `yillikSayi`, `ortIlkKararGun`, `maxKelime`, `apc`, `apcBirim`, `etikKurulZorunlu`, `endeksler` | Diğer alanlar |

### 2. Yurtdışı ve ESCI listesi

```bash
python3 scripts/uluslararasi_guncelle.py \
  --sjr data/kaynak/scimagojr.csv \
  --ssci data/kaynak/wos/ssci.csv --esci data/kaynak/wos/esci.csv
```

- **SJR:** scimagojr.com → Journal Rankings → *Download data*. Çeyrek bilgisi "SJR Best Quartile" sütunundan alınır.
- **SSCI / ESCI / SCIE / AHCI:** Clarivate Master Journal List'ten koleksiyon bazında CSV olarak indirilir (ücretsiz hesap gerekir). Dosyalar `data/kaynak/wos/` altına konur.
- **JCR (isteğe bağlı):** `--jcr` ile verilirse çeyrek bilgisi SJR yerine JCR'den alınır.

### 3. Otomatik güncelleme

`.github/workflows/veri-guncelle.yml` her pazartesi şu adımları çalıştırır:

1. SJR verisini indirmeyi dener.
2. `data/kaynak/wos/*.csv` dosyalarını okur.
3. TR Dizin listesini API'den çeker ve DergiPark ölçümünü yapar.
4. Değişen JSON dosyalarını commit'ler.

İş, Actions sekmesinden elle de başlatılabilir.

## Sitede veri yükleme

**Veri** sekmesinden JSON ya da CSV dosyası yüklenebilir. CSV'de `ad` ve `issn` sütunlarının yanında yukarıdaki tablodaki sütunlar kullanılabilir. Dosya yalnızca tarayıcıda okunur, sunucuya gönderilmez.

## Testler

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Tahmin nasıl hesaplanıyor?

`tahmini yayın = bugün + ort(gönderim→kabul) + ort(kabul→yayın)`

Dergi ilk boş sayısını ilan ettiyse, bu tarih ile hesaplanan tarihten geç olanı alınır.

Puan dört bileşenden oluşur:

| Bileşen | En yüksek puan | Kural |
|---|---|---|
| Hız | 50 | 3 aya kadar tam puan, sonraki her ay için −3 |
| Yayın sıklığı | 20 | Yılda 3–4 sayı tam puan alır |
| Ücretsiz yayın | 15 | Yayın ücreti yoksa |
| Veri güveni | 15 | 10 veya daha fazla makaleden ölçüldüyse |

Sonuçlar bilgi amaçlıdır. Başvurmadan önce derginin güncel yazım kurallarını ve dizin durumunu kendi sitesinden doğrulayın.
