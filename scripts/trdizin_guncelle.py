#!/usr/bin/env python3
"""
TR Dizin dergi listesini otomatik çeker, DergiPark'tan ölçülen sürelerle zenginleştirip
data/trdizin.json üretir.

1. Liste: search.trdizin.gov.tr JSON API'si (scripts/trdizin_api.py). Elle giriş gerekmez.
2. Her dergi için DergiPark adresi TR Dizin kaydından ya da DergiPark aramasından (ISSN) bulunur.
3. DergiPark ana sayfası/duyurularından yayın sıklığı ve "… yılına kadar dolu" duyuruları okunur.
4. Son sayılardaki makalelerin gönderim/kabul/yayın tarihlerinden ortalama süreler ölçülür.

Her çalıştırmada en eski ölçülmüş --max-dergi kadar dergi yeniden ölçülür; diğerlerinin önceki
ölçümleri korunur. İsteğe bağlı data/kaynak/duzeltmeler.csv, otomatik değerleri ISSN eşleşmesiyle
ezer (yalnızca otomatik bulunamayan ya da yanlış çıkan değerler için).

Örnek:  python3 scripts/trdizin_guncelle.py --max-dergi 100
"""

import argparse
import re
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import (Getirici, csv_oku, etiketli_tarih, html_metin, issn_normal, json_oku,  # noqa: E402
                   json_yaz, kucuk, liste, sayi, tarih_bul)
from trdizin_api import kayit_normallestir, periyot_coz, tum_dergiler  # noqa: E402

KOK = Path(__file__).resolve().parent.parent
GONDERIM = ["Gönderilme Tarihi", "Gönderim Tarihi", "Submission Date"]
KABUL = ["Kabul Tarihi", "Acceptance Date"]
YAYIN = ["Yayımlanma Tarihi", "Yayınlanma Tarihi", "Publication Date"]
TUR_ESLEME = [
    (r"sistematik|meta[- ]?analiz", "sistematik"),
    (r"derleme|review", "derleme"),
    (r"olgu|vaka|case report", "olgu"),
    (r"kitap (incelemesi|değerlendirmesi|tanıtımı)|book review", "kitap"),
    (r"çeviri|translation", "ceviri"),
    (r"editöre mektup|kısa (makale|bildiri)|letter|short", "kisa"),
    (r"araştırma makalesi|research article|özgün makale", "arastirma"),
]


# DergiPark'ta dergi kısa adı olamayacak genel yollar
AYRILMIS_YOLLAR = {"tr", "en", "pub", "page", "search", "journal", "journals", "login", "register",
                   "help", "about", "static", "public", "user", "article", "issue", "archive"}


def dergipark_kok(deger):
    """'slug', 'https://dergipark.org.tr/tr/pub/slug/...' -> 'https://dergipark.org.tr/tr/pub/slug'."""
    deger = (deger or "").strip()
    if not deger:
        return None
    if "dergipark.org.tr" in deger:
        # Hem /tr/pub/slug hem de kısa dergipark.org.tr/slug biçimleri
        m = re.search(r"dergipark\.org\.tr/(?:(?:tr|en)/)?(?:pub/)?([\w-]+)", deger)
        slug = m.group(1) if m else None
    else:
        slug = deger if re.fullmatch(r"[\w-]+", deger) else None
    if not slug or slug.lower() in AYRILMIS_YOLLAR:
        return None
    return f"https://dergipark.org.tr/tr/pub/{slug}"


def sayi_baglantilari(html, kok):
    """Arşiv sayfasındaki sayı bağlantıları, en yeniden eskiye."""
    slug = kok.rsplit("/", 1)[1]
    idler = re.findall(rf"/pub/{re.escape(slug)}/issue/(\d+)(?=[\"'/?#])", html)
    benzersiz = sorted({int(i) for i in idler}, reverse=True)
    return [f"{kok}/issue/{i}" for i in benzersiz]


def makale_baglantilari(html, kok):
    slug = kok.rsplit("/", 1)[1]
    bulunan = re.findall(rf"/pub/{re.escape(slug)}/(issue/\d+/\d+|article/\d+)(?=[\"'?#])", html)
    gorulen, sonuc = set(), []
    for yol in bulunan:
        if yol not in gorulen:
            gorulen.add(yol)
            sonuc.append(f"{kok}/{yol}")
    return sonuc


