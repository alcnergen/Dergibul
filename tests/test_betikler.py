import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ortak  # noqa: E402
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

    def test_baglantilar(self):
        arsiv = f'<a href="{KOK}/issue/10">x</a><a href="/tr/pub/ornek/issue/12">y</a><a href="{KOK}/issue/10">'
        self.assertEqual(tr.sayi_baglantilari(arsiv, KOK), [f"{KOK}/issue/12", f"{KOK}/issue/10"])
        sayi = f'<a href="{KOK}/issue/12/555">a</a><a href="/tr/pub/ornek/article/777">b</a><a href="{KOK}/issue/12/555">'
        self.assertEqual(tr.makale_baglantilari(sayi, KOK), [f"{KOK}/issue/12/555", f"{KOK}/article/777"])

    def test_makale(self):
        html = """<table><tr><td>Makale Türü</td><td>Derleme</td></tr>
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
