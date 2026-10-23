import test from "node:test";
import assert from "node:assert";
import { bultenHazirla, htmlYaz, metinYaz } from "../scripts/bulten.mjs";

const d = (o) => Object.assign({ id: o.ad, alanlar: ["Sosyal Bilimler"], yillikSayi: 4, ortKabulGun: 60, ortKabulYayinGun: 30,
  dogrulandi: true, olcumMakaleSayisi: 20, url: "https://ornek.org" }, o);

test("bülten: yalnızca sosyal bilimler, kapalılar ayrı listede, en erken sıralama", () => {
  const bugun = new Date("2026-11-01");
  const veri = { meta: { guncelleme: "2026-10-31" }, dergiler: [
    d({ ad: "Hızlı Sosyal" }),
    d({ ad: "Yavaş Sosyal", ortKabulGun: 300 }),
    d({ ad: "Tıp", alanlar: ["Sağlık Bilimleri"] }),
    d({ ad: "Kapalı Açılacak", gonderimKapali: true, gonderimAcilis: "2026-12-15" }),
    d({ ad: "Dolu", ilkBosSayi: "2028-03" }),
  ] };
  const b = bultenHazirla(veri, bugun);
  assert.deepEqual(b.enErken.map((x) => x.ad), ["Hızlı Sosyal", "Kapalı Açılacak", "Yavaş Sosyal"]);
  assert.deepEqual(b.acilacak.map((x) => x.ad), ["Kapalı Açılacak"]);
  assert.ok(!JSON.stringify(b.enErken).includes("Tıp"));
  const html = htmlYaz(b);
  assert.ok(html.includes("Hızlı Sosyal") && html.includes("Kasım 2026"));
  assert.ok(metinYaz(b).includes("1. Hızlı Sosyal"));
});
