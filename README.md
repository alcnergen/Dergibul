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

### 1. TR Dizin listesi

1. TR Dizin'in yayımladığı dizinlenen dergi listesini indirin.
2. `data/kaynak/trdizin_dergiler.sablon.csv` dosyasını `data/kaynak/trdizin_dergiler.csv` adıyla kopyalayın ve dergileri bu sütunlara göre doldurun.

| Sütun | Açıklama |
|---|---|
| `ad`, `issn`, `eissn`, `yayinci` | Künye bilgileri |
| `dergipark` | DergiPark adresi ya da kısa adı (ölçüm için gerekli) |
| `alanlar` | `\|` ile ayrılmış alanlar, ör. `Eğitim Bilimleri\|Sosyal Bilimler` |
| `diller` | `tr\|en` |
| `kabulEdilenTurler` | `arastirma\|derleme\|sistematik\|olgu\|kisa\|kitap\|ceviri\|tez`. Boş bırakılırsa son sayılarda görülen türler kullanılır. |
| `yillikSayi` | Boş bırakılırsa yayın tarihlerinden tahmin edilir |
| `ilkBosSayi` | Derginin ilan ettiği ilk boş sayı, `YYYY-AA` biçiminde. 2028 veya sonrası ise dergi "dolu" sayılır. |
| `ortIlkKararGun`, `maxKelime`, `apc`, `apcBirim`, `etikKurulZorunlu`, `endeksler` | İsteğe bağlı alanlar |

3. Ölçümü çalıştırın:

```bash
python3 scripts/trdizin_guncelle.py --max-dergi 100
```

Betik her dergi için DergiPark arşivinden son 4 sayıyı açar ve her sayıdan 6 makale inceler. Makale sayfalarındaki **Gönderilme / Kabul / Yayımlanma** tarihlerinden ortalama süreleri hesaplar. Her çalıştırmada en uzun süredir ölçülmemiş dergiler önce ele alınır, diğerlerinin önceki ölçümleri korunur. Böylece tüm liste birkaç haftalık otomatik çalıştırmayla dolar ve DergiPark'a fazla yük binmez.

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
3. `trdizin_dergiler.csv` varsa DergiPark ölçümünü yapar.
4. Değişen JSON dosyalarını commit'ler.

İş, Actions sekmesinden elle de başlatılabilir.

## Sitede veri yükleme

**Veri** sekmesinden JSON ya da CSV dosyası yüklenebilir. CSV sütunları yukarıdaki tablodakilerle aynıdır. Dosya yalnızca tarayıcıda okunur, sunucuya gönderilmez.

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
