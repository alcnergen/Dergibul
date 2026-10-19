"""
Her dergiye tek bir ana alan (disiplin) atar; dergi yalnızca o alanın listesinde görünür.

Kanıtlar:
  1. TR Dizin konuları: her konu bir alana oy verir (birden çok alana uyan konu oyunu böler).
  2. Dergi adı: "Tıp Dergisi", "Mühendislik Fakültesi Dergisi" gibi adlar güçlü bir oydur.
  3. TR Dizin veri tabanı (SOCIAL: Sosyal ve Beşeri; SCIENCE: Fen, Mühendislik, Sağlık, Yaşam): üst sınırdır;
     dergiye yalnızca dizinlendiği veri tabanının kapsadığı alanlar verilebilir.

En yüksek puanlı alan ana alandır. Karar yakınsa (ikinci alan birincinin %60'ından fazlaysa) ya da
dergi adı başka bir alanı işaret ediyorsa `alanNotu` alanına derginin neden bu listede olduğunu
anlatan tek bir cümle yazılır.
"""

import re

from ortak import kucuk

# Konu adı -> alan. Konu adları küçük harfe çevrilip tek tek eşlenir.
KONU_ESLEME = [
    (r"eğitim|educat|öğretim|pedagoji", "Eğitim Bilimleri"),
    (r"ilahiyat|\bdin\b|dinler|islam|theolog|religio", "İlahiyat"),
    (r"hukuk|\blaw\b|kriminoloji", "Hukuk"),
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
     r"periferik damar|beslenme|diyetetik|ebelik|odyoloji|fizyoterapi|toksikoloji|madde bağımlılığı",
     "Sağlık Bilimleri"),
    (r"ziraat|tarım|veteriner|gıda|su ürünleri|orman|agricult|veterinar|food|forest|bahçe bitkileri|"
     r"balıkçılık|zootekni|toprak bilimi|bitki koruma", "Ziraat"),
    (r"mühendis|bilgisayar|enerji|malzeme|engineer|computer|energy|material|inşaat|robotik|telekomünikasyon|"
     r"taşınım|denizcilik|otomasyon|elektrik|elektronik|nükleer|polimer|termodinamik|görüntüleme bilimi|"
     r"yeşil, sürdürülebilir|nanobilim|savunma bilimleri|ergonomi|akustik|mikroskopi", "Mühendislik"),
    (r"fizik|kimya|matematik|biyoloji|jeoloji|çevre|istatistik|physic|chemi|mathemat|biolog|geolog|"
     r"environment|ekoloji|bitki bilimleri|zooloji|su kaynakları|optik|spektroskopi|mineraloji|meteoroloji|"
     r"entomoloji|mantar bilimi|kuş bilimi|limnoloji|genetik|astronomi|multidisipliner – fen|oşinografi|"
     r"paleontoloji", "Fen Bilimleri"),
    (r"sosyal|sosyoloji|tarih|coğrafya|felsefe|iletişim|siyaset|siyasi|uluslararası ilişkiler|antropoloji|"
     r"arkeoloji|beşeri|kültürel|kentsel|kadın araştırmaları|aile çalışmaları|etnik|^etik$|mantık|"
     r"ortaçağ|bilgi, belge|demografi|nüfus|asya çalışmaları|social|histor|geograph|philosoph|communicat|"
     r"politic|humanit", "Sosyal Bilimler"),
]

# Dergi adındaki ifade -> alan. İlk eşleşen kullanılır; özel ifadeler genellerden önce gelir.
AD_ESLEME = [
    (r"sosyal bilimler|social sciences|beşeri|humanities|sosyal araştırmalar", "Sosyal Bilimler"),
    (r"iktisadi ve idari|economics and administrative|işletme|iktisat|ekonomi|maliye|turizm|"
     r"muhasebe|finans|business|econom|management|tourism", "İktisadi ve İdari Bilimler"),
    (r"eğitim|education|öğretmen|pedagoji", "Eğitim Bilimleri"),
    (r"ilahiyat|islami|islam|\bdin\b|dini|theolog|religio", "İlahiyat"),
    (r"hukuk|law", "Hukuk"),
    (r"dil |dil ve|edebiyat|filoloji|language|literat|linguist|türkoloji", "Dil ve Edebiyat"),
    (r"spor|sport|beden eğitimi", "Spor Bilimleri"),
    (r"psikoloji|psycholog", "Psikoloji"),
    (r"güzel sanatlar|sanat|müzik|mimarlık|architecture|\bart\b|music|tasarım|design", "Güzel Sanatlar"),
    (r"tıp|medic|sağlık|health|hemşire|nurs|diş|dental|eczacı|pharma|klinik|clinic|hastane|cerrahi|surg",
     "Sağlık Bilimleri"),
    (r"veteriner|veterinar|ziraat|tarım|agricult|gıda|food|orman|forest|su ürünleri|fisheries",
     "Ziraat"),
    (r"mühendislik|engineering|teknoloji|technolog|bilgisayar|computer|enerji|energy|malzeme|material",
     "Mühendislik"),
    (r"fen bilimleri|natural sciences|science|fizik|kimya|matematik|biyoloji|physics|chemistry|"
     r"mathemat|biolog", "Fen Bilimleri"),
]

