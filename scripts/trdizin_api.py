"""
TR Dizin dergi listesini search.trdizin.gov.tr'nin herkese açık JSON API'sinden otomatik çeker.

API, Elasticsearch biçiminde yanıt verir: hits.total.value ve hits.hits[]._source.
Dergi kayıtlarının alan adları belgelenmediği için normalleştirme alan adlarına değil,
anlamlarına (issn, publisher, subject, period...) göre yapılır. İlk çalıştırmada eşlemeyi
doğrulamak için:  python3 scripts/trdizin_api.py --incele
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import Getirici, issn_normal, kucuk  # noqa: E402

API = "https://search.trdizin.gov.tr/api/defaultSearch/journal/"

# TR Dizin konu adı -> Dergibul alanı (Türkçe ve İngilizce konu adlarını kapsar)
ALAN_ESLEME = [
    (r"eğitim|educat|öğretim|pedagoji", "Eğitim Bilimleri"),
    (r"ilahiyat|\bdin\b|dinler|islam|theolog|religio", "İlahiyat"),
    (r"hukuk|\blaw\b", "Hukuk"),
    (r"\bdil\b|dilbilim|edebiyat|edebi|linguist|literat|filoloji|folklor", "Dil ve Edebiyat"),
    (r"spor|sport", "Spor Bilimleri"),
    (r"psikoloji|psycholog|davranış bilimleri", "Psikoloji"),
    (r"iktisat|ekonomi|işletme|maliye|kamu yönetimi|muhasebe|finans|econom|business|manage|turizm|touris|"
     r"^iş$|halkla ilişkiler|çalışma ekonomisi", "İktisadi ve İdari Bilimler"),
    (r"sanat|müzik|mimar|tasarım|\bart\b|music|architect|design|tiyatro|film, radyo|sinema", "Güzel Sanatlar"),
    (r"tıp|tıbbi|sağlık|hemşire|\bdiş|eczacı|klinik|cerrahi|medic|health|nurs|dentist|pharma|clinic|"
     r"pediatri|onkoloji|nöroloji|nörolojik|psikiyatri|kardiyo|kalp|göz hastalık|kulak, burun|anestezi|"
     r"romatoloji|üroloji|nefroloji|gastroenteroloji|hepatoloji|endokrinoloji|dermatoloji|hematoloji|"
     r"immünoloji|enfeksiyon|ortopedi|geriatri|gerontoloji|rehabilitasyon|solunum|patoloji|fizyoloji|"
     r"anatomi|transplantasyon|alerji|androloji|viroloji|parazitoloji|kadın hastalıkları|radyoloji|"
     r"periferik damar|beslenme|diyetetik|ebelik|odyoloji|fizyoterapi|toksikoloji", "Sağlık Bilimleri"),
    (r"ziraat|tarım|veteriner|gıda|su ürünleri|orman|agricult|veterinar|food|forest|bahçe bitkileri|"
     r"balıkçılık|zootekni|toprak bilimi|bitki koruma", "Ziraat"),
    (r"mühendis|bilgisayar|enerji|malzeme|engineer|computer|energy|material|inşaat|robotik|telekomünikasyon|"
     r"taşınım|denizcilik|otomasyon|elektrik|elektronik|nükleer|polimer|termodinamik|görüntüleme bilimi|"
     r"yeşil, sürdürülebilir|nanobilim", "Mühendislik"),
    (r"fizik|kimya|matematik|biyoloji|jeoloji|çevre|istatistik|physic|chemi|mathemat|biolog|geolog|"
     r"environment|ekoloji|bitki bilimleri|zooloji|su kaynakları|optik|spektroskopi|mineraloji|meteoroloji|"
     r"entomoloji|mantar bilimi|kuş bilimi|limnoloji|genetik|astronomi|multidisipliner – fen", "Fen Bilimleri"),
    (r"sosyal|sosyoloji|tarih|coğrafya|felsefe|iletişim|siyaset|siyasi|uluslararası ilişkiler|antropoloji|"
     r"arkeoloji|beşeri|kültürel|kentsel|kadın araştırmaları|aile çalışmaları|etnik|\betik\b|mantık|"
     r"ortaçağ|bilgi, belge|savunma bilimleri|demografi|nüfus|social|histor|geograph|philosoph|communicat|"
     r"politic|humanit", "Sosyal Bilimler"),
]

# TR Dizin veri tabanı (journalDatabase) -> geniş alan. TR Dizin dört veri tabanına ayrılır:
# Sosyal ve Beşeri Bilimler, Sağlık Bilimleri, Fen Bilimleri ve Mühendislik, Yaşam Bilimleri.
VERITABANI_ESLEME = [
    (r"social|sosyal|human", "Sosyal Bilimler"),
    (r"health|medic|sağlık", "Sağlık Bilimleri"),
    (r"life|yaşam", "Ziraat"),
    (r"science|engineer|fen|mühendis", "Fen Bilimleri"),
]

DIL_ESLEME = {"türkçe": "tr", "turkish": "tr", "ingilizce": "en", "english": "en", "almanca": "de",
              "german": "de", "fransızca": "fr", "french": "fr", "arapça": "ar", "arabic": "ar",
              "rusça": "ru", "russian": "ru"}

SAYI_KELIMELERI = {"bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, "on iki": 12}

PERIYOT = [
    (r"yılda\s*(\d+)", lambda m: int(m[1])),
    (r"yılda\s*(bir|iki|üç|dört|beş|altı|on iki)\s*(?:kez|defa|sayı)", lambda m: SAYI_KELIMELERI[m[1]]),
    (r"(\d+)\s*(?:issues?|sayı)\s*(?:per|a|/|bir)?\s*(?:year|yıl)", lambda m: int(m[1])),
    (r"(\d+)\s*ayda\s*bir", lambda m: max(1, round(12 / int(m[1])))),
    (r"iki aylık|bimonthly|bi-monthly", lambda m: 6),
    (r"üç aylık|quarterly|üç ayda", lambda m: 4),
    (r"dört aylık|triannual|tri-annual|üç sayı", lambda m: 3),
    (r"altı aylık|biannual|semi-?annual|bi-annual|iki sayı", lambda m: 2),
    (r"aylık|monthly", lambda m: 12),
    (r"yıllık|annual", lambda m: 1),
]

OLUMSUZ_DURUM = re.compile(r"çıkar|cikar|pasif|passive|inactive|removed|excluded|askı|deleted|false", re.I)


def duzlestir(nesne, yol=""):
    """İç içe JSON'u (yol, ilkel değer) çiftlerine açar. Yollar küçük harftir."""
    if isinstance(nesne, dict):
        for k, v in nesne.items():
            yield from duzlestir(v, f"{yol}.{k}".lower() if yol else str(k).lower())
    elif isinstance(nesne, list):
        for v in nesne:
            yield from duzlestir(v, yol)
    elif nesne is not None and nesne != "":
        yield yol, nesne


