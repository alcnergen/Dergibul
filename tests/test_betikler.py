import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import json  # noqa: E402
from unittest import mock  # noqa: E402

import ortak  # noqa: E402
import trdizin_api as api  # noqa: E402
import trdizin_guncelle as tr  # noqa: E402
import uluslararasi_guncelle as ul  # noqa: E402

KOK = "https://dergipark.org.tr/tr/pub/ornek"


class Tarih(unittest.TestCase):
    def test_bicimler(self):
        self.assertEqual(ortak.tarih_bul("12.03.2024"), date(2024, 3, 12))
        self.assertEqual(ortak.tarih_bul("x 2024-03-12 y"), date(2024, 3, 12))
        self.assertEqual(ortak.tarih_bul("5 Ağustos 2023"), date(2023, 8, 5))
        self.assertEqual(ortak.tarih_bul("5 August 2023"), date(2023, 8, 5))
        self.assertIsNone(ortak.tarih_bul("tarih yok"))

    def test_issn(self):
        self.assertEqual(ortak.issn_normal("1234567x"), "1234-567X")
        self.assertEqual(ortak.issn_normal("12"), "")


class DergiPark(unittest.TestCase):
    def test_kok(self):
        self.assertEqual(tr.dergipark_kok("https://dergipark.org.tr/en/pub/ornek/archive"), KOK)
        self.assertEqual(tr.dergipark_kok("ornek"), KOK)
        self.assertEqual(tr.dergipark_kok("https://dergipark.org.tr/iuaded"), "https://dergipark.org.tr/tr/pub/iuaded")
        self.assertIsNone(tr.dergipark_kok("https://dergipark.org.tr/tr/pub/page"))
        self.assertIsNone(tr.dergipark_kok("https://ornek.edu.tr/dergi"))

    def test_baglantilar(self):
        arsiv = f'<a href="{KOK}/issue/10">x</a><a href="/tr/pub/ornek/issue/12">y</a><a href="{KOK}/issue/10">'
        self.assertEqual(tr.sayi_baglantilari(arsiv, KOK), [f"{KOK}/issue/12", f"{KOK}/issue/10"])
        sayi = f'<a href="{KOK}/issue/12/555">a</a><a href="/tr/pub/ornek/article/777">b</a><a href="{KOK}/issue/12/555">'
        self.assertEqual(tr.makale_baglantilari(sayi, KOK), [f"{KOK}/issue/12/555", f"{KOK}/article/777"])

    def test_makale(self):
        gercek = ("Konular Çeviri ve Yorum Çalışmaları Bölüm Araştırma Makalesi Yazarlar Nahide Arslan * Türkiye "
                  "Yayımlanma Tarihi 28 Eylül 2026 Gönderilme Tarihi 27 Ocak 2026 Kabul Tarihi 29 Ağustos 2026")
        self.assertEqual(tr.makale_olc(gercek), {"gonderim": date(2026, 1, 27), "kabul": date(2026, 8, 29),
                                                 "yayin": date(2026, 9, 28), "tur": "arastirma"})
        html = """<table><tr><td>Bölüm</td><td>Derleme</td></tr><tr><td>Yazarlar</td></tr>
        <tr><th>Gönderilme Tarihi</th><td>1 Ocak 2024</td></tr>
        <tr><th>Kabul Tarihi</th><td>31.03.2024</td></tr>
        <tr><th>Yayımlanma Tarihi</th><td>30 Haziran 2024</td></tr></table>"""
        m = tr.makale_olc(html)
        self.assertEqual((m["gonderim"], m["kabul"], m["yayin"], m["tur"]),
                         (date(2024, 1, 1), date(2024, 3, 31), date(2024, 6, 30), "derleme"))

    def test_sureler(self):
        m = [{"gonderim": date(2024, 1, 1), "kabul": date(2024, 3, 1), "yayin": date(2024, 4, 1), "tur": "arastirma"},
             {"gonderim": date(2024, 2, 1), "kabul": date(2024, 4, 1), "yayin": date(2024, 7, 1), "tur": None}]
        s = tr.sureleri_hesapla(m, [date(2024, 1, 1), date(2024, 4, 1), date(2024, 7, 1)])
        self.assertEqual(s["ortKabulGun"], 60)
        self.assertEqual(s["olcumMakaleSayisi"], 2)
        self.assertEqual(s["tahminiYillikSayi"], 4)
        self.assertEqual(s["gozlenenTurler"], ["arastirma"])


