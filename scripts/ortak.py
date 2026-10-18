"""Güncelleme betiklerinin ortak yardımcıları (yalnızca standart kütüphane)."""

import csv
import json
import re
import time
import urllib.request
from datetime import date

KULLANICI_AJANI = "Dergibul/1.0 (+https://github.com/alcnergen/dergibul)"

TR_AYLAR = {
    "ocak": 1, "şubat": 2, "subat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "mayis": 5,
    "haziran": 6, "temmuz": 7, "ağustos": 8, "agustos": 8, "eylül": 9, "eylul": 9,
    "ekim": 10, "kasım": 11, "kasim": 11, "aralık": 12, "aralik": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7,
    "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

_TARIH_DESENLERI = [
    (re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b"), lambda m: (int(m[3]), int(m[2]), int(m[1]))),
    (re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"), lambda m: (int(m[1]), int(m[2]), int(m[3]))),
    (re.compile(r"\b(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})\b"),
     lambda m: (int(m[3]), TR_AYLAR.get(m[2].lower().replace("i̇", "i")), int(m[1]))),
]


def tarih_bul(metin):
    """Metindeki ilk tarihi date olarak döndürür; yoksa None."""
    en_iyi = None
    for desen, donustur in _TARIH_DESENLERI:
        m = desen.search(metin)
        if not m:
            continue
        y, a, g = donustur(m)
        if not a:
            continue
        try:
            t = date(y, a, g)
        except ValueError:
            continue
        if en_iyi is None or m.start() < en_iyi[0]:
            en_iyi = (m.start(), t)
    return en_iyi[1] if en_iyi else None


def html_metin(html):
    """Etiketleri atıp boşlukları sadeleştirir."""
    html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    metin = re.sub(r"<[^>]+>", " ", html)
    for k, v in (("&nbsp;", " "), ("&amp;", "&"), ("&#39;", "'"), ("&quot;", '"')):
        metin = metin.replace(k, v)
    return re.sub(r"\s+", " ", metin)


def etiketli_tarih(metin, etiketler, pencere=80):
    """Verilen etiketlerden birinin hemen ardından gelen tarihi bulur."""
    for etiket in etiketler:
        for m in re.finditer(re.escape(etiket), metin, re.IGNORECASE):
            t = tarih_bul(metin[m.end(): m.end() + pencere])
            if t:
                return t
    return None


class Getirici:
    """Nazik HTTP istemcisi: istekler arasında bekler, hatada None döner."""

    def __init__(self, bekleme=0.7, zaman_asimi=30):
        self.bekleme = bekleme
        self.zaman_asimi = zaman_asimi
        self._son = 0.0

    def getir(self, url):
        gecen = time.monotonic() - self._son
        if gecen < self.bekleme:
            time.sleep(self.bekleme - gecen)
        self._son = time.monotonic()
        istek = urllib.request.Request(url, headers={"User-Agent": KULLANICI_AJANI, "Accept-Language": "tr"})
        try:
            with urllib.request.urlopen(istek, timeout=self.zaman_asimi) as yanit:
                return yanit.read().decode("utf-8", "replace")
        except Exception as hata:  # ağ hataları tek dergiyi düşürmemeli
            print(f"  ! {url}: {hata}")
            return None


def issn_normal(deger):
    """'1234-567x', '1234567X' -> '1234-567X'; geçersizse ''."""
    d = re.sub(r"[^0-9Xx]", "", deger or "").upper()
    return f"{d[:4]}-{d[4:]}" if len(d) == 8 else ""


def liste(deger, ayrac="|"):
    return [x.strip() for x in (deger or "").split(ayrac) if x.strip()]


def sayi(deger):
    deger = (deger or "").strip().replace(",", ".")
    if not deger:
        return None
    try:
        f = float(deger)
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


def csv_oku(yol):
    """Ayracı (, ; sekme) kendisi seçen CSV okuyucu."""
    with open(yol, encoding="utf-8-sig", newline="") as f:
        ornek = f.read(4096)
        f.seek(0)
        try:
            lehce = csv.Sniffer().sniff(ornek, delimiters=",;\t")
        except csv.Error:
            lehce = csv.excel
        return list(csv.DictReader(f, dialect=lehce))


def json_yaz(yol, veri):
    with open(yol, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, indent=1)
        f.write("\n")


def json_oku(yol, varsayilan=None):
    try:
        with open(yol, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return varsayilan