def makale_tur(metin):
    # DergiPark makale sayfası: "... Bölüm Araştırma Makalesi Yazarlar ..."
    m = (re.search(r"\bBölüm\s+(.{0,40}?)\s+(?:Yazarlar|Authors)\b", metin)
         or re.search(r"(?:Makale Türü|Article Type|Section)\s*:?\s*(.{0,60})", metin, re.IGNORECASE))
    parca = kucuk(m.group(1) if m else "")
    for desen, tur in TUR_ESLEME:
        if re.search(desen, parca):
            return tur
    return None


def makale_olc(html):
    metin = html_metin(html)
    return {
        "gonderim": etiketli_tarih(metin, GONDERIM),
        "kabul": etiketli_tarih(metin, KABUL),
        "yayin": etiketli_tarih(metin, YAYIN),
        "tur": makale_tur(metin),
    }


def ortalama(degerler):
    degerler = [d for d in degerler if d is not None and 0 <= d <= 1500]
    return round(statistics.mean(degerler)) if degerler else None


def sureleri_hesapla(makaleler, sayi_tarihleri):
    """Makale ölçümlerinden ortalama süreleri ve yıllık sayı tahminini hesaplar."""
    kabul = [(m["kabul"] - m["gonderim"]).days for m in makaleler if m["kabul"] and m["gonderim"]]
    kabul_yayin = [(m["yayin"] - m["kabul"]).days for m in makaleler if m["yayin"] and m["kabul"]]
    toplam = [(m["yayin"] - m["gonderim"]).days for m in makaleler if m["yayin"] and m["gonderim"]]
    sonuc = {
        "ortKabulGun": ortalama(kabul),
        "ortKabulYayinGun": ortalama(kabul_yayin),
        "ortToplamGun": ortalama(toplam),
        "olcumMakaleSayisi": len(toplam),
        "gozlenenTurler": sorted({m["tur"] for m in makaleler if m["tur"]}),
    }
    tarihler = sorted(set(sayi_tarihleri))
    if len(tarihler) >= 2:
        aralik = statistics.mean((b - a).days for a, b in zip(tarihler, tarihler[1:]))
        if aralik > 0:
            sonuc["tahminiYillikSayi"] = max(1, min(12, round(365 / aralik)))
    return sonuc


def dergi_olc(getirici, kok, sayi_adedi, makale_adedi):
    arsiv = getirici.getir(f"{kok}/archive")
    if not arsiv:
        return None
    makaleler, sayi_tarihleri = [], []
    for sayi_url in sayi_baglantilari(arsiv, kok)[:sayi_adedi]:
        sayi_html = getirici.getir(sayi_url)
        if not sayi_html:
            continue
        bu_sayi = []
        for url in makale_baglantilari(sayi_html, kok)[:makale_adedi]:
            html = getirici.getir(url)
            if html:
                bu_sayi.append(makale_olc(html))
        yayinlar = [m["yayin"] for m in bu_sayi if m["yayin"]]
        if yayinlar:
            sayi_tarihleri.append(statistics.median_low(yayinlar))
        makaleler.extend(bu_sayi)
    return sureleri_hesapla(makaleler, sayi_tarihleri)


def dergipark_bul(getirici, satir):
    """Derginin kendi sitesinde DergiPark bağlantısı arar (DergiPark araması sunucu tarafında sonuç vermiyor)."""
    url = (satir.get("url") or "").strip()
    if not url.startswith("http") or "dergipark.org.tr" in url:
        return None
    for m in re.finditer(r"dergipark\.org\.tr/(?:(?:tr|en)/)?(?:pub/)?[\w-]+", getirici.getir(url) or ""):
        kok = dergipark_kok(m.group(0))
        if kok:
            return kok
    return None