class TrDizinApi(unittest.TestCase):
    KAYIT = {
        "id": 42, "name": "Örnek Eğitim Dergisi", "issn": "1234-5678", "eIssn": "8765432X",
        "publisher": {"name": "Örnek Üniversitesi", "id": 9},
        "webAddress": "https://dergipark.org.tr/tr/pub/ornek",
        "subjects": [{"name": "Eğitim, Eğitim Araştırmaları"}, {"name": "Sosyal Bilimler, Genel"}],
        "languages": ["Türkçe", "İngilizce"], "period": "Yılda 4 Sayı", "status": "Aktif",
    }

    def test_normallestir(self):
        s = api.kayit_normallestir(self.KAYIT)
        self.assertEqual((s["ad"], s["issn"], s["eissn"]), ("Örnek Eğitim Dergisi", "1234-5678", "8765-432X"))
        self.assertEqual(s["dergipark"], "https://dergipark.org.tr/tr/pub/ornek")
        self.assertEqual(s["yayinci"], "Örnek Üniversitesi")
        self.assertEqual(s["alanlar"], "Eğitim Bilimleri|Sosyal Bilimler")
        self.assertEqual((s["diller"], s["yillikSayi"], s["aktif"]), ("en|tr", "4", True))
        self.assertFalse(api.kayit_normallestir(self.KAYIT | {"status": "Dizinden çıkarıldı"})["aktif"])

    def test_gercek_kayit(self):
        # search.trdizin.gov.tr'den alınmış kaydın (kısaltılmış) yapısı
        kayit = {
            "id": 999, "title": "Beykoz Akademi Dergisi", "issn": None, "eissn": "2651-5393", "isActive": True,
            "webAddress": "http://dergipark.org.tr/makusobed", "journalDatabase": ["SOCIAL"],
            "journalYear": [
                {"year": 2023, "periods": ["6"], "subjects": [{"autoLabel": False, "name": "Tarih", "rootName": "Sosyal"}]},
                {"year": 2024, "periods": ["6", "12"], "subjects": [
                    {"autoLabel": False, "fullName": "Sosyal > Sosyal > Coğrafya", "name": "Coğrafya", "rootName": "Sosyal"},
                    {"autoLabel": False, "name": "Eğitim, Özel", "rootName": "Sosyal"}]},
            ],
        }
        s = api.kayit_normallestir(kayit)
        self.assertEqual((s["ad"], s["issn"], s["eissn"]), ("Beykoz Akademi Dergisi", "", "2651-5393"))
        self.assertEqual((s["yillikSayi"], s["sonYil"], s["aktif"]), ("2", 2024, True))
        self.assertEqual(s["konular"], "Coğrafya|Eğitim, Özel")
        self.assertEqual(s["alanlar"], "Eğitim Bilimleri|Sosyal Bilimler")
        self.assertFalse(api.kayit_normallestir(kayit | {"isActive": False})["aktif"])
        self.assertEqual(tr.dergipark_kok(s["dergipark"]), "https://dergipark.org.tr/tr/pub/makusobed")

    def test_periyot(self):
        for metin, n in [("Yılda 3 Sayı", 3), ("3 ayda bir", 4), ("Quarterly", 4), ("Altı Aylık", 2),
                         ("Aylık", 12), ("Bimonthly", 6), ("2", 2), ("belirsiz", None)]:
            self.assertEqual(api.periyot_coz(metin), n, metin)

    def test_sayfalama(self):
        sayfalar = {1: [{"_id": "a", "_source": {"name": "A"}}, {"_id": "b", "_source": {"name": "B"}}],
                    2: [{"_id": "c", "_source": {"name": "C"}}], 3: []}
        g = mock.Mock()
        g.getir.side_effect = lambda url: json.dumps(
            {"hits": {"total": {"value": 3}, "hits": sayfalar[int(url.split("page=")[1].split("&")[0])]}})
        self.assertEqual([k["name"] for k in api.tum_dergiler(g, limit=2)], ["A", "B", "C"])


