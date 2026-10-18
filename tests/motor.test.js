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
