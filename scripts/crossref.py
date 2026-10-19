"""
DergiPark'ta bulunmayan dergiler için Crossref'ten (api.crossref.org) yayın verisi.

Dergilerin büyük kısmı DOI kayıtlarını Crossref'e yatırır. Bir kaydın asıl adresi DergiPark'ı
gösteriyorsa derginin DergiPark sayfası bulunmuş olur. Göstermiyorsa kayıtlardaki
"received / accepted / published" tarihlerinden ortalama süreler ve yayın sıklığı hesaplanır.
"""

import json
import statistics
from collections import defaultdict
from datetime import date
from urllib.parse import urlencode

from ortak import tarih_bul

API = "https://api.crossref.org/journals/{issn}/works?"


def _parca_tarih(nesne):
    """Crossref {'date-parts': [[2024, 5, 3]]} -> date (eksik gün/ay 1 kabul edilir)."""
    try:
        p = (nesne or {}).get("date-parts", [[None]])[0]
        if not p or not p[0]:
            return None
        return date(p[0], p[1] if len(p) > 1 else 1, p[2] if len(p) > 2 else 1)
    except (TypeError, ValueError):
        return None


def _assertion(kayit, *adlar):
    for a in kayit.get("assertion") or []:
        if (a.get("name") or "").lower() in adlar:
            t = tarih_bul(str(a.get("value") or ""))
            if t:
                return t
    return None


def kayit_coz(kayit):
    """Tek bir Crossref kaydından tarihleri, sayıyı ve olası DergiPark adresini çıkarır."""
    yayin = next((t for t in (_parca_tarih(kayit.get(k)) for k in
                             ("published-online", "published-print", "published", "issued")) if t), None)
    adresler = [((kayit.get("resource") or {}).get("primary") or {}).get("URL") or ""]
    adresler += [link.get("URL") or "" for link in kayit.get("link") or []]
    return {
        "gonderim": _assertion(kayit, "received", "submitted", "date_received"),
        "kabul": _parca_tarih(kayit.get("accepted")) or _assertion(kayit, "accepted", "date_accepted"),
        "yayin": yayin,
        "sayi": (kayit.get("volume"), kayit.get("issue")),
        "dergipark": next((a for a in adresler if "dergipark.org.tr" in a), None),
        "baslik": next(iter(kayit.get("title") or []), None),
    }


def ozetle(kayitlar, bugun=None):
    """Crossref kayıtlarından ölçüm sözlüğü üretir (trdizin_guncelle.olcumu_uygula biçiminde)."""
    bugun = bugun or date.today()
    m = [kayit_coz(k) for k in kayitlar]
    dp = next((x["dergipark"] for x in m if x["dergipark"]), None)

    def ort(ciftler):
        gun = [(b - a).days for a, b in ciftler if a and b and 0 <= (b - a).days <= 1500]
        return round(statistics.mean(gun)) if gun else None

    sonuc = {
        "veriKaynagi": "Crossref",
        "ortKabulGun": ort((x["gonderim"], x["kabul"]) for x in m),
        "ortKabulYayinGun": ort((x["kabul"], x["yayin"]) for x in m),
        "ortToplamGun": ort((x["gonderim"], x["yayin"]) for x in m),
        "olcumMakaleSayisi": sum(1 for x in m if x["gonderim"] and x["yayin"]) or
        sum(1 for x in m if x["kabul"] and x["yayin"]),
        "basliklar": [x["baslik"] for x in sorted(m, key=lambda x: x["yayin"] or date.min, reverse=True)
                      if x["baslik"]][:40],
    }
    # Yayın sıklığı: son tam yılda kaç farklı sayı çıktı (yoksa bu yıl)
    yillik = defaultdict(set)
    for x in m:
        if x["yayin"] and x["sayi"][1]:  # sayı numarası olmayan kayıtlar sıklık için kullanılamaz
            yillik[x["yayin"].year].add(x["sayi"])
    for yil in (bugun.year - 1, bugun.year):
        if yillik.get(yil):
            sonuc["tahminiYillikSayi"] = len(yillik[yil])
    yayinlar = [x["yayin"] for x in m if x["yayin"] and x["yayin"] <= bugun]
    if yayinlar:
        sonuc["sonYayin"] = max(yayinlar).isoformat()
    if dp:
        sonuc["dergiparkCrossref"] = dp
    return {k: v for k, v in sonuc.items() if v is not None}


def crossref_olc(getirici, issnler, adet=60):
    """ISSN'lerden ilk sonuç veren için son `adet` makaleyi çekip özetler; veri yoksa None."""
    for issn in [i for i in issnler if i]:
        sorgu = urlencode({"rows": adet, "sort": "published", "order": "desc", "filter": "type:journal-article"})
        metin = getirici.getir(API.format(issn=issn) + sorgu)
        if not metin:
            continue
        try:
            kayitlar = json.loads(metin).get("message", {}).get("items") or []
        except json.JSONDecodeError:
            continue
        if kayitlar:
            return ozetle(kayitlar)
    return None
