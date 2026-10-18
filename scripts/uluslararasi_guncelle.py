#!/usr/bin/env python3
"""
Yurtdışı dergi listesini (data/uluslararasi.json) üretir.

Kaynaklar (hepsi isteğe bağlı, en az biri gerekli):
  --sjr   SCImago Journal Rank CSV'si (scimagojr.com/journalrank.php -> "Download data")
  --ssci  Clarivate Master Journal List SSCI dışa aktarımı (CSV)
  --esci  Clarivate Master Journal List ESCI dışa aktarımı (CSV)
  --scie / --ahci  diğer Web of Science koleksiyonları (CSV)
  --jcr   JCR dışa aktarımı; varsa çeyrek bilgisi SJR yerine buradan alınır

Listeye giren dergiler: çeyreği Q1/Q2 olanlar, SSCI'dakiler ve ESCI'dakiler (ESCI sekmesi için).

Örnek:
  python3 scripts/uluslararasi_guncelle.py --sjr data/kaynak/scimagojr.csv \\
      --ssci data/kaynak/wos/ssci.csv --esci data/kaynak/wos/esci.csv
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from alan import alan_belirle  # noqa: E402
from ortak import csv_oku, issn_normal, json_yaz  # noqa: E402

KOK = Path(__file__).resolve().parent.parent

# Konu metni (SJR kategori/alanları ya da WoS kategorileri) -> Dergibul alanı. Sıra önemlidir.
ALAN_ESLEME = [
    (r"educat", "Eğitim Bilimleri"),
    (r"religio|theolog", "İlahiyat"),
    (r"\blaw\b|legal", "Hukuk"),
    (r"linguist|language|literat", "Dil ve Edebiyat"),
    (r"sport", "Spor Bilimleri"),
    (r"psycholog", "Psikoloji"),
    (r"econom|business|manage|financ|accounting|decision sci|public admin", "İktisadi ve İdari Bilimler"),
    (r"visual arts|performing|music|\bart\b|architect", "Güzel Sanatlar"),
    (r"medic|nurs|health|dentist|pharma|immunolog|neurosci|clinical", "Sağlık Bilimleri"),
    (r"agricult|veterinar|food sci|plant|animal sci|soil", "Ziraat"),
    (r"engineer|computer|materials|energy|automation|telecom", "Mühendislik"),
    (r"physic|chemi|mathemat|earth|environment|biolog|ecolog|astronom|statistic", "Fen Bilimleri"),
    (r"social|sociolog|politic|histor|anthropolog|geograph|communicat|philosoph|cultur|humanit", "Sosyal Bilimler"),
]
ULKE = {"Turkey": "Türkiye", "Turkiye": "Türkiye", "Türkiye": "Türkiye", "TURKEY": "Türkiye"}


def alanlari_bul(metin):
    metin = (metin or "").lower()
    return sorted({alan for desen, alan in ALAN_ESLEME if re.search(desen, metin)})


def kategori_alanlari(kategori):
    """Tek bir kategorinin işaret ettiği alanlar (sırayla ilk eşleşen değil, hepsi; oy bölünür)."""
    return [alan for desen, alan in ALAN_ESLEME if re.search(desen, kategori.lower())]


def kategorileri_ayir(metin):
    """'Education (Q1); Law (Q2)' ya da 'Education | Law' -> ['Education', 'Law']"""
    return [k for k in (re.sub(r"\s*\(Q[1-4]\)\s*$", "", p).strip() for p in re.split(r"[;|]", metin or "")) if k]


def ana_alan_ata(d):
    """Dergiye tek ana alan verir; yalnızca o alanın listesinde görünür. Kararsız durumda alanNotu yazılır."""
    konular = d.pop("_konular", None) or kategorileri_ayir(d.get("kategoriler"))
    if not konular:
        return
    sonuc = alan_belirle(d["ad"], konular, konu_esleyici=kategori_alanlari)
    if sonuc["alanlar"]:
        d.update(sonuc)


def sutun(satir, *adlar):
    """Büyük/küçük harf ve boşluk farklarına dayanıklı sütun okuma."""
    normal = {re.sub(r"\W", "", k or "").lower(): v for k, v in satir.items()}
    for ad in adlar:
        v = normal.get(re.sub(r"\W", "", ad).lower())
        if v:
            return v.strip()
    return ""


def issnler(metin):
    """'15424863, 00079235' gibi alanlardan normalize ISSN listesi."""
    parcalar = re.findall(r"[0-9]{4}-?[0-9]{3}[0-9Xx]", metin or "")
    return [i for i in (issn_normal(p) for p in parcalar) if i]


class Birlestirici:
    def __init__(self):
        self.dergiler = []
        self.issn_dizin = {}

    def bul_ya_da_ekle(self, issn_listesi, ad):
        for i in issn_listesi:
            if i in self.issn_dizin:
                return self.issn_dizin[i]
        d = {"id": issn_listesi[0] if issn_listesi else re.sub(r"\W+", "-", ad.lower()), "ad": ad,
             "issn": "", "eissn": "", "yayinci": "", "url": "", "alanlar": [], "kategoriler": "",
             "diller": [], "kabulEdilenTurler": [], "endeksler": [], "ulke": "", "ceyrek": None,
             "ceyrekKaynak": None, "apc": None, "dogrulandi": True}
        self.dergiler.append(d)
        for i in issn_listesi:
            self.issn_dizin[i] = d
        return d

    def sjr_ekle(self, satirlar):
        for s in satirlar:
            if sutun(s, "Type") and sutun(s, "Type").lower() != "journal":
                continue
            liste = issnler(sutun(s, "Issn"))
            d = self.bul_ya_da_ekle(liste, sutun(s, "Title"))
            d["issn"] = d["issn"] or (liste[0] if liste else "")
            d["eissn"] = d["eissn"] or (liste[1] if len(liste) > 1 else "")
            for i in liste:
                self.issn_dizin[i] = d
            q = sutun(s, "SJR Best Quartile")
            if q in ("Q1", "Q2", "Q3", "Q4") and d["ceyrekKaynak"] != "JCR":
                d["ceyrek"], d["ceyrekKaynak"] = q, "SJR"
            ulke = sutun(s, "Country")
            d["ulke"] = d["ulke"] or ULKE.get(ulke, ulke)
            d["yayinci"] = d["yayinci"] or sutun(s, "Publisher")
            d["kategoriler"] = sutun(s, "Categories") or d["kategoriler"]
            d.setdefault("_konular", []).extend(kategorileri_ayir(sutun(s, "Categories")))
            d["alanlar"] = sorted(set(d["alanlar"]) | set(alanlari_bul(sutun(s, "Categories") + " " + sutun(s, "Areas"))))
            kaynak_id = sutun(s, "Sourceid")
            if kaynak_id and not d["url"]:
                d["url"] = f"https://www.scimagojr.com/journalsearch.php?q={kaynak_id}&tip=sid"

    def wos_ekle(self, satirlar, endeks):
        for s in satirlar:
            liste = issnler(sutun(s, "ISSN") + " " + sutun(s, "eISSN"))
            ad = sutun(s, "Journal title", "Journal Title", "Title")
            if not ad:
                continue
            d = self.bul_ya_da_ekle(liste, ad)
            d["issn"] = d["issn"] or issn_normal(sutun(s, "ISSN"))
            d["eissn"] = d["eissn"] or issn_normal(sutun(s, "eISSN"))
            for i in liste:
                self.issn_dizin[i] = d
            if endeks not in d["endeksler"]:
                d["endeksler"] = sorted(d["endeksler"] + [endeks])
            d["yayinci"] = d["yayinci"] or sutun(s, "Publisher name", "Publisher")
            adres = sutun(s, "Publisher address")
            if not d["ulke"] and adres:
                son = adres.rsplit(",", 1)[-1].strip().title()
                d["ulke"] = ULKE.get(son, son)
            kategoriler = sutun(s, "Web of Science Categories", "Categories")
            d["alanlar"] = sorted(set(d["alanlar"]) | set(alanlari_bul(kategoriler)))
            d.setdefault("_konular", []).extend(kategorileri_ayir(kategoriler))
            if kategoriler and not d["kategoriler"]:
                d["kategoriler"] = kategoriler
            diller = sutun(s, "Languages")
            if diller and not d["diller"]:
                kod = {"english": "en", "turkish": "tr"}
                d["diller"] = sorted({kod.get(x.strip().lower(), x.strip().lower()) for x in re.split(r"[,;|]", diller) if x.strip()})

    def jcr_ekle(self, satirlar):
        for s in satirlar:
            q = sutun(s, "JIF Quartile", "Quartile")
            for i in issnler(sutun(s, "ISSN") + " " + sutun(s, "eISSN")):
                d = self.issn_dizin.get(i)
                if d and q in ("Q1", "Q2", "Q3", "Q4"):
                    d["ceyrek"], d["ceyrekKaynak"] = q, "JCR"


def secilir_mi(d):
    return d["ceyrek"] in ("Q1", "Q2") or "SSCI" in d["endeksler"] or "ESCI" in d["endeksler"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sjr")
    for e in ("ssci", "esci", "scie", "ahci"):
        ap.add_argument(f"--{e}")
    ap.add_argument("--jcr")
    ap.add_argument("--cikti", default=KOK / "data/uluslararasi.json")
    args = ap.parse_args()

    b = Birlestirici()
    kaynaklar = []
    if args.sjr:
        b.sjr_ekle(csv_oku(args.sjr))
        kaynaklar.append("SCImago")
    for e in ("ssci", "esci", "scie", "ahci"):
        yol = getattr(args, e)
        if yol:
            b.wos_ekle(csv_oku(yol), e.upper())
            kaynaklar.append(e.upper())
    if args.jcr:
        b.jcr_ekle(csv_oku(args.jcr))
        kaynaklar.append("JCR")
    if not kaynaklar:
        sys.exit("En az bir kaynak dosyası verin (--sjr, --ssci, --esci ...).")

    secilen = [d for d in b.dergiler if secilir_mi(d)]
    if not secilen:
        sys.exit("Kaynaklardan hiç dergi seçilemedi; mevcut liste korunuyor. Dosya biçimlerini kontrol edin.")
    for d in b.dergiler:
        ana_alan_ata(d)
    for d in secilen:
        if not d["kategoriler"]:
            d.pop("kategoriler")
    json_yaz(args.cikti, {
        "meta": {"ornek": False, "guncelleme": date.today().isoformat(),
                 "kaynak": " + ".join(kaynaklar), "dergiSayisi": len(secilen)},
        "dergiler": secilen,
    })
    print(f"{len(secilen)} dergi yazıldı -> {args.cikti}")


if __name__ == "__main__":
    main()
