// Dergilerin son makale başlıklarını çok dilli bir anlam modeliyle vektöre çevirir (yayın sırasında çalışır).
// Tarayıcı aynı modeli (transformers.js) kullanarak aramayı vektöre çevirip bu vektörlerle karşılaştırır.
//   node scripts/vektor.mjs trdizin.json vektorler.json
import fs from "node:fs";
import { pipeline, env } from "@huggingface/transformers";

export const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const DERGI_BASINA = 15;   // dergi başına en yeni 15 başlık (dosya boyutu ~7 MB)
const PARTI = 64;

if (process.env.MODEL_CACHE) env.cacheDir = process.env.MODEL_CACHE;

const [giris, cikis] = process.argv.slice(2);
const veri = JSON.parse(fs.readFileSync(giris, "utf8"));
const dergiler = [];
const metinler = [];
for (const d of veri.dergiler) {
  const b = (d.basliklar || []).slice(0, DERGI_BASINA);
  if (!b.length) continue;
  dergiler.push([d.id, b.length]);
  metinler.push(...b);
}
const cikar = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
let boyut = 0;
let vektor = null;
const bas = Date.now();
for (let i = 0; i < metinler.length; i += PARTI) {
  const t = await cikar(metinler.slice(i, i + PARTI), { pooling: "mean", normalize: true });
  if (!vektor) { boyut = t.dims[1]; vektor = new Int8Array(metinler.length * boyut); }
  const a = t.data;
  for (let j = 0; j < a.length; j++) vektor[i * boyut + j] = Math.max(-127, Math.min(127, Math.round(a[j] * 127)));
  if ((i / PARTI) % 50 === 0) console.log(`  ${i}/${metinler.length} başlık (${Math.round((Date.now() - bas) / 1000)} sn)`);
}
fs.writeFileSync(cikis, JSON.stringify({
  model: MODEL, boyut, dergiBasina: DERGI_BASINA, guncelleme: veri.meta && veri.meta.guncelleme,
  dergiler, vektor: Buffer.from(vektor.buffer).toString("base64"),
}));
console.log(`${dergiler.length} dergi, ${metinler.length} başlık, ${boyut} boyut -> ${cikis}`);
