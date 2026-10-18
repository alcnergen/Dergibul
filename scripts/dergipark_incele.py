#!/usr/bin/env python3
"""
DergiPark sayfa yapısını teşhis eder: bağlantı kalıplarını ve tarih etiketlerini log'a basar.
Ayrıştırıcıları canlı siteye göre ayarlamak için kullanılır.

Örnek:  python3 scripts/dergipark_incele.py tybakademi --issn 2146-1759
"""

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import Getirici, html_metin  # noqa: E402
from trdizin_guncelle import makale_baglantilari, makale_olc, sayi_baglantilari  # noqa: E402


def baglantilar(html, desen="/pub/", n=40):
    hrefler = list(dict.fromkeys(re.findall(r"href=[\"']([^\"']+)", html or "")))
    return [h for h in hrefler if desen in h][:n]


def baslik(yazi):
    print(f"\n===== {yazi} =====")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--issn")
    args = ap.parse_args()
    g = Getirici(bekleme=0.5)
    kok = f"https://dergipark.org.tr/tr/pub/{args.slug}"

    if args.issn:
        baslik("ARAMA " + args.issn)
        html = g.getir("https://dergipark.org.tr/tr/search?" + urlencode({"q": args.issn, "section": "journal"}))
        print("\n".join(baglantilar(html)))

    baslik("ANA SAYFA metin (ilk 1500)")
    print(html_metin(g.getir(kok) or "")[:1500])

    baslik("ARŞİV bağlantıları")
    arsiv = g.getir(f"{kok}/archive") or ""
    print("\n".join(baglantilar(arsiv)))
    sayilar = sayi_baglantilari(arsiv, kok)
    print("ayrıştırılan sayılar:", sayilar[:5])
    if not sayilar:
        return

    baslik("SAYI bağlantıları " + sayilar[0])
    sayi = g.getir(sayilar[0]) or ""
    print("\n".join(baglantilar(sayi)))
    makaleler = makale_baglantilari(sayi, kok)
    print("ayrıştırılan makaleler:", makaleler[:5])
    if not makaleler:
        return

    baslik("MAKALE " + makaleler[0])
    metin = html_metin(g.getir(makaleler[0]) or "")
    for etiket in ("Tarih", "Date", "Tür", "Type", "Bölüm"):
        for m in list(re.finditer(etiket, metin))[:4]:
            print(f"[{etiket}] …{metin[max(0, m.start() - 60): m.end() + 80]}…")
    print("ayrıştırılan:", makale_olc(g.getir(makaleler[0]) or ""))


if __name__ == "__main__":
    main()