DOLULUK_DESENLERI = [
    # "2027 yılı sonuna kadar dolu", "2027 yılının tüm sayıları dolmuştur" -> 2028
    (re.compile(r"(20\d{2})\s*yılı(?:nın)?\s*(?:sonuna kadar|tüm sayıları|sayıları|sayılarımız)[^.]{0,60}?dol", re.I), 1),
    # "2028 yılına kadar dolu" / "sayılarımız 2028 yılına kadar doludur" -> 2028
    (re.compile(r"(20\d{2})\s*yılına kadar[^.]{0,60}?dol", re.I), 0),
    (re.compile(r"dol(?:u|muş)[^.]{0,60}?(20\d{2})\s*yılına kadar", re.I), 0),
    (re.compile(r"(?:first available|next available)[^.]{0,40}?(20\d{2})", re.I), 0),
]
GONDERIM_KAPALI = re.compile(r"makale (?:kabul(?:ü)?|gönderim(?:i)?)[^.]{0,40}?(?:kapalı|durdurul|kapatıl|"
                             r"kabul (?:edilme|etme)mekte)|not accepting (?:new )?(?:submissions|manuscripts)", re.I)


AY_ADLARI = ("ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim",
             "kasım", "aralık")


def anasayfa_coz(html):
    """DergiPark ana sayfasından yıllık sayı, ilk boş sayı ve gönderim durumu çıkarır."""
    metin = html_metin(html)
    sonuc = {}
    # "Yayın Modeli: Süreli Yayın (Ocak - Mayıs - Eylül)" -> 3
    m = re.search(r"Yayın Modeli\s*:?[^()]{0,40}\(([^)]{3,150})\)", metin)
    aylar = {a for a in AY_ADLARI if m and a in kucuk(m.group(1))}
    if aylar:
        sonuc["yillikSayi"] = len(aylar)
    else:
        m = re.search(r"(?:Yayın Aralığı|Yayın Sıklığı|Periyot|Frequency)\s*:?\s*(.{0,40})|(yılda\s+\S+\s+(?:kez|sayı))",
                      metin, re.I)
        n = m and periyot_coz(m.group(1) or m.group(2))
        if n:
            sonuc["yillikSayi"] = n
    yillar = []
    for desen, ek in DOLULUK_DESENLERI:
        for e in desen.finditer(metin):
            yil = int(e.group(1)) + ek
            if date.today().year <= yil <= date.today().year + 6:
                yillar.append(yil)
    if yillar:
        sonuc["ilkBosSayi"] = str(max(yillar))
        sonuc["ilkBosSayiKaynak"] = "dergi duyurusu"
    durum = re.search(r"Makale Gönderimine (Açık|Kapalı)", metin)
    if (durum and durum.group(1) == "Kapalı") or (not durum and GONDERIM_KAPALI.search(metin)):
        sonuc["gonderimKapali"] = True
        # "makale kabulü 31 Ocak 2027'ye kadar kapalı olacaktır"
        for k in re.finditer(r"kadar[^.]{0,30}?kapal", metin):
            t = tarih_bul(metin[max(0, k.start() - 40): k.start()])
            if t and t > date.today():
                sonuc["gonderimAcilis"] = t.isoformat()
    return sonuc


def satirdan_dergi(satir):
    issn = issn_normal(satir.get("issn")) or issn_normal(satir.get("eissn"))
    kok = dergipark_kok(satir.get("dergipark"))
    return {
        "id": issn or (kok or satir.get("ad", "")).rsplit("/", 1)[-1],
        "trdizinId": satir.get("trdizinId") or None,
        "ad": (satir.get("ad") or "").strip(),
        "issn": issn,
        "eissn": issn_normal(satir.get("eissn")),
        "yayinci": (satir.get("yayinci") or "").strip(),
        "url": (satir.get("url") or "").strip() or kok or "",
        "dergipark": kok,
        "alanlar": liste(satir.get("alanlar")),
        "konular": liste(satir.get("konular")),
        "diller": liste(satir.get("diller")),
        "kabulEdilenTurler": liste(satir.get("kabulEdilenTurler")),
        "yillikSayi": sayi(satir.get("yillikSayi")),
        "ortIlkKararGun": sayi(satir.get("ortIlkKararGun")),
        "maxKelime": sayi(satir.get("maxKelime")),
        "apc": sayi(satir.get("apc")) or 0,
        "apcBirim": (satir.get("apcBirim") or "TL").strip(),
        "etikKurulZorunlu": (satir.get("etikKurulZorunlu") or "").strip().lower() in ("1", "evet", "true"),
        "ilkBosSayi": (satir.get("ilkBosSayi") or "").strip() or None,
        "endeksler": sorted(set(["TR Dizin"] + liste(satir.get("endeksler")))),
        "ulke": "Türkiye",
    }


