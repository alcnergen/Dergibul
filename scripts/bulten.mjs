// Aylık bülten: Sosyal ve Beşeri Bilimler veri tabanındaki TR Dizin dergilerinden yayın imkânı en yakın
// olanları ve gönderime yakında açılacakları e-posta olarak hazırlar.
//   node scripts/bulten.mjs trdizin.json cikti_klasoru [YYYY-AA-GG]
// Çıktı: konu.txt, bulten.html, bulten.txt
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Motor = require("../assets/motor.js");
import { yaziCss } from "./bulten_pdf.mjs";

const SITE = "https://alcnergen.github.io/Dergibul/";
// Ayrı başlık: siyaset bilimi, göç, terör, güvenlik/güvenlikleştirme ve uluslararası ilişkiler
// (Türkçe çekimler ve İngilizce karşılıklar motor.js'teki eş anlamlılar sözlüğünden gelir)
export const ODAK = { ad: "Siyaset bilimi, uluslararası ilişkiler, göç, terör ve güvenlik",
  terimler: ["siyaset", "uluslararası ilişkiler", "göç", "terörizm", "güvenlik", "güvenlikleştirme"] };
const ODAK_ETIKET = { "siyaset": "siyaset", "uluslararası ilişkiler": "uluslararası ilişkiler", "göç": "göç",
  "terörizm": "terör", "güvenlik": "güvenlik", "güvenlikleştirme": "güvenlikleştirme" };
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

  // 3) Odak konular: son makalelerinde bu konulardan en az üç başlık bulunan, gönderime açık dergiler
  const odak = Motor.trDizinListele(sosyal, { minSayi: 1, maksSayi: 12, doluGizle: true, calisma: { konu: ODAK.terimler } }, bugun)
    .filter((d) => d.degerlendirme.uygun && d.degerlendirme.tahminiTarih && d.degerlendirme.konu && d.degerlendirme.konu.makale >= 3)
    .slice(0, EN_FAZLA);

  // 4) İlk boş sayısını duyuran dergiler (bilgi amaçlı)
  const bosSayi = sosyal.filter((d) => d.ilkBosSayi && !Motor.doluMu(d))
    .sort((a, b) => String(a.ilkBosSayi).localeCompare(String(b.ilkBosSayi))).slice(0, EN_FAZLA);

  const ay = bugun.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  return { ay, sosyal: sosyal.length, guncelleme: veri.meta && veri.meta.guncelleme, acilacak, enErken, odak, bosSayi };
}

function odakKonular(d) {
  const k = d.degerlendirme.konu;
  return Object.entries(k.terimler).filter(([, n]) => n).map(([t, n]) => ODAK_ETIKET[t] + " " + n).join(", ") +
    " (son " + k.toplam + " makaleden " + k.makale + ")";
}

function bag(d) {
  return d.url || d.dergipark || "";
}

// Renkler ve yazı: e-posta istemcileri harici stil dosyası okumadığı için stiller satır içinde
const R = { lacivert: "#14213d", murekkep: "#1d2939", soluk: "#667085", cizgi: "#e4e7ec", zemin: "#f2f4f7",
  vurgu: "#3559e0", vurguAcik: "#eef2ff", odak: "#b54708", odakAcik: "#fff6ed", iyi: "#067647", iyiAcik: "#ecfdf3" };
const YAZI = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function kart(d, sira, sag, alt, renk) {
  const adHtml = bag(d)
    ? `<a href="${kacis(bag(d))}" style="color:${R.murekkep};text-decoration:none;font-weight:600">${kacis(d.ad)}</a>`
    : `<span style="font-weight:600">${kacis(d.ad)}</span>`;
  return `<tr class="kart"><td style="padding:12px 0;border-bottom:1px solid ${R.cizgi}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="34" valign="top" style="padding-right:10px"><div style="width:26px;height:26px;border-radius:13px;background:${renk.acik};color:${renk.koyu};font:600 12px/26px ${YAZI};text-align:center">${sira}</div></td>
<td valign="top" style="font:14px/1.45 ${YAZI};color:${R.murekkep}">${adHtml}
<div style="font-size:12px;color:${R.soluk};margin-top:2px">${alt}</div></td>
<td valign="top" align="right" style="padding-left:10px;white-space:nowrap"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${renk.acik};color:${renk.koyu};font:600 12px ${YAZI}">${sag}</span></td>
</tr></table></td></tr>`;
}