class Duyuru(unittest.TestCase):
    def test_doluluk(self):
        yil = date.today().year
        h = f"<p>Yayın Aralığı: Yılda 4 Sayı</p><p>Dergimizin {yil + 1} yılı sonuna kadar tüm sayıları dolmuştur.</p>"
        self.assertEqual(tr.anasayfa_coz(h), {"yillikSayi": 4, "ilkBosSayi": str(yil + 2),
                                              "ilkBosSayiKaynak": "dergi duyurusu"})
        self.assertEqual(tr.anasayfa_coz(f"Sayılarımız {yil + 2} yılına kadar doludur.")["ilkBosSayi"], str(yil + 2))
        self.assertTrue(tr.anasayfa_coz("Yeni makale kabulü geçici olarak kapalıdır.")["gonderimKapali"])
        # DergiPark ana sayfasından (kısaltılmış, gerçek metin)
        gercek = (f"ISSN: 2146-1759 Yayın Modeli: Süreli Yayın (Ocak - Mayıs - Eylül) Makale Gönder "
                  f"Makale Gönderimine Kapalı 30.09.2026 17:03 Gönderime Kapandı 30.09.2026 17:03 Hakkında "
                  f"Dergimizde yaşanan yoğunluktan dolayı makale kabulü 31 Ocak {yil + 1}'ye kadar kapalı olacaktır.")
        self.assertEqual(tr.anasayfa_coz(gercek), {"yillikSayi": 3, "gonderimKapali": True,
                                                   "gonderimAcilis": f"{yil + 1}-01-31"})
        self.assertEqual(tr.anasayfa_coz("Makale Gönderimine Açık. Gönderime Kapandı 01.01.2026"), {})
        self.assertEqual(tr.anasayfa_coz("Dergimiz yılda üç kez yayımlanır.")["yillikSayi"], 3)
        self.assertEqual(tr.anasayfa_coz("Kuruluş 1998. Hakemli dergi."), {})

    def test_duzeltmeler(self):
        satirlar = [{"ad": "A", "issn": "1234-5678", "ilkBosSayi": ""}]
        tr.duzeltmeleri_uygula(satirlar, [{"issn": "12345678", "ilkBosSayi": "2028-01", "ad": ""},
                                          {"ad": "Elle", "issn": "1111-2222"}])
        self.assertEqual(satirlar[0]["ilkBosSayi"], "2028-01")
        self.assertEqual(satirlar[0]["ad"], "A")
        self.assertEqual(len(satirlar), 2)