def olcumu_uygula(dergi, olcum):
    """Ölçülen değerleri dergiye işler; TR Dizin ya da düzeltme dosyasındaki değerler önceliklidir."""
    for k in ("ortKabulGun", "ortKabulYayinGun", "ortToplamGun", "olcumMakaleSayisi", "olcumTarihi"):
        if olcum.get(k) is not None:
            dergi[k] = olcum[k]
    if not dergi["yillikSayi"]:
        dergi["yillikSayi"] = olcum.get("yillikSayi") or olcum.get("tahminiYillikSayi")
    if not dergi["kabulEdilenTurler"] and olcum.get("gozlenenTurler"):
        dergi["kabulEdilenTurler"] = olcum["gozlenenTurler"]
    if not dergi["ilkBosSayi"] and olcum.get("ilkBosSayi"):
        dergi["ilkBosSayi"] = olcum["ilkBosSayi"]
        dergi["ilkBosSayiKaynak"] = olcum.get("ilkBosSayiKaynak")
    if olcum.get("gonderimKapali"):
        dergi["gonderimKapali"] = True
        if olcum.get("gonderimAcilis"):
            dergi["gonderimAcilis"] = olcum["gonderimAcilis"]
    dergi["dogrulandi"] = bool(olcum.get("olcumMakaleSayisi"))


def duzeltmeleri_uygula(satirlar, duzeltmeler):
    """duzeltmeler.csv'deki dolu hücreler, ISSN ya da e-ISSN eşleşen otomatik satırın üzerine yazılır."""
    dizin = {}
    for s in satirlar:
        for k in (issn_normal(s.get("issn")), issn_normal(s.get("eissn"))):
            if k:
                dizin[k] = s
    for d in duzeltmeler:
        hedef = dizin.get(issn_normal(d.get("issn"))) or dizin.get(issn_normal(d.get("eissn")))
        if hedef is None:
            if (d.get("ad") or "").strip():
                satirlar.append(dict(d))  # TR Dizin API'sinde olmayan dergi elle eklenmiş
            continue
        hedef.update({k: v for k, v in d.items() if k and (v or "").strip()})
    return satirlar


def wos_etiketle(dergiler, uluslararasi):
    """Uluslararası listede (ESCI, SSCI...) de bulunan TR Dizin dergilerine endeks ekler."""
    endeks = {}
    for d in (uluslararasi or {}).get("dergiler", []):
        for k in (d.get("issn"), d.get("eissn")):
            if k:
                endeks.setdefault(k, set()).update(d.get("endeksler", []))
    for d in dergiler:
        ek = endeks.get(d["issn"], set()) | endeks.get(d.get("eissn") or "", set())
        d["endeksler"] = sorted(set(d["endeksler"]) | ek)


