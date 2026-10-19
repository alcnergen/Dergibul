/*
 * Doçentlik puan hesaplayıcısı.
 * Tarayıcıda window.Docentlik olarak, Node'da require('./docentlik') ile kullanılır. DOM'a dokunmaz.
 *
 * Kaynak: ÜAK 2026 Ekim Dönemi Doçentlik Başvuru Şartları, Tablo 11 (Sosyal, Beşeri ve İdari Bilimler
 * Temel Alanı). Asıl belge depoda: docs/kaynak/uak-2026-ekim-tablo11-sosyal-beseri-idari.pdf
 */
(function (kok, fabrika) {
  if (typeof module === "object" && module.exports) module.exports = fabrika();
  else kok.Docentlik = fabrika();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // bolunur: "yazar" -> puan yazar sayısına eşit bölünür (tabloda: "Çok yazarlı yayınlarda puan yazarlar
  // arasında eşit olarak bölünür"); "kisi" -> patentte kişi sayısına bölünür; yoksa bölünmez.
  // adetli: kayıt bir sayı taşır (atıf sayısı gibi); puan adetle çarpılır.
  const SOSYAL = {
    ad: "Sosyal, Beşeri ve İdari Bilimler",
    kaynak: "ÜAK 2026 Ekim Dönemi Doçentlik Başvuru Şartları, Tablo 11",
    asgariToplam: 100,
    doktoraSonrasiAsgari: 90,
    doktoraSonrasiHaric: ["3"],  // "3. Lisansüstü Tezlerden Üretilmiş Yayın" puanları 90'a sayılmaz
    maddeler: [
      { no: "1", ad: "Uluslararası makale", bentler: [
        { kod: "1a-Q1", ad: "SCIE veya SSCI dergide makale (Q1)", puan: 30, bolunur: "yazar" },
        { kod: "1a-Q2", ad: "SCIE veya SSCI dergide makale (Q2)", puan: 20, bolunur: "yazar" },
        { kod: "1a-Q3", ad: "SCIE veya SSCI dergide makale (Q3)", puan: 15, bolunur: "yazar" },
        { kod: "1a-Q4", ad: "SCIE veya SSCI dergide makale (Q4)", puan: 10, bolunur: "yazar" },
        { kod: "1b", ad: "AHCI dergide makale", puan: 20, bolunur: "yazar" },
        { kod: "1c", ad: "ESCI veya Scopus dergide makale", puan: 10, bolunur: "yazar" },
        { kod: "1d", ad: "Diğer uluslararası indekslerde taranan dergide makale", puan: 5, bolunur: "yazar" },
        { kod: "1e", ad: "1a-1d dergilerinde editöre mektup, araştırma notu, özet veya kitap kritiği", puan: 3, bolunur: "yazar" },
      ] },
      { no: "2", ad: "Ulusal makale", bentler: [
        { kod: "2a", ad: "TR Dizin dergide makale", puan: 10, bolunur: "yazar", dergili: true },
        { kod: "2b", ad: "Diğer hakemli dergide makale", puan: 4, bolunur: "yazar" },
        { kod: "2c", ad: "Hakemli dergide editöre mektup, araştırma notu, özet veya kitap kritiği", puan: 2, bolunur: "yazar" },
      ] },
      { no: "3", ad: "Lisansüstü tezlerden üretilmiş yayın", ustSinir: 20, altSinirlar: [{ bentler: ["3g", "3h"], en: 5 }], bentler: [
        { kod: "3a", ad: "Tezden: SCIE, SSCI veya AHCI dergide makale", puan: 20, bolunur: "yazar" },
        { kod: "3b", ad: "Tezden: ESCI veya Scopus dergide makale", puan: 10, bolunur: "yazar" },
        { kod: "3c", ad: "Tezden: diğer uluslararası indeksli dergide makale", puan: 5, bolunur: "yazar" },
        { kod: "3d", ad: "Tezden: TR Dizin dergide makale", puan: 8, bolunur: "yazar" },
        { kod: "3e", ad: "Tezden: BKCI kapsamındaki kitap", puan: 20, bolunur: "yazar" },
        { kod: "3f", ad: "Tezden: BKCI kapsamındaki kitapta bölüm", puan: 10, bolunur: "yazar" },
        { kod: "3g", ad: "Tezden: diğer uluslararası/ulusal kitap", puan: 3, bolunur: "yazar" },
        { kod: "3h", ad: "Tezden: diğer uluslararası/ulusal kitapta bölüm", puan: 2, bolunur: "yazar" },
        { kod: "3ı", ad: "Tezden: CPCI'da yayımlanmış uluslararası bilimsel toplantı çalışması", puan: 3, bolunur: "yazar" },
        { kod: "3i", ad: "Tezden: diğer uluslararası/ulusal bilimsel toplantı çalışması", puan: 2, bolunur: "yazar" },
      ] },
      { no: "4", ad: "Kitap", ustSinir: 20, altSinirlar: [{ bentler: ["4c", "4d"], en: 5 }], bentler: [
        { kod: "4a", ad: "BKCI kapsamındaki kitap", puan: 20, bolunur: "yazar" },
        { kod: "4b", ad: "BKCI kapsamındaki kitapta bölüm", puan: 10, bolunur: "yazar" },
        { kod: "4c", ad: "Diğer uluslararası/ulusal kitap", puan: 5, bolunur: "yazar" },
        { kod: "4d", ad: "Diğer uluslararası/ulusal kitapta bölüm", puan: 3, bolunur: "yazar" },
      ] },
      { no: "5", ad: "Atıf", ustSinir: 10, bentler: [
        { kod: "5a", ad: "SCIE, SSCI, AHCI, ESCI veya Scopus kapsamında atıf", puan: 3, adetli: true },
        { kod: "5b", ad: "BKCI kapsamındaki kitapta atıf", puan: 2, adetli: true },
        { kod: "5c", ad: "TR Dizin dergide atıf", puan: 2, adetli: true },
        { kod: "5d", ad: "Diğer uluslararası/ulusal kitap veya dergide atıf", puan: 1, adetli: true },
      ] },
      { no: "6", ad: "Lisansüstü tez danışmanlığı", ustSinir: 10, bentler: [
        { kod: "6a", ad: "Tamamlanmış doktora tezi danışmanlığı", puan: 5, esDanisman: true },
        { kod: "6b", ad: "Tamamlanmış yüksek lisans tezi danışmanlığı", puan: 3, esDanisman: true },
      ] },
      { no: "7", ad: "Bilimsel araştırma projesi", ustSinir: 20, bentler: [
        { kod: "7a-y", ad: "AB Çerçeve/TÜBİTAK projesinde koordinatör/yürütücü", puan: 15 },
        { kod: "7a-a", ad: "AB Çerçeve/TÜBİTAK projesinde araştırmacı", puan: 10 },
        { kod: "7a-d", ad: "AB Çerçeve/TÜBİTAK projesinde danışman", puan: 5 },
        { kod: "7b", ad: "Uluslararası destekli projede yürütücü/araştırmacı/danışman", puan: 10 },
        { kod: "7c", ad: "Kamu/özel kuruluşla Ar-Ge/Ür-Ge projesinde görev", puan: 5 },
        { kod: "7d", ad: "BAP projesinde yürütücü", puan: 3 },
      ] },
      { no: "8", ad: "Bilimsel toplantı", ustSinir: 10, bentler: [
        { kod: "8a", ad: "CPCI'da yayımlanmış uluslararası toplantı çalışması", puan: 5, bolunur: "yazar" },
        { kod: "8b", ad: "Diğer uluslararası/ulusal toplantıda yayımlanmış çalışma", puan: 3, bolunur: "yazar" },
      ] },
      { no: "9", ad: "Eğitim-öğretim", ustSinir: 6, bentler: [
        { kod: "9a", ad: "Dönemlik programda dört farklı yarıyılda ders", puan: 2 },
        { kod: "9b", ad: "Yıllık programda iki farklı yılda ders", puan: 2 },
        { kod: "9k", ad: "Doktora sonrası en az 2 yıl kadrolu öğretim elemanı", puan: 2 },
      ] },
      { no: "10", ad: "Patent/faydalı model", bentler: [
        { kod: "10a", ad: "Tescilli uluslararası patent", puan: 20, bolunur: "kisi" },
        { kod: "10b", ad: "Tescilli ulusal patent", puan: 10, bolunur: "kisi" },
        { kod: "10c", ad: "Tescilli faydalı model", puan: 5, bolunur: "kisi" },
        { kod: "10d", ad: "Kişisel patent başvurusu", puan: 2, bolunur: "kisi" },
      ] },
      { no: "11", ad: "Ödül", ustSinir: 25, bentler: [
        { kod: "11", ad: "YÖK / TÜBİTAK / TÜBA ödülü (Yılın Doktora Tezi, Üstün Başarı, Bilim, Teşvik, GEBİP, TESEP)", puan: 25 },
      ] },
      { no: "12", ad: "Editörlük", ustSinir: 4, bentler: [
        { kod: "12a", ad: "SCIE, SSCI, AHCI, ESCI veya Scopus dergide editörlük", puan: 2 },
        { kod: "12b", ad: "BKCI veya Scopus kitapta editörlük", puan: 1 },
        { kod: "12c", ad: "TR Dizin dergide editörlük", puan: 1 },
      ] },
      { no: "13", ad: "Diğer", ustSinir: 20, bentler: [
        { kod: "13a", ad: "Web of Science h-indeksi en az 5", puan: 5 },
        { kod: "13b", ad: "İlk 300 üniversitede en az 6 ay yurt dışı araştırma/öğretim", puan: 5 },
        { kod: "13c", ad: "Film festivalinde jüri üyeliği/yürütücülük/koordinatörlük/danışmanlık", puan: 5 },
        { kod: "13d", ad: "Kısa/uzun metraj filmde yönetmenlik/yönetmen yardımcılığı/danışmanlık", puan: 5 },
        { kod: "13e", ad: "Ulusal TV/sinema/dijital platform içeriğinde bilim alanıyla ilgili görev", puan: 5 },
      ] },
    ],
  };

  const ALANLAR = { sosyal: SOSYAL };

  function bentBul(alan, kod) {
    for (const m of alan.maddeler) {
      const b = m.bentler.find((x) => x.kod === kod);
      if (b) return Object.assign({ madde: m.no }, b);
    }
    return null;
  }

  // Tek kaydın ham puanı (madde üst sınırları uygulanmadan)
  function kayitPuani(alan, k) {
    const b = bentBul(alan, k.kod);
    if (!b) return 0;
    let p = b.puan * (b.adetli ? Math.max(0, Number(k.adet) || 0) : 1);
    if (b.bolunur) p /= Math.max(1, Number(k.yazar) || 1);
    if (b.esDanisman && k.esDanisman) p /= 2;
    return p;
  }

  function maddePuani(madde, kayitlar, alan) {
    const bentPuan = {};
    kayitlar.forEach((k) => { bentPuan[k.kod] = (bentPuan[k.kod] || 0) + kayitPuani(alan, k); });
    let toplam = 0;
    const altta = new Set();
    (madde.altSinirlar || []).forEach((s) => {
      const t = s.bentler.reduce((a, kod) => a + (bentPuan[kod] || 0), 0);
      toplam += Math.min(s.en, t);
      s.bentler.forEach((kod) => altta.add(kod));
    });
    madde.bentler.forEach((b) => { if (!altta.has(b.kod)) toplam += bentPuan[b.kod] || 0; });
    const ham = madde.bentler.reduce((a, b) => a + (bentPuan[b.kod] || 0), 0);
    return { ham, puan: madde.ustSinir != null ? Math.min(madde.ustSinir, toplam) : toplam };
  }

  const yuvarla = (x) => Math.round(x * 100) / 100;

  /*
   * kayitlar: [{ kod, yazar (sayı), doktoraSonrasi (bool), adet (atıf için), dergi (2a için), esDanisman }]
   * secenek.iletisimAlani: Görsel İletişim Tasarımı, İletişim Çalışmaları, Reklamcılık, Sinema veya Halkla
   * İlişkiler bilim alanından başvuru (13. maddeden en az 10 puan şartı).
   */
  function hesapla(alanAnahtari, kayitlar, secenek) {
    const alan = ALANLAR[alanAnahtari];
    secenek = secenek || {};
    const ds = kayitlar.filter((k) => k.doktoraSonrasi !== false);
    const maddeler = alan.maddeler.map((m) => {
      const kendi = kayitlar.filter((k) => (bentBul(alan, k.kod) || {}).madde === m.no);
      const tum = maddePuani(m, kendi, alan);
      const sonra = maddePuani(m, kendi.filter((k) => k.doktoraSonrasi !== false), alan);
      return { no: m.no, ad: m.ad, ustSinir: m.ustSinir, ham: yuvarla(tum.ham), puan: yuvarla(tum.puan), doktoraSonrasiPuan: yuvarla(sonra.puan) };
    });
    const toplam = yuvarla(maddeler.reduce((a, m) => a + m.puan, 0));
    const doktoraSonrasi = yuvarla(maddeler.filter((m) => !alan.doktoraSonrasiHaric.includes(m.no))
      .reduce((a, m) => a + m.doktoraSonrasiPuan, 0));

    const puanOf = (liste, kodlar) => liste.filter((k) => kodlar.some((p) => k.kod.startsWith(p)))
      .reduce((a, k) => a + kayitPuani(alan, k), 0);
    const sartlar = [];
    const sart = (ad, saglandi, durum, eksik) => sartlar.push({ ad, saglandi, durum, eksik: saglandi ? null : eksik });

    sart("Toplam en az " + alan.asgariToplam + " puan", toplam >= alan.asgariToplam, toplam + " puan",
      { puan: yuvarla(alan.asgariToplam - toplam) });
    sart("Doktora sonrası en az " + alan.doktoraSonrasiAsgari + " puan (tezden üretilmiş yayınlar hariç)",
      doktoraSonrasi >= alan.doktoraSonrasiAsgari, doktoraSonrasi + " puan",
      { puan: yuvarla(alan.doktoraSonrasiAsgari - doktoraSonrasi) });

    const m1 = yuvarla(puanOf(ds, ["1a", "1b", "1c", "1d"]));
    sart("Uluslararası makale (1a-1d): doktora sonrası en az 10 puan", m1 >= 10, m1 + " puan", { puan: yuvarla(10 - m1) });

    const trd = ds.filter((k) => k.kod === "2a");
    const tek = trd.filter((k) => (Number(k.yazar) || 1) === 1);
    const dergiler = new Set(trd.map((k, i) => (k.dergi || "").trim().toLocaleLowerCase("tr") || "#" + i));
    const ulusalTamam = trd.length >= 5 && tek.length >= 3 && dergiler.size >= 5;
    const alt = ds.filter((k) => /^1a|^1b$/.test(k.kod));
    const altTamam = alt.length >= 3 && alt.some((k) => (Number(k.yazar) || 1) === 1);
    sart("Ulusal makale: TR Dizin'de farklı dergilerde, üçü tek yazarlı en az 5 yayın (ya da 1a/1b'den biri tek yazarlı en az 3 yayın)",
      ulusalTamam || altTamam,
      trd.length + " TR Dizin yayını, " + tek.length + " tek yazarlı, " + dergiler.size + " farklı dergi" +
        (alt.length ? "; 1a/1b: " + alt.length + " yayın" : ""),
      { trDizin: Math.max(0, 5 - trd.length, 3 - tek.length), tekYazar: Math.max(0, 3 - tek.length),
        farkliDergi: dergiler.size < trd.length });

    const tez = kayitlar.filter((k) => /^3[a-h]$/.test(k.kod));
    sart("Lisansüstü tezden üretilmiş en az bir yayın (3a-3h)", tez.length >= 1, tez.length + " yayın", { yayin: 1 });

    const kitap = ds.filter((k) => k.kod === "4a" || k.kod === "4c").length;
    const bolum = ds.filter((k) => k.kod === "4b" || k.kod === "4d").length;
    sart("Kitap: doktora sonrası en az bir kitap ya da iki kitap bölümü", kitap >= 1 || bolum >= 2,
      kitap + " kitap, " + bolum + " bölüm", { bolum: Math.max(0, 2 - bolum) });

    const atif = yuvarla(Math.min(10, puanOf(ds, ["5"])));
    sart("Atıf: doktora sonrası yayınlara en az 5 puan", atif >= 5, atif + " puan", { puan: yuvarla(5 - atif) });

    const top = yuvarla(Math.min(10, puanOf(ds, ["8"])));
    sart("Bilimsel toplantı: doktora sonrası en az 5 puan", top >= 5, top + " puan", { puan: yuvarla(5 - top) });

    const egitim = yuvarla(Math.min(6, puanOf(kayitlar, ["9"])));
    sart("Eğitim-öğretim: en az 2 puan", egitim >= 2, egitim + " puan", { puan: yuvarla(2 - egitim) });

    if (secenek.iletisimAlani) {
      const m13 = yuvarla(puanOf(kayitlar, ["13c", "13d", "13e"]));
      sart("İletişim/sinema alanları: 13. maddenin c, d veya e bentlerinden en az 10 puan", m13 >= 10, m13 + " puan",
        { puan: yuvarla(10 - m13) });
    }

    return { alan: alan.ad, kaynak: alan.kaynak, maddeler, toplam, doktoraSonrasi, sartlar,
      yeterli: sartlar.every((s) => s.saglandi) };
  }

  /*
   * Eksikleri en kısa yoldan kapatacak adımlar. Yayınların farklı dergilere aynı anda gönderileceği
   * varsayılır; tahmini süreyi arayüz Dergibul'un dergi verisiyle hesaplar (dergiTuru: "trdizin" | "esci").
   * Her adım sanal kayıt olarak eklenip hesap yeniden yapılır; böylece üst sınırlar da hesaba katılır.
   */
  function planla(alanAnahtari, kayitlar, secenek) {
    const adimlar = [];
    let sanal = kayitlar.slice();
    const ekle = (adim, yeniKayitlar) => { adimlar.push(adim); sanal = sanal.concat(yeniKayitlar); };
    const sonuc = () => hesapla(alanAnahtari, sanal, secenek);
    const sartBul = (r, bas) => r.sartlar.find((s) => s.ad.startsWith(bas));
    const tekrar = (n, k) => Array.from({ length: n }, () => Object.assign({ doktoraSonrasi: true, yazar: 1 }, k));

    let r = sonuc();
    const ulusal = sartBul(r, "Ulusal makale");
    if (!ulusal.saglandi) {
      const trd = sanal.filter((k) => k.kod === "2a" && k.doktoraSonrasi !== false);
      const tek = trd.filter((k) => (Number(k.yazar) || 1) === 1).length;
      const adet = Math.max(5 - trd.length, 3 - tek);
      ekle({ tur: "TR Dizin dergide tek yazarlı makale", adet, puan: 10, dergiTuru: "trdizin",
        neden: "Ulusal makale şartı: farklı TR Dizin dergilerinde en az 5 yayın, en az 3'ü tek yazarlı." },
      tekrar(adet, { kod: "2a", dergi: "" }).map((k, i) => Object.assign(k, { dergi: "#plan-trd-" + i })));
      r = sonuc();
    }
    const m1 = sartBul(r, "Uluslararası makale");
    if (!m1.saglandi) {
      const adet = Math.ceil(m1.eksik.puan / 10);
      ekle({ tur: "ESCI veya Scopus dergide tek yazarlı makale (ya da bir SSCI makalesi)", adet, puan: 10, dergiTuru: "esci",
        neden: "Uluslararası makale şartı: 1a-1d bentlerinden doktora sonrası en az 10 puan." }, tekrar(adet, { kod: "1c" }));
      r = sonuc();
    }
    const tez = sartBul(r, "Lisansüstü tezden");
    if (!tez.saglandi) {
      ekle({ tur: "Tezden üretilmiş makale (TR Dizin dergide)", adet: 1, puan: 8, dergiTuru: "trdizin",
        neden: "Tezden üretilmiş en az bir yayın zorunlu. Bu puan doktora sonrası 90 puana sayılmaz." }, tekrar(1, { kod: "3d" }));
      r = sonuc();
    }
    const kitap = sartBul(r, "Kitap");
    if (!kitap.saglandi) {
      const adet = kitap.eksik.bolum || 2;
      ekle({ tur: "Kitap bölümü (BKCI kapsamındaki kitapta 10, diğer kitapta 3 puan)", adet, puan: 3,
        neden: "Kitap şartı: bir kitap ya da tüm bölümleri alanınızla ilgili bir kitapta iki bölüm. Diğer kitaplardan en fazla 5 puan sayılır." },
      tekrar(adet, { kod: "4d" }));
      r = sonuc();
    }
    const top = sartBul(r, "Bilimsel toplantı");
    if (!top.saglandi) {
      const adet = Math.ceil(top.eksik.puan / 3);
      ekle({ tur: "Bilimsel toplantıda sunulup tam metni/özeti yayımlanan bildiri", adet, puan: 3,
        neden: "Doktora sonrası en az 5 puan; aynı toplantıdan yalnızca bir çalışma sayılır." }, tekrar(adet, { kod: "8b" }));
      r = sonuc();
    }
    const egitim = sartBul(r, "Eğitim-öğretim");
    if (!egitim.saglandi) {
      ekle({ tur: "Dört farklı yarıyılda ders vermek ya da en az 2 yıl kadrolu öğretim elemanı olmak", adet: 1, puan: 2,
        neden: "Eğitim-öğretim maddesinden en az 2 puan zorunlu." }, tekrar(1, { kod: "9a" }));
      r = sonuc();
    }
    const atif = sartBul(r, "Atıf");
    if (!atif.saglandi) {
      const adet = Math.ceil(atif.eksik.puan / 3);
      ekle({ tur: "Yayınlarınıza SCIE/SSCI/AHCI/ESCI/Scopus dergilerinde atıf", adet, puan: 3,
        neden: "Doktora sonrası yayınlarınıza yapılmış atıflardan en az 5 puan gerekir; kendi atıflarınız sayılmaz." },
      tekrar(adet, { kod: "5a", adet: 1 }));
      r = sonuc();
    }
    // Kalan puan açığı: sınırı olmayan en hızlı kalem olarak TR Dizin'de tek yazarlı makale
    let ek = 0;
    while ((r.toplam < 100 || r.doktoraSonrasi < 90) && ek < 15) {
      sanal = sanal.concat(tekrar(1, { kod: "2a", dergi: "#plan-ek-" + ek }));
      ek++;
      r = sonuc();
    }
    if (ek) {
      adimlar.push({ tur: "Ek TR Dizin dergide tek yazarlı makale", adet: ek, puan: 10, dergiTuru: "trdizin",
        neden: "Toplam 100 ve doktora sonrası 90 puana ulaşmak için. SSCI Q1 makale (30 puan) üç TR Dizin makalesi yerine geçer ama genellikle daha uzun sürer." });
    }
    return { adimlar, sonuc: r };
  }

  return { ALANLAR, bentBul, kayitPuani, hesapla, planla };
});
