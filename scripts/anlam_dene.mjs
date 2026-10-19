// Canlı kontrol: anlam modelinin Türkçe/İngilizce başlıklarda verdiği benzerlikleri yazdırır (eşik ayarı için).
import { pipeline } from "@huggingface/transformers";
const cikar = await pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2", { dtype: "q8" });
const basliklar = [
  "Suriyeli Göçmenlerin Toplumsal Uyumu",
  "Avrupa'da Aşırı Sağ Partilerin Mülteci Karşıtı Söylemi",
  "FROM DIGITAL RESENTMENT TO RADICALIZATION: GAMERGATE AS A GATEWAY TO THE ALT-RIGHT",
  "Refugee Integration Policies in Germany",
  "Effects of Drug X on Cell Migration in Breast Cancer",
  "Popülist Siyasete Karşı Koymak: Birleşik Devletler, Brezilya ve Macaristan",
  "TERÖR ÖRGÜTÜ PKK'NIN İLETİŞİM STRATEJİSİ: SOSYAL MEDYA PAYLAŞIMLARI",
  "Kahve Sektörü Mobil Sadakat Uygulamaları",
  "Osmanlı'da Vakıf Kurumları",
  "Pediatrik Astımda Yeni Tedavi Yaklaşımları",
];
const sorgular = ["göç", "aşırı sağ", "popülizm", "terörizm", "radikalleşme",
  "Avrupa'da aşırı sağ partilerin göç karşıtı söylemi", "mülteci entegrasyonu"];
const B = await cikar(basliklar, { pooling: "mean", normalize: true });
const S = await cikar(sorgular, { pooling: "mean", normalize: true });
const d = B.dims[1];
for (let i = 0; i < sorgular.length; i++) {
  const sat = basliklar.map((b, j) => {
    let s = 0;
    for (let k = 0; k < d; k++) s += S.data[i * d + k] * B.data[j * d + k];
    return [s.toFixed(2), b.slice(0, 50)];
  }).sort((x, y) => y[0] - x[0]);
  console.log("## " + sorgular[i]);
  sat.forEach((x) => console.log("   " + x[0] + "  " + x[1]));
}