class UcuncuUc(unittest.TestCase):
    """Ağ yerine sahte yanıtlarla tüm akış: TR Dizin -> DergiPark arama -> ölçüm -> JSON."""

    def test_akis(self):
        dp = "https://dergipark.org.tr/tr/pub/ornek"
        yanitlar = {
            "trdizin": json.dumps({"hits": {"total": {"value": 1}, "hits": [
                {"_id": "7", "_source": {"name": "Örnek Dergi", "issn": "1234-5678", "period": "Yılda 3 Sayı",
                                         "webAddress": "https://ornek.edu.tr/"}}]}}),
            "https://ornek.edu.tr/": f'<a href="{dp}">DergiPark</a>',
            f"{dp}/archive": f'<a href="{dp}/issue/20">',
            f"{dp}/issue/20": f'<a href="{dp}/issue/20/300">',
            f"{dp}/issue/20/300": "Gönderilme Tarihi 01.01.2026 Kabul Tarihi 01.03.2026 Yayımlanma Tarihi 01.04.2026 "
                                  "Makale Türü Araştırma Makalesi",
            dp: "<p>ISSN: 1234-5678</p><p>Dergimiz 2030 yılına kadar doludur.</p>",
        }

        def getir(url):
            if "trdizin.gov.tr" in url:
                return yanitlar["trdizin"] if "page=1&" in url else json.dumps({"hits": {"hits": []}})
            return yanitlar.get(url, "")

        with tempfile.TemporaryDirectory() as k, \
                mock.patch.object(tr.Getirici, "getir", side_effect=getir), \
                mock.patch.object(sys, "argv", ["x", "--cikti", f"{k}/c.json", "--duzeltmeler", f"{k}/yok.csv",
                                                   "--min-dergi", "1"]), \
                mock.patch.object(tr, "date", mock.Mock(today=lambda: date(2026, 10, 18))):
            tr.main()
            d = json.loads(Path(k, "c.json").read_text())["dergiler"][0]
        self.assertEqual((d["dergipark"], d["yillikSayi"], d["ortToplamGun"]), (dp, 3, 90))
        self.assertEqual(d["kabulEdilenTurler"], ["arastirma"])
        self.assertEqual((d["ilkBosSayi"], d["ilkBosSayiKaynak"]), ("2030", "dergi duyurusu"))


class Uluslararasi(unittest.TestCase):
    def test_birlestirme(self):
        with tempfile.TemporaryDirectory() as k:
            sjr = Path(k, "sjr.csv")
            sjr.write_text('Rank;Sourceid;Title;Type;Issn;SJR Best Quartile;Country;Publisher;Categories;Areas\n'
                           '1;11;Edu Q1;journal;"12345678, 87654321";Q1;United Kingdom;P;Education (Q1);Social Sciences\n'
                           '2;12;Bio Q3;journal;11112222;Q3;United States;P;Ecology (Q3);Environmental Science\n'
                           '3;13;Tr Q4;journal;33334444;Q4;Turkey;P;Law (Q4);Social Sciences\n', encoding="utf-8")
            esci = Path(k, "esci.csv")
            esci.write_text('Journal title,ISSN,eISSN,Publisher name,Publisher address,Languages,Web of Science Categories\n'
                            'TR Q4,3333-4444,,X,"ANKARA, TURKEY",Turkish|English,Law\n', encoding="utf-8")
            ssci = Path(k, "ssci.csv")
            ssci.write_text('Journal title,ISSN,eISSN,Publisher name,Publisher address,Languages,Web of Science Categories\n'
                            'EDU Q1,,8765-4321,X,"LONDON, ENGLAND",English,Education & Educational Research\n', encoding="utf-8")
            b = ul.Birlestirici()
            b.sjr_ekle(ortak.csv_oku(sjr))
            b.wos_ekle(ortak.csv_oku(esci), "ESCI")
            b.wos_ekle(ortak.csv_oku(ssci), "SSCI")
            secilen = {d["ad"]: d for d in b.dergiler if ul.secilir_mi(d)}
            self.assertEqual(set(secilen), {"Edu Q1", "Tr Q4"})
            self.assertEqual(secilen["Edu Q1"]["endeksler"], ["SSCI"])
            self.assertEqual(secilen["Edu Q1"]["alanlar"], ["Eğitim Bilimleri", "Sosyal Bilimler"])
            self.assertEqual(secilen["Tr Q4"]["ulke"], "Türkiye")
            self.assertIn("Hukuk", secilen["Tr Q4"]["alanlar"])


if __name__ == "__main__":
    unittest.main()