def _sec(ciftler, desen, haric=None):
    d = re.compile(desen)
    h = re.compile(haric) if haric else None
    return [v for y, v in ciftler if d.search(y) and not (h and h.search(y))]


def periyot_coz(metin):
    metin = kucuk(metin)
    if re.fullmatch(r"\d{1,2}", metin.strip()):
        return int(metin)
    for desen, f in PERIYOT:
        m = re.search(desen, metin)
        if m:
            n = f(m)
            if 1 <= n <= 24:
                return n
    return None


def alanlari_bul(konular, veritabanlari=()):
    """Konu adlarını (her biri ayrı) ve TR Dizin veri tabanını Dergibul alanlarına eşler."""
    alanlar = set()
    for konu in konular:
        k = kucuk(konu).strip()
        alanlar |= {alan for desen, alan in ALAN_ESLEME if re.search(desen, k)}
    for vt in veritabanlari:
        v = str(vt).lower()  # veri tabanı kodları İngilizce (SOCIAL); Türkçe küçük harf "ı" üretmesin
        alanlar |= {alan for desen, alan in VERITABANI_ESLEME if re.search(desen, v)}
    return sorted(alanlar)


def son_yil(kaynak):
    """journalYear[] içinden en güncel yılın kaydı (konu ve sayı ayları burada tutulur)."""
    yillar = [y for y in kaynak.get("journalYear") or [] if isinstance(y, dict) and y.get("year")]
    return max(yillar, key=lambda y: y["year"]) if yillar else {}