# TR Dizin veri tabanı -> (temel alan, o veri tabanındaki dergiye verilebilecek alanlar).
# TR Dizin'de iki veri tabanı var: SOCIAL (Sosyal ve Beşeri Bilimler) ve SCIENCE (Fen, Mühendislik, Sağlık,
# Yaşam Bilimleri). Diğer desenler ileride ayrı veri tabanı kodu gelirse diye tutuluyor.
VERITABANI_ESLEME = [
    (r"social|sosyal|human", "Sosyal Bilimler",
     {"Sosyal Bilimler", "Eğitim Bilimleri", "İlahiyat", "Hukuk", "Dil ve Edebiyat", "Psikoloji",
      "İktisadi ve İdari Bilimler", "Güzel Sanatlar", "Spor Bilimleri"}),
    (r"health|medic|sağlık|tıp", "Sağlık Bilimleri", {"Sağlık Bilimleri", "Psikoloji", "Spor Bilimleri"}),
    (r"life|yaşam", "Ziraat", {"Ziraat", "Fen Bilimleri", "Sağlık Bilimleri"}),
    (r"science|engineer|fen|mühendis|natural", "Fen Bilimleri",
     {"Fen Bilimleri", "Mühendislik", "Sağlık Bilimleri", "Ziraat", "Spor Bilimleri", "Psikoloji"}),
]

YAKIN_ORAN = 0.6      # ikinci alan birincinin bu oranından fazlaysa karar "yakın" sayılır
AD_AGIRLIGI = 0.5     # dergi adının oyu, konu oylarının toplamının bu kadarı (en az 2 konu)


def konu_alanlari(konu):
    k = kucuk(konu).strip()
    return [alan for desen, alan in KONU_ESLEME if re.search(desen, k)]


def ad_alani(ad):
    a = kucuk(ad)
    return next((alan for desen, alan in AD_ESLEME if re.search(desen, a)), None)


def _yuzde(puan, toplam):
    return round(100 * puan / toplam) if toplam else 0


def alan_belirle(ad, konular, veritabanlari=(), konu_esleyici=konu_alanlari):
    """{'alanlar': [ana alan], 'ikincilAlanlar': [...], 'alanNotu': cümle ya da None}

    konu_esleyici: konu adını alan listesine çeviren işlev (uluslararası listede WoS/SJR kategorileri için
    ayrı eşleme kullanılır)."""
    puan = {}
    for konu in konular:
        alanlar = konu_esleyici(konu)
        for alan in alanlar:
            puan[alan] = puan.get(alan, 0) + 1 / len(alanlar)

    temel, izinli = [], set()
    for vt in veritabanlari:
        v = str(vt).lower()  # veri tabanı kodları İngilizce (SOCIAL); Türkçe küçük harf "ı" üretmesin
        for desen, alan, izin in VERITABANI_ESLEME:
            if re.search(desen, v):
                temel.append(alan)
                izinli |= izin

    adin_alani = ad_alani(ad)
    if izinli and adin_alani not in izinli:
        adin_alani = None
    if izinli:
        puan = {a: p for a, p in puan.items() if a in izinli}

    toplam_konu = sum(puan.values())
    oylar = dict(puan)
    if adin_alani:
        oylar[adin_alani] = oylar.get(adin_alani, 0) + max(2, AD_AGIRLIGI * toplam_konu)
    if not oylar:
        ana = temel[0] if temel else None
        return {"alanlar": [ana] if ana else [], "ikincilAlanlar": [], "alanNotu": None}

    sirali = sorted(oylar.items(), key=lambda x: (-x[1], x[0]))
    ana = sirali[0][0]
    ikinciler = [a for a, p in sirali[1:] if p >= 0.25 * sirali[0][1]]

    not_ = None
    konu_sirali = sorted(puan.items(), key=lambda x: (-x[1], x[0]))
    konu_ana = konu_sirali[0][0] if konu_sirali else None
    if adin_alani and konu_ana and konu_ana != adin_alani and puan.get(konu_ana, 0) > puan.get(adin_alani, 0):
        if ana == adin_alani:
            not_ = (f"Dergi adı {ana} alanını belirttiği için bu listede; ancak konularının "
                    f"%{_yuzde(puan[konu_ana], toplam_konu)} kadarı {konu_ana} kapsamında.")
        else:
            not_ = (f"Dergi adı {adin_alani} alanını çağrıştırsa da konularının "
                    f"%{_yuzde(puan[ana], toplam_konu)} kadarı {ana} kapsamında olduğu için bu listede.")
    elif len(sirali) > 1 and sirali[1][1] >= YAKIN_ORAN * sirali[0][1] and toplam_konu:
        dagilim = ", ".join(f"{a} %{_yuzde(puan.get(a, 0), toplam_konu)}" for a, _ in sirali[:3] if puan.get(a))
        not_ = f"Çok disiplinli dergi ({dagilim}); en ağırlıklı alanı {ana} olduğu için bu listede."
    return {"alanlar": [ana], "ikincilAlanlar": ikinciler, "alanNotu": not_}
