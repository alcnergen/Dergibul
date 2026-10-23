// Bülteni A4 PDF'e çevirir (Chromium, Playwright). Yazı tipi: Inter (@fontsource/inter), Türkçe harfleri
// kapsayan latin ve latin-ext alt kümeleri dosyaya gömülür.
//   node scripts/bulten_pdf.mjs bulten_klasoru
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function yaziCss() {
  let kok;
  try { kok = path.dirname(require.resolve("@fontsource/inter/package.json")); } catch (e) { return ""; }
  return [400, 600, 700, 800].map((w) => {
    const css = fs.readFileSync(path.join(kok, `${w}.css`), "utf8");
    return css.split(/(?=\/\* inter-)/).filter((blok) => /inter-latin(-ext)?-\d+-normal/.test(blok))
      .map((blok) => blok.replace(/src:[^;]+;/, (src) => {
        const dosya = src.match(/\.\/files\/([^)]+\.woff2)/)[1];
        const veri = fs.readFileSync(path.join(kok, "files", dosya)).toString("base64");
        return `src: url(data:font/woff2;base64,${veri}) format('woff2');`;
      })).join("\n");
  }).join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const klasor = process.argv[2];
  const { chromium } = require("playwright");
  const html = fs.readFileSync(path.join(klasor, "bulten-pdf.html"), "utf8");
  const ad = fs.readFileSync(path.join(klasor, "pdf-adi.txt"), "utf8").trim();
  const tarayici = await chromium.launch(process.env.CHROMIUM_YOLU ? { executablePath: process.env.CHROMIUM_YOLU } : {});
  const sayfa = await tarayici.newPage();
  await sayfa.setContent(html, { waitUntil: "load" });
  await sayfa.evaluate(() => document.fonts.ready);
  await sayfa.pdf({
    path: path.join(klasor, ad), format: "A4", printBackground: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;font:9px Arial,sans-serif;color:#98a2b3;text-align:center">Dergibul · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await tarayici.close();
  console.log("PDF: " + path.join(klasor, ad));
}
