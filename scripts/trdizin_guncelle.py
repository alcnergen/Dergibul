#!/usr/bin/env python3
"""
TR Dizin dergi listesini DergiPark'tan ölçülen sürelerle zenginleştirip data/trdizin.json üretir.

Girdi: data/kaynak/trdizin_dergiler.csv (sütunlar README'de). Her çalıştırmada en eski ölçülmüş
--max-dergi kadar dergi yeniden ölçülür; diğerlerinin önceki ölçümleri korunur. Böylece tüm liste
birkaç haftalık otomatik çalıştırmayla döner ve DergiPark'a yük bindirilmez.

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
                   json_yaz, liste, sayi)

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


def dergipark_kok(deger):
    """'slug', 'https://dergipark.org.tr/tr/pub/slug/...' -> 'https://dergipark.org.tr/tr/pub/slug'."""
    deger = (deger or "").strip()
    if not deger:
        return None
    m = re.search(r"dergipark\.org\.tr/(?:tr|en)/pub/([\w-]+)", deger)
    slug = m.group(1) if m else re.sub(r"[^\w-]", "", deger)
    return f"https://dergipark.org.tr/tr/pub/{slug}" if slug else None


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
    m = re.search(r"(Makale Türü|Türü|Article Type|Type)\s*:?\s*(.{0,60})", metin, re.IGNORECASE)
    parca = (m.group(2) if m else "").lower()
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


def satirdan_dergi(satir):
    issn = issn_normal(satir.get("issn")) or issn_normal(satir.get("eissn"))
    kok = dergipark_kok(satir.get("dergipark"))
    return {
        "id": issn or (kok or satir.get("ad", "")).rsplit("/", 1)[-1],
        "ad": (satir.get("ad") or "").strip(),
        "issn": issn,
        "eissn": issn_normal(satir.get("eissn")),
        "yayinci": (satir.get("yayinci") or "").strip(),
        "url": (satir.get("url") or "").strip() or kok or "",
        "dergipark": kok,
        "alanlar": liste(satir.get("alanlar")),
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
    """Ölçülen değerleri dergiye işler; CSV'de elle girilmiş değerler önceliklidir."""
    for k in ("ortKabulGun", "ortKabulYayinGun", "ortToplamGun", "olcumMakaleSayisi", "olcumTarihi"):
        if olcum.get(k) is not None:
            dergi[k] = olcum[k]
    if not dergi["yillikSayi"] and olcum.get("tahminiYillikSayi"):
        dergi["yillikSayi"] = olcum["tahminiYillikSayi"]
    if not dergi["kabulEdilenTurler"] and olcum.get("gozlenenTurler"):
        dergi["kabulEdilenTurler"] = olcum["gozlenenTurler"]
    dergi["dogrulandi"] = bool(olcum.get("olcumMakaleSayisi"))


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--girdi", default=KOK / "data/kaynak/trdizin_dergiler.csv")
    ap.add_argument("--cikti", default=KOK / "data/trdizin.json")
    ap.add_argument("--max-dergi", type=int, default=100, help="bu çalıştırmada ölçülecek en fazla dergi")
    ap.add_argument("--sayi", type=int, default=4, help="dergi başına incelenecek son sayı adedi")
    ap.add_argument("--makale", type=int, default=6, help="sayı başına incelenecek makale adedi")
    ap.add_argument("--bekleme", type=float, default=0.7, help="istekler arası saniye")
    args = ap.parse_args()

    satirlar = csv_oku(args.girdi)
    if not satirlar:
        sys.exit(f"{args.girdi} boş ya da bulunamadı.")
    eski = json_oku(args.cikti, {}) or {}
    eski_olcum = {} if eski.get("meta", {}).get("ornek") else {d["id"]: d for d in eski.get("dergiler", [])}

    dergiler = [satirdan_dergi(s) for s in satirlar if (s.get("ad") or "").strip()]
    for d in dergiler:
        onceki = eski_olcum.get(d["id"])
        if onceki and onceki.get("olcumTarihi"):
            olcumu_uygula(d, onceki | {"gozlenenTurler": onceki.get("kabulEdilenTurler"),
                                       "tahminiYillikSayi": onceki.get("yillikSayi")})

    # En uzun süredir ölçülmeyenler önce
    sira = sorted((d for d in dergiler if d["dergipark"]), key=lambda d: d.get("olcumTarihi") or "")
    getirici = Getirici(bekleme=args.bekleme)
    bugun = date.today().isoformat()
    for i, d in enumerate(sira[: args.max_dergi], 1):
        print(f"[{i}/{min(len(sira), args.max_dergi)}] {d['ad']}")
        olcum = dergi_olc(getirici, d["dergipark"], args.sayi, args.makale)
        if olcum:
            olcum["olcumTarihi"] = bugun
            olcumu_uygula(d, olcum)

    for d in dergiler:
        d.setdefault("dogrulandi", False)
        d.pop("dergipark", None)
    wos_etiketle(dergiler, json_oku(KOK / "data/uluslararasi.json"))

    json_yaz(args.cikti, {
        "meta": {
            "ornek": False,
            "guncelleme": bugun,
            "kaynak": "TR Dizin listesi + DergiPark makale tarihleri",
            "dergiSayisi": len(dergiler),
            "olculenDergi": sum(1 for d in dergiler if d.get("olcumTarihi")),
        },
        "dergiler": dergiler,
    })
    print(f"{len(dergiler)} dergi yazıldı -> {args.cikti}")


if __name__ == "__main__":
    main()
