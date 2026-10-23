// Aylık bülten: Sosyal ve Beşeri Bilimler veri tabanındaki TR Dizin dergilerinden yayın imkânı en yakın
// olanları ve gönderime yakında açılacakları e-posta olarak hazırlar.
//   node scripts/bulten.mjs trdizin.json cikti_klasoru [YYYY-AA-GG]
// Çıktı: konu.txt, bulten.html, bulten.txt
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Motor = require("../assets/motor.js");

const SITE = "https://alcnergen.github.io/Dergibul/";
const EN_FAZLA = 25;
const ACILIS_UFKU_GUN = 90;

// Ana alanı sosyal ve beşeri bilimlerden biri olan dergiler (alan.py tek ana alan atar)
const SOSYAL_ALANLAR = new Set(["Sosyal Bilimler", "İktisadi ve İdari Bilimler", "Eğitim Bilimleri", "Hukuk",
  "Dil ve Edebiyat", "İlahiyat", "Psikoloji", "Güzel Sanatlar"]);

export function sosyalMi(d) {
  return SOSYAL_ALANLAR.has((d.alanlar || [])[0]);
}

const gun = (n) => (n ? Math.round(n) + " gün" : "—");
const tarihTr = (t) => t.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
const kacis = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function bultenHazirla(veri, bugun) {
  const sosyal = veri.dergiler.filter(sosyalMi);
  const ufuk = new Date(bugun.getTime() + ACILIS_UFKU_GUN * 864e5);

  // 1) Gönderimi kapalı olup önümüzdeki 90 gün içinde açılacak dergiler
  const acilacak = sosyal
    .filter((d) => d.gonderimKapali && d.gonderimAcilis)
    .map((d) => Object.assign({}, d, { acilis: new Date(d.gonderimAcilis) }))
    .filter((d) => !isNaN(d.acilis) && d.acilis > bugun && d.acilis <= ufuk)
    .sort((a, b) => a.acilis - b.acilis);

  // 2) Yılda 3-4 sayı çıkaran, 2028 öncesinde boş sayısı olan, gönderime açık dergilerden en erken yayın
  const enErken = Motor.trDizinListele(sosyal, { minSayi: 3, maksSayi: 4, doluGizle: true, calisma: {} }, bugun)
    .filter((d) => d.degerlendirme.uygun && d.degerlendirme.tahminiTarih)
    .slice(0, EN_FAZLA);

  // 3) İlk boş sayısını duyuran dergiler (bilgi amaçlı)
  const bosSayi = sosyal.filter((d) => d.ilkBosSayi && !Motor.doluMu(d))
    .sort((a, b) => String(a.ilkBosSayi).localeCompare(String(b.ilkBosSayi))).slice(0, EN_FAZLA);

  const ay = bugun.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  return { ay, sosyal: sosyal.length, guncelleme: veri.meta && veri.meta.guncelleme, acilacak, enErken, bosSayi };
}

function bag(d) {
  return d.url || d.dergipark || "";
}

