const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../assets/motor.js");

const bugun = new Date(2026, 9, 18);
const temel = {
  ad: "A", alanlar: ["Eğitim Bilimleri"], diller: ["tr", "en"], kabulEdilenTurler: ["arastirma", "derleme"],
  yillikSayi: 4, ortKabulGun: 100, ortKabulYayinGun: 60, olcumMakaleSayisi: 20, apc: 0, endeksler: ["TR Dizin"],
};
const d = (ek) => Object.assign({}, temel, ek);

test("tahmini tarih: süreler ve ilk boş sayıdan geç olanı", () => {
  assert.equal(M.tahminiYayinTarihi(d(), bugun).getMonth(), 2); // +160 gün -> Mart 2027
  const t = M.tahminiYayinTarihi(d({ ilkBosSayi: "2027-09" }), bugun);
  assert.equal(t.getFullYear(), 2027);
  assert.equal(t.getMonth(), 8);
});

test("2028 ve sonrasına dolu dergiler", () => {
  assert.equal(M.doluMu(d({ ilkBosSayi: "2028-01" })), true);
  assert.equal(M.doluMu(d({ ilkBosSayi: "2027-12" })), false);
  assert.equal(M.doluMu(d()), false);
});

test("çalışma tipine göre uygunluk", () => {
  assert.equal(M.uygunlukDegerlendir(d(), { tip: "derleme" }, bugun).uygun, true);
  const r = M.uygunlukDegerlendir(d(), { tip: "olgu" }, bugun);
  assert.equal(r.uygun, false);
  assert.match(r.engeller[0], /Olgu sunumu/);
});

test("dil, ücret, kelime ve hedef tarih engelleri", () => {
  const r = M.uygunlukDegerlendir(d({ diller: ["en"], apc: 500, maxKelime: 5000 }),
    { dil: "tr", apcKabul: false, kelime: 7000, hedefTarih: new Date(2026, 11, 31) }, bugun);
  assert.equal(r.engeller.length, 4);
});

test("gönderime kapalı dergi: açılış tarihi yoksa engel, varsa tahmin ötelenir", () => {
  const r = M.uygunlukDegerlendir(d({ gonderimKapali: true }), {}, bugun);
  assert.equal(r.uygun, false);
  assert.match(r.engeller[0], /kapalı/);
  const r2 = M.uygunlukDegerlendir(d({ gonderimKapali: true, gonderimAcilis: "2027-01-31" }), {}, bugun);
  assert.equal(r2.uygun, true);
  assert.match(r2.uyarilar[0], /açılıyor/);
  assert.equal(r2.tahminiTarih.getMonth(), 6); // 31 Ocak + 160 gün -> Temmuz 2027
});

test("TR Dizin listesi: 3-4 sayı, dolu gizli, tarihe göre sıralı", () => {
  const liste = M.trDizinListele([
    d({ ad: "yavas", ortKabulYayinGun: 300 }),
    d({ ad: "hizli", ortKabulYayinGun: 20 }),
    d({ ad: "dolu", ilkBosSayi: "2028-03" }),
    d({ ad: "aylik", yillikSayi: 12 }),
    d({ ad: "iki", yillikSayi: 2 }),
  ], {}, bugun);
  assert.deepEqual(liste.map((x) => x.ad), ["hizli", "yavas"]);
  assert.equal(M.trDizinListele([d({ ilkBosSayi: "2028-03" })], { doluGizle: false }, bugun).length, 1);
});

test("ESCI fonksiyonu", () => {
  const liste = M.esciDergileri([
    d({ ad: "e1", endeksler: ["ESCI"], ulke: "Türkiye" }),
    d({ ad: "e2", endeksler: ["ESCI"], ulke: "ABD", apc: 100 }),
    d({ ad: "s", endeksler: ["SSCI"] }),
  ], {}, bugun);
  assert.deepEqual(liste.map((x) => x.ad).sort(), ["e1", "e2"]);
  assert.equal(M.esciDergileri(liste, { sadeceTurkiye: true }, bugun).length, 1);
  assert.equal(M.esciDergileri(liste, { apcsiz: true }, bugun).length, 1);
});

test("yurtdışı: Q1, Q2 ve SSCI", () => {
  const liste = [
    d({ ad: "q1", ceyrek: "Q1", endeksler: ["SCIE"], ulke: "ABD" }),
    d({ ad: "q2", ceyrek: "Q2", endeksler: ["ESCI"], ulke: "ABD" }),
    d({ ad: "q3ssci", ceyrek: "Q3", endeksler: ["SSCI"], ulke: "ABD" }),
    d({ ad: "q4", ceyrek: "Q4", endeksler: ["ESCI"], ulke: "ABD" }),
    d({ ad: "trq1", ceyrek: "Q1", endeksler: ["SSCI"], ulke: "Türkiye" }),
  ];
  assert.deepEqual(M.yurtdisiSec(liste, {}, bugun).map((x) => x.ad), ["q1", "q2", "q3ssci"]);
  assert.deepEqual(M.yurtdisiSec(liste, { sadeceSsci: true }, bugun).map((x) => x.ad), ["q3ssci"]);
  assert.deepEqual(M.yurtdisiSec(liste, { ceyrekler: ["Q1"], ssci: false }, bugun).map((x) => x.ad), ["q1"]);
});