def onceki_olcum(onceki):
    """Önceki çalıştırmanın kaydını olcumu_uygula'nın beklediği biçime çevirir."""
    o = dict(onceki)
    o["gozlenenTurler"] = onceki.get("kabulEdilenTurler")
    if onceki.get("ilkBosSayiKaynak") != "dergi duyurusu":
        o.pop("ilkBosSayi", None)  # elle girilen değer düzeltme dosyasından tekrar gelir
    return o


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--girdi", help="TR Dizin API'si yerine bu CSV'den oku (çevrimdışı kullanım)")
    ap.add_argument("--duzeltmeler", default=KOK / "data/kaynak/duzeltmeler.csv")
    ap.add_argument("--cikti", default=KOK / "data/trdizin.json")
    ap.add_argument("--max-dergi", type=int, default=100, help="bu çalıştırmada ölçülecek en fazla dergi")
    ap.add_argument("--sayi", type=int, default=4, help="dergi başına incelenecek son sayı adedi")
    ap.add_argument("--makale", type=int, default=6, help="sayı başına incelenecek makale adedi")
    ap.add_argument("--min-dergi", type=int, default=50,
                    help="TR Dizin'den bundan az dergi gelirse mevcut liste korunur")
    ap.add_argument("--bekleme", type=float, default=0.7, help="istekler arası saniye")
    args = ap.parse_args()

    getirici = Getirici(bekleme=args.bekleme)
    eski = json_oku(args.cikti, {}) or {}
    eski_dergiler = [] if eski.get("meta", {}).get("ornek") else eski.get("dergiler", [])

    if args.girdi:
        satirlar, kaynak = csv_oku(args.girdi), "CSV"
    else:
        print("TR Dizin listesi çekiliyor…")
        satirlar = [kayit_normallestir(k) for k in tum_dergiler(getirici)]
        pasif = sum(1 for s in satirlar if not s["aktif"])
        satirlar = [s for s in satirlar if s["aktif"]]
        kaynak = "TR Dizin API"
        print(f"  {len(satirlar)} aktif dergi ({pasif} pasif/çıkarılmış atlandı)")
        # API kesintisi listeyi silmesin
        if len(satirlar) < max(args.min_dergi, len(eski_dergiler) // 2):
            sys.exit(f"TR Dizin'den yalnızca {len(satirlar)} dergi geldi; mevcut liste korunuyor.")
    if Path(args.duzeltmeler).exists():
        satirlar = duzeltmeleri_uygula(satirlar, csv_oku(args.duzeltmeler))
    if not satirlar:
        sys.exit("Dergi listesi boş.")

    eski_dizin = {d["id"]: d for d in eski_dergiler}
    dergiler, gorulen = [], set()
    for s in satirlar:
        if not (s.get("ad") or "").strip():
            continue
        d = satirdan_dergi(s)
        if d["id"] in gorulen:
            continue
        gorulen.add(d["id"])
        onceki = eski_dizin.get(d["id"], {})
        d["dergipark"] = d["dergipark"] or onceki.get("dergipark")
        if onceki.get("olcumTarihi"):
            olcumu_uygula(d, onceki_olcum(onceki))
        dergiler.append(d)

    # En uzun süredir ölçülmeyenler önce
    sira = sorted(dergiler, key=lambda d: d.get("olcumTarihi") or "")[: args.max_dergi]
    bugun = date.today().isoformat()
    for i, d in enumerate(sira, 1):
        print(f"[{i}/{len(sira)}] {d['ad']}")
        # Duyurudan gelen bilgiler her ölçümde yeniden okunur; eskisi kalmasın
        d.pop("gonderimKapali", None)
        d.pop("gonderimAcilis", None)
        if d.get("ilkBosSayiKaynak") == "dergi duyurusu":
            d["ilkBosSayi"] = None
            del d["ilkBosSayiKaynak"]
        if not d["dergipark"]:
            d["dergipark"] = dergipark_bul(getirici, d)
            if not d["dergipark"]:
                print("  DergiPark adresi bulunamadı")
                d["olcumTarihi"] = bugun  # sıranın sonuna at, sonraki turda tekrar denenir
                continue
            d["url"] = d["url"] or d["dergipark"]
        olcum = dergi_olc(getirici, d["dergipark"], args.sayi, args.makale) or {}
        html = getirici.getir(d["dergipark"])
        if html:
            olcum |= {k: v for k, v in anasayfa_coz(html).items() if k not in olcum}
        olcum["olcumTarihi"] = bugun
        olcumu_uygula(d, olcum)

    for d in dergiler:
        d.setdefault("dogrulandi", False)
    wos_etiketle(dergiler, json_oku(KOK / "data/uluslararasi.json"))

    json_yaz(args.cikti, {
        "meta": {
            "ornek": False,
            "guncelleme": bugun,
            "kaynak": kaynak + " + DergiPark makale tarihleri",
            "dergiSayisi": len(dergiler),
            "olculenDergi": sum(1 for d in dergiler if d.get("olcumMakaleSayisi")),
        },
        "dergiler": dergiler,
    })
    print(f"{len(dergiler)} dergi yazıldı -> {args.cikti}")


if __name__ == "__main__":
    main()