export function htmlYaz(b) {
  const td = 'style="padding:6px 8px;border-bottom:1px solid #e3e7ef;vertical-align:top"';
  const th = 'style="padding:6px 8px;text-align:left;background:#f2f5fa;border-bottom:1px solid #d9dfea"';
  const ad = (d) => (bag(d) ? `<a href="${kacis(bag(d))}" style="color:#2c56c9">${kacis(d.ad)}</a>` : kacis(d.ad));
  const tablo = (basliklar, satirlar) => satirlar.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr>${basliklar.map((h) => `<th ${th}>${h}</th>`).join("")}</tr>${satirlar.map((s) => `<tr>${s.map((h) => `<td ${td}>${h}</td>`).join("")}</tr>`).join("")}</table>`
    : '<p style="color:#5a6478">Bu ay bu başlıkta dergi yok.</p>';
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f4f6fa;font-family:Segoe UI,Arial,sans-serif;color:#16203a">
<div style="max-width:760px;margin:0 auto;padding:24px 16px">
<h1 style="font-size:22px;margin:0 0 4px">Dergibul · ${kacis(b.ay)} bülteni</h1>
<p style="margin:0 0 20px;color:#5a6478">Sosyal ve beşeri bilimler alanındaki ${b.sosyal} TR Dizin dergisinden yayın imkânı en yakın olanlar. Veri güncelleme: ${kacis(b.guncelleme || "—")}.</p>

<h2 style="font-size:17px;margin:24px 0 8px">Gönderime yakında açılacak dergiler (90 gün içinde)</h2>
${tablo(["Dergi", "Alan", "Açılış", "Yılda sayı", "Ort. toplam süre"], b.acilacak.map((d) => [ad(d), kacis((d.alanlar || [])[0] || ""), tarihTr(d.acilis), d.yillikSayi || "—", gun(Motor.ortalamaToplamGun(d))]))}

<h2 style="font-size:17px;margin:24px 0 8px">En erken yayın imkânı (yılda 3–4 sayı, gönderime açık)</h2>
${tablo(["Dergi", "Alan", "Tahmini yayın", "Gönderim → kabul", "Kabul → yayın", "Kabul oranı"], b.enErken.map((d) => [ad(d), kacis((d.alanlar || [])[0] || ""), Motor.ayBicimle(d.degerlendirme.tahminiTarih), gun(d.ortKabulGun), gun(d.ortKabulYayinGun), d.kabulOrani != null ? "%" + d.kabulOrani : "—"]))}

${b.bosSayi.length ? `<h2 style="font-size:17px;margin:24px 0 8px">İlk boş sayısını duyuran dergiler</h2>
${tablo(["Dergi", "Alan", "İlk boş sayı"], b.bosSayi.map((d) => [ad(d), kacis((d.alanlar || [])[0] || ""), kacis(d.ilkBosSayi)]))}` : ""}

<p style="margin:28px 0 0;font-size:12px;color:#5a6478">Tahmini yayın tarihi = bugün + derginin son sayılarındaki ortalama (gönderim → kabul) + (kabul → yayın) süresi; dergi ilk boş sayısını duyurduysa geç olanı alınır. Kesin tarih değildir; başvurmadan önce derginin güncel duyurularını kontrol edin. Ayrıntılı arama: <a href="${SITE}" style="color:#2c56c9">${SITE}</a></p>
</div></body></html>`;
}

export function metinYaz(b) {
  const satir = [];
  satir.push(`Dergibul · ${b.ay} bülteni`, `Sosyal ve beşeri bilimler alanındaki TR Dizin dergileri: ${b.sosyal}. Veri güncelleme: ${b.guncelleme || "—"}`, "");
  satir.push("GÖNDERİME YAKINDA AÇILACAK DERGİLER (90 gün içinde)");
  if (!b.acilacak.length) satir.push("  Bu ay yok.");
  b.acilacak.forEach((d) => satir.push(`  - ${d.ad} — açılış ${tarihTr(d.acilis)} — ${bag(d)}`));
  satir.push("", "EN ERKEN YAYIN İMKÂNI (yılda 3–4 sayı, gönderime açık)");
  b.enErken.forEach((d, i) => satir.push(`  ${i + 1}. ${d.ad} — tahmini ${Motor.ayBicimle(d.degerlendirme.tahminiTarih)} — ${bag(d)}`));
  if (b.bosSayi.length) satir.push("", "İLK BOŞ SAYISINI DUYURAN DERGİLER");
  b.bosSayi.forEach((d) => satir.push(`  - ${d.ad} — ${d.ilkBosSayi} — ${bag(d)}`));
  satir.push("", "Tahminler derginin son sayılarındaki ortalama sürelere dayanır; kesin tarih değildir.", `Ayrıntılı arama: ${SITE}`);
  return satir.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [giris, cikti, tarih] = process.argv.slice(2);
  const bugun = tarih ? new Date(tarih) : new Date();
  const veri = JSON.parse(fs.readFileSync(giris, "utf8"));
  const b = bultenHazirla(veri, bugun);
  fs.mkdirSync(cikti, { recursive: true });
  fs.writeFileSync(path.join(cikti, "konu.txt"), `Dergibul ${b.ay} bülteni: yayın imkânı en yakın sosyal bilimler dergileri`);
  fs.writeFileSync(path.join(cikti, "bulten.html"), htmlYaz(b));
  fs.writeFileSync(path.join(cikti, "bulten.txt"), metinYaz(b));
  console.log(`${b.sosyal} sosyal bilimler dergisi; ${b.acilacak.length} yakında açılacak, ${b.enErken.length} en erken, ${b.bosSayi.length} boş sayı duyurusu`);
}