test("alan seçilince yalnızca o alandaki dergiler listelenir; uygunlar önce gelir", () => {
  const liste = M.trDizinListele([
    d({ ad: "tip-hizli", alanlar: ["Sağlık Bilimleri"], ortKabulYayinGun: 10 }),
    d({ ad: "alansiz", alanlar: [] }),
    d({ ad: "sosyal-yavas", alanlar: ["Sosyal Bilimler"], ortKabulYayinGun: 200 }),
    d({ ad: "sosyal-kapali", alanlar: ["Sosyal Bilimler"], ortKabulYayinGun: 5, gonderimKapali: true }),
  ], { calisma: { alan: "Sosyal Bilimler" } }, bugun);
  assert.deepEqual(liste.map((x) => x.ad), ["sosyal-yavas", "sosyal-kapali"]);
  assert.equal(M.trDizinListele([d({ alanlar: [] })], {}, bugun).length, 1); // alan seçilmediyse filtre yok
  assert.ok(M.uygunlukDegerlendir(d({ alanlar: [] }), { alan: "Sosyal Bilimler" }, bugun).engeller.includes("Alanı belirlenemedi"));
  assert.ok(M.uygunlukDegerlendir(d({ alanlar: ["Mühendislik"], ikincilAlanlar: ["Sosyal Bilimler"] }), { alan: "Sosyal Bilimler" }, bugun).engeller.includes("Alan uyuşmuyor"));
});

test("konu araması: Türkçe çekimler ve Türkçe-İngilizce eş anlamlılar eşleşir", () => {
  const dergi = d({
    basliklar: ["Avrupa'da Göçmenlere Yönelik Tutumlar", "Radical Right Parties in Europe", "Kentsel Dönüşüm"],
    anahtarKelimeler: ["popülizm", "dinamik sistemler"],
  });
  const e = M.konuEslesme(dergi, ["göç", "aşırı sağ"]);
  assert.equal(e.makale, 2);
  assert.equal(e.terimler["göç"], 1);
  assert.equal(e.terimler["aşırı sağ"], 1);
  assert.deepEqual(M.konuEslesme(dergi, ["populizm"]).anahtar, ["popülizm"]);
  assert.equal(M.konuEslesme(dergi, ["din"]).anahtar.length, 0); // "dinamik" din değildir
  const deg = M.uygunlukDegerlendir(dergi, { konu: ["terörizm"] }, bugun);
  assert.ok(deg.engeller.includes("Konu eşleşmesi yok"));
  assert.ok(M.uygunlukDegerlendir(d({}), { konu: ["göç"] }, bugun).engeller.includes("Konu verisi henüz yok"));
  // Uluslararası listelerde konu filtresi uygulanmaz (başlık verisi yok)
  const esci = M.esciDergileri([d({ endeksler: ["ESCI"] })], { calisma: { konu: ["göç"] } }, bugun);
  assert.equal(esci[0].degerlendirme.uygun, true);
});

test("makaleye göre öneri: en benzer konudaki dergi önce gelir", () => {
  const goc = d({ ad: "Göç Dergisi", basliklar: ["Suriyeli Göçmenlerin Uyumu", "Göç ve Kimlik", "Migration Policy in Turkey"],
    anahtarKelimeler: ["göç", "mülteci"], kabulOrani: 40 });
  const tip = d({ ad: "Tıp Dergisi", basliklar: ["Kardiyolojide Yeni Yaklaşımlar", "Pediatrik Astım"], anahtarKelimeler: ["kardiyoloji"] });
  const bos = d({ ad: "Verisiz" });
  const oneri = M.makaleyeGoreOner([tip, goc, bos], "Türkiye'de Suriyeli göçmenlerin toplumsal uyumu");
  assert.equal(oneri[0].dergi.ad, "Göç Dergisi");
  assert.equal(oneri.length, 1);
  assert.ok(oneri[0].benzerBasliklar.includes("Suriyeli Göçmenlerin Uyumu"));
  assert.equal(oneri[0].seviye, "Çok yüksek");
  assert.equal(M.sansTahmini(goc, "Çok yüksek").etiket, "Yüksek");
  assert.equal(M.sansTahmini(d({ kabulOrani: 10 }), "Düşük").etiket, "Düşük");
});

test("konu araması: 'cell migration' göç sayılmaz; öneri aynı başlıkta birlikte geçen terimleri öne alır", () => {
  const tip = d({ basliklar: ["Effects of Drug X on Cell Migration in Breast Cancer"] });
  assert.equal(M.konuEslesme(tip, ["göç"]).makale, 0);
  const tamUyum = d({ ad: "A", basliklar: ["Avrupa'da Aşırı Sağ ve Göç Karşıtlığı"] });
  const daginik = d({ ad: "B", basliklar: ["Avrupa Ekonomisi", "Sağ Kolda Kırık", "Göç Yolları"] });
  const o = M.makaleyeGoreOner([daginik, tamUyum], "Avrupa'da aşırı sağ ve göç");
  assert.equal(o[0].dergi.ad, "A");
});
