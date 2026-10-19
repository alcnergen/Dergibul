const test = require("node:test");
const assert = require("node:assert");
const D = require("../assets/docentlik.js");

const k = (kod, ek) => Object.assign({ kod, yazar: 1, doktoraSonrasi: true }, ek);

test("Tablo 11: puanlar, yazar paylaşımı ve madde üst sınırları", () => {
  assert.equal(D.kayitPuani(D.ALANLAR.sosyal, k("1a-Q1")), 30);
  assert.equal(D.kayitPuani(D.ALANLAR.sosyal, k("1a-Q1", { yazar: 3 })), 10);   // eşit bölünür
  assert.equal(D.kayitPuani(D.ALANLAR.sosyal, k("5a", { adet: 4, yazar: 3 })), 12); // atıf bölünmez
  assert.equal(D.kayitPuani(D.ALANLAR.sosyal, k("6a", { esDanisman: true })), 2.5);
  const r = D.hesapla("sosyal", [k("4a"), k("4a"), k("4c"), k("4d"), k("5a", { adet: 10 }), k("3g"), k("3h"), k("3h"), k("3h")]);
  const m = Object.fromEntries(r.maddeler.map((x) => [x.no, x.puan]));
  assert.equal(m["4"], 20);  // kitaptan en fazla 20
  assert.equal(m["5"], 10);  // atıftan en fazla 10
  assert.equal(m["3"], 5);   // 3g+3h en fazla 5
});

test("Tezden üretilmiş yayınlar doktora sonrası 90 puana sayılmaz; doktora öncesi yayın yalnızca toplama girer", () => {
  const r = D.hesapla("sosyal", [k("3a"), k("2a", { doktoraSonrasi: false })]);
  assert.equal(r.toplam, 30);
  assert.equal(r.doktoraSonrasi, 0);
});

test("Zorunlu şartlar: eksiksiz örnek aday yeterli sayılır", () => {
  const aday = [
    k("1c"), k("1c", { yazar: 2 }),
    k("2a", { dergi: "A" }), k("2a", { dergi: "B" }), k("2a", { dergi: "C" }), k("2a", { dergi: "D", yazar: 2 }), k("2a", { dergi: "E", yazar: 2 }),
    k("3d"), k("4d"), k("4d"), k("5a", { adet: 2 }), k("8b"), k("8b"), k("9k"),
    k("1a-Q2"), k("2a", { dergi: "F" }), k("2a", { dergi: "G" }), k("7a-a"),
  ];
  const r = D.hesapla("sosyal", aday);
  assert.deepEqual(r.sartlar.filter((s) => !s.saglandi).map((s) => s.ad), []);
  assert.ok(r.toplam >= 100 && r.doktoraSonrasi >= 90);
  assert.equal(r.yeterli, true);
});

test("Ulusal makale: aynı dergide toplanan yayınlar şartı sağlamaz; 1a/1b alternatifi kabul edilir", () => {
  const ayni = [1, 2, 3, 4, 5].map(() => k("2a", { dergi: "Aynı Dergi" }));
  assert.equal(D.hesapla("sosyal", ayni).sartlar.find((s) => s.ad.startsWith("Ulusal")).saglandi, false);
  const alt = [k("1a-Q3"), k("1b", { yazar: 2 }), k("1a-Q4", { yazar: 3 })];
  assert.equal(D.hesapla("sosyal", alt).sartlar.find((s) => s.ad.startsWith("Ulusal")).saglandi, true);
});

test("Plan: boş başvurudan eksiksiz başvuruya giden adımlar yeterli sonucu verir", () => {
  const p = D.planla("sosyal", []);
  assert.equal(p.sonuc.yeterli, true);
  assert.equal(p.adimlar[0].dergiTuru, "trdizin");
  assert.equal(p.adimlar[0].adet, 5);
  assert.ok(p.adimlar.some((a) => a.dergiTuru === "esci"));
});