def kayit_normallestir(kaynak):
    """API'nin _source nesnesini, trdizin_guncelle.satirdan_dergi'nin beklediği satıra çevirir."""
    c = list(duzlestir(kaynak))
    yil = son_yil(kaynak)
    veritabanlari = [str(v) for v in (yil.get("databases") or kaynak.get("journalDatabase") or []) if v]
    ad = next((str(v) for v in _sec(c, r"^(name|title|journalname|journaltitle|ordertitle)$")), "")
    issn = next((issn_normal(str(v)) for v in _sec(c, r"(^|\.)(p|print)?issn$") if issn_normal(str(v))), "")
    eissn = next((issn_normal(str(v)) for v in _sec(c, r"(^|\.)(e|electronic|online)_?issn$") if issn_normal(str(v))), "")
    adresler = [str(v) for v in _sec(c, r"url|web|site|address|link|homepage") if str(v).startswith("http")]
    dergipark = next((a for a in adresler if "dergipark.org.tr" in a), "")
    url = next((a for a in adresler if "trdizin" not in a), "")
    yayinci = next((str(v) for v in _sec(c, r"publisher|yayinci|institution|kurum", r"id$|url|address")), "")
    if yil.get("subjects"):
        konular = [k["name"] for k in yil["subjects"] if isinstance(k, dict) and k.get("name")]
    else:
        konular = [str(v) for v in _sec(c, r"subject|categor|konu|field|area|discipline", r"id$|code$|label")
                   if isinstance(v, str)]
    diller = sorted({DIL_ESLEME.get(kucuk(v).strip(), "") for v in _sec(c, r"lang|dil")} - {""})
    # TR Dizin "periods" alanı sayıların çıktığı ayları tutar: ["6", "12"] -> yılda 2 sayı
    aylar = {str(a) for a in yil.get("periods") or [] if str(a).isdigit() and 1 <= int(a) <= 12}
    periyot = len(aylar) or next(
        (p for p in (periyot_coz(v) for v in _sec(c, r"period(?!s)|frequen|periyot|siklik")) if p), None)
    if isinstance(kaynak.get("isActive"), bool):
        aktif = kaynak["isActive"]
    else:
        durumlar = [str(v) for v in _sec(c, r"status|state|durum|active|isindex")]
        aktif = not any(OLUMSUZ_DURUM.search(kucuk(d)) for d in durumlar)
    return {
        "trdizinId": str(kaynak.get("id") or ""),
        "ad": ad.strip(),
        "issn": issn,
        "eissn": eissn,
        "yayinci": yayinci.strip(),
        "dergipark": dergipark,
        "url": url,
        "alanlar": "|".join(alanlari_bul(konular, veritabanlari)),
        "veritabanlari": "|".join(veritabanlari),
        "konular": "|".join(dict.fromkeys(konular)),
        "diller": "|".join(diller),
        "yillikSayi": str(periyot or ""),
        "sonYil": yil.get("year"),
        "aktif": aktif,
    }


def sayfa_url(sayfa, limit):
    return API + "?" + urlencode({"q": "", "order": "relevance-DESC", "page": sayfa, "limit": limit})


def tum_dergiler(getirici, limit=100, en_fazla_sayfa=500):
    """Tüm sayfaları dolaşıp ham _source kayıtlarını döndürür."""
    kayitlar, gorulen = [], set()
    for sayfa in range(1, en_fazla_sayfa + 1):
        metin = getirici.getir(sayfa_url(sayfa, limit))
        if not metin:
            break
        try:
            veri = json.loads(metin)
        except json.JSONDecodeError:
            print(f"  ! sayfa {sayfa}: JSON değil")
            break
        hits = (veri.get("hits") or {}).get("hits") or []
        yeni = 0
        for h in hits:
            kimlik = h.get("_id") or json.dumps(h.get("_source"), sort_keys=True)
            if kimlik in gorulen:
                continue
            gorulen.add(kimlik)
            kaynak = dict(h.get("_source") or {})
            kaynak.setdefault("id", h.get("_id"))
            kayitlar.append(kaynak)
            yeni += 1
        toplam = ((veri.get("hits") or {}).get("total") or {})
        toplam = toplam.get("value") if isinstance(toplam, dict) else toplam
        print(f"  sayfa {sayfa}: {yeni} yeni kayıt (toplam {len(kayitlar)}/{toplam or '?'})")
        if not yeni or (toplam and len(kayitlar) >= toplam):
            break
    return kayitlar


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--incele", action="store_true", help="ilk ham kaydı ve normalleştirilmiş halini yazdır")
    ap.add_argument("--cikti", help="normalleştirilmiş listeyi bu JSON dosyasına yaz")
    args = ap.parse_args()
    getirici = Getirici(bekleme=0.5)
    if args.incele:
        veri = json.loads(getirici.getir(sayfa_url(1, 10)) or "{}")
        ilk = ((veri.get("hits") or {}).get("hits") or [{}])[0]
        print(json.dumps(ilk, ensure_ascii=False, indent=1)[:6000])
        print("--- normalleştirilmiş ---")
        print(json.dumps(kayit_normallestir(ilk.get("_source") or {}), ensure_ascii=False, indent=1))
        return
    satirlar = [kayit_normallestir(k) for k in tum_dergiler(getirici)]
    print(f"{len(satirlar)} dergi, {sum(s['aktif'] for s in satirlar)} aktif")
    if args.cikti:
        Path(args.cikti).write_text(json.dumps(satirlar, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