function bolum(baslik, aciklama, satirlar, renk, bos) {
  return `<tr><td style="padding:28px 32px 4px">
<div style="font:700 11px ${YAZI};letter-spacing:.08em;text-transform:uppercase;color:${renk.koyu}">${kacis(baslik.etiket)}</div>
<div style="font:700 18px/1.3 ${YAZI};color:${R.murekkep};margin-top:4px">${kacis(baslik.ad)}</div>
${aciklama ? `<div style="font:13px/1.5 ${YAZI};color:${R.soluk};margin-top:4px">${aciklama}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
${satirlar.length ? satirlar.join("") : `<tr><td style="padding:12px 0;font:13px ${YAZI};color:${R.soluk}">${bos}</td></tr>`}
</table></td></tr>`;
}

/*
 * Bültenin HTML'i. secenek.pdf: A4 baskı için sayfa kuralları ve gömülü yazı tipi (secenek.yaziCss) eklenir.
 */
export function htmlYaz(b, secenek) {
  secenek = secenek || {};
  const mavi = { koyu: R.vurgu, acik: R.vurguAcik };
  const turuncu = { koyu: R.odak, acik: R.odakAcik };
  const yesil = { koyu: R.iyi, acik: R.iyiAcik };
  const alan = (d) => kacis((d.alanlar || [])[0] || "");
  const kabul = (d) => (d.kabulOrani != null ? " · kabul %" + d.kabulOrani : "");
  const ilk = b.enErken[0] && b.enErken[0].degerlendirme.tahminiTarih;
  const kutu = (deger, etiket) => `<td width="33%" valign="top" style="padding:14px 16px;background:rgba(255,255,255,.08);border-radius:10px">
<div style="font:700 20px ${YAZI};color:#fff">${deger}</div><div style="font:12px ${YAZI};color:#c7d0e0;margin-top:2px">${etiket}</div></td>`;

  const acilacak = b.acilacak.map((d, i) => kart(d, i + 1, tarihTr(d.acilis), `${alan(d)} · yılda ${d.yillikSayi || "?"} sayı`, yesil));
  const enErken = b.enErken.map((d, i) => kart(d, i + 1, Motor.ayBicimle(d.degerlendirme.tahminiTarih),
    `${alan(d)} · gönderim→kabul ${gun(d.ortKabulGun)} · kabul→yayın ${gun(d.ortKabulYayinGun)}${kabul(d)}`, mavi));
  const odak = b.odak.map((d, i) => kart(d, i + 1, Motor.ayBicimle(d.degerlendirme.tahminiTarih),
    `${kacis(odakKonular(d))}${kabul(d)}` + (d.degerlendirme.konu.ornek ? `<br><i>Örnek: ${kacis(d.degerlendirme.konu.ornek)}</i>` : ""), turuncu));
  const bosSayi = b.bosSayi.map((d, i) => kart(d, i + 1, kacis(d.ilkBosSayi), alan(d), mavi));

  const sayfa = secenek.pdf ? `<style>${secenek.yaziCss || ""}
@page { size: A4; margin: 14mm 0 16mm; }
body { margin: 0; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.kart { break-inside: avoid; page-break-inside: avoid; }
.dis-tablo { background: #fff !important; } .dis { padding: 0 24px !important; }
.kap { max-width: none !important; border-radius: 12px !important; }
</style>` : "";

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dergibul ${kacis(b.ay)} bülteni</title>${sayfa}</head>
<body style="margin:0;background:${R.zemin}">
<table role="presentation" class="dis-tablo" width="100%" cellpadding="0" cellspacing="0" style="background:${R.zemin}"><tr><td class="dis" align="center" style="padding:24px 12px">
<table role="presentation" class="kap" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:${R.lacivert};padding:28px 32px 24px">
<div style="font:700 12px ${YAZI};letter-spacing:.14em;color:#9fb0d0">DERGİBUL · AYLIK BÜLTEN</div>
<div style="font:800 28px/1.2 ${YAZI};color:#fff;margin-top:6px">${kacis(b.ay[0].toLocaleUpperCase("tr") + b.ay.slice(1))}</div>
<div style="font:14px/1.5 ${YAZI};color:#c7d0e0;margin-top:6px">Sosyal ve beşeri bilimlerde yayın imkânı en yakın TR Dizin dergileri</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin-top:14px"><tr>
${kutu(b.sosyal, "dergi tarandı")}${kutu(ilk ? Motor.ayBicimle(ilk) : "—", "en erken tahmini yayın")}${kutu(b.odak.length, "odak konuda dergi")}
</tr></table></td></tr>
${bolum({ etiket: "Yakında açılıyor", ad: "Gönderime 90 gün içinde açılacak dergiler" }, "", acilacak, yesil, "Bu ay gönderime açılacağını duyuran dergi yok.")}
${bolum({ etiket: "En erken yayın", ad: "Yılda 3–4 sayı çıkaran, gönderime açık dergiler" }, "Tahmini yayın tarihine göre sıralı; sağdaki tarih bugün gönderilen bir makalenin tahmini yayın ayıdır.", enErken, mavi, "Bu ay uygun dergi bulunamadı.")}
${bolum({ etiket: "Odak konular", ad: ODAK.ad }, "Son makalelerinde bu konulardan en az üç çalışma yayımlamış, gönderime açık dergiler (yılda sayı sınırı yok).", odak, turuncu, "Bu ay bu konularda uygun dergi bulunamadı.")}
${b.bosSayi.length ? bolum({ etiket: "Duyuru", ad: "İlk boş sayısını duyuran dergiler" }, "", bosSayi, mavi, "") : ""}
<tr><td style="padding:28px 32px 32px">
<div style="border-top:1px solid ${R.cizgi};padding-top:16px;font:12px/1.6 ${YAZI};color:${R.soluk}">
Tahmini yayın = bugün + derginin son sayılarındaki ortalama (gönderim → kabul) ve (kabul → yayın) süreleri; dergi ilk boş sayısını duyurduysa geç olanı alınır. Kesin tarih değildir, başvurmadan önce derginin güncel duyurularını kontrol edin.<br>
Veri güncelleme: ${kacis(b.guncelleme || "—")} · Ayrıntılı arama: <a href="${SITE}" style="color:${R.vurgu}">${SITE.replace("https://", "")}</a></div>
</td></tr></table></td></tr></table></body></html>`;
}

export function metinYaz(b) {
  const satir = [];
  satir.push(`Dergibul · ${b.ay} bülteni`, `Sosyal ve beşeri bilimler alanındaki TR Dizin dergileri: ${b.sosyal}. Veri güncelleme: ${b.guncelleme || "—"}`, "");
  satir.push("GÖNDERİME YAKINDA AÇILACAK DERGİLER (90 gün içinde)");
  if (!b.acilacak.length) satir.push("  Bu ay yok.");
  b.acilacak.forEach((d) => satir.push(`  - ${d.ad} — açılış ${tarihTr(d.acilis)} — ${bag(d)}`));
  satir.push("", "EN ERKEN YAYIN İMKÂNI (yılda 3–4 sayı, gönderime açık)");
  b.enErken.forEach((d, i) => satir.push(`  ${i + 1}. ${d.ad} — tahmini ${Motor.ayBicimle(d.degerlendirme.tahminiTarih)} — ${bag(d)}`));
  satir.push("", ODAK.ad.toLocaleUpperCase("tr"));
  if (!b.odak.length) satir.push("  Bu ay yok.");
  b.odak.forEach((d, i) => satir.push(`  ${i + 1}. ${d.ad} — tahmini ${Motor.ayBicimle(d.degerlendirme.tahminiTarih)} — ${odakKonular(d)} — ${bag(d)}`));
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
  fs.writeFileSync(path.join(cikti, "bulten-pdf.html"), htmlYaz(b, { pdf: true, yaziCss: yaziCss() }));
  const ay = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, "0")}`;
  fs.writeFileSync(path.join(cikti, "pdf-adi.txt"), `Dergibul-Bulten-${ay}.pdf`);
  fs.writeFileSync(path.join(cikti, "bulten.txt"), metinYaz(b));
  console.log(`${b.sosyal} sosyal bilimler dergisi; ${b.acilacak.length} yakında açılacak, ${b.enErken.length} en erken, ${b.odak.length} odak konu, ${b.bosSayi.length} boş sayı duyurusu`);
}
