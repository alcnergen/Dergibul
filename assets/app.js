/* Dergibul arayüzü: veriyi yükler, formu okur, Motor ile listeler. */
(function () {
  "use strict";

  const SABIT_ALANLAR = [
    "Eğitim Bilimleri", "Sosyal Bilimler", "İktisadi ve İdari Bilimler", "Sağlık Bilimleri",
    "Psikoloji", "Hukuk", "İlahiyat", "Dil ve Edebiyat", "Spor Bilimleri", "Güzel Sanatlar",
    "Fen Bilimleri", "Mühendislik", "Ziraat",
  ];
  const LISTE_ALANLARI = ["alanlar", "diller", "kabulEdilenTurler", "endeksler"];
  const SAYI_ALANLARI = ["yillikSayi", "ortIlkKararGun", "ortKabulGun", "ortKabulYayinGun", "ortToplamGun",
    "olcumMakaleSayisi", "maxKelime", "apc"];

  const durum = { tr: null, ul: null, varsayilan: {}, sekme: "trdizin" };
  const $ = (s) => document.querySelector(s);

  async function veriYukle(ad) {
    const yanit = await fetch("data/" + ad + ".json", { cache: "no-cache" });
    if (!yanit.ok) throw new Error(ad + ".json yüklenemedi");
    return yanit.json();
  }

  // Basit CSV okuyucu: tırnaklı alanları destekler. Liste sütunlarında ayraç "|".
  function csvOku(metin) {
    const satirlar = [];
    let satir = [], alan = "", tirnak = false;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (tirnak) {
        if (c === '"' && metin[i + 1] === '"') { alan += '"'; i++; }
        else if (c === '"') tirnak = false;
        else alan += c;
      } else if (c === '"') tirnak = true;
      else if (c === "," || c === ";") { satir.push(alan); alan = ""; }
      else if (c === "\n") { satir.push(alan); satirlar.push(satir); satir = []; alan = ""; }
      else if (c !== "\r") alan += c;
    }
    if (alan || satir.length) { satir.push(alan); satirlar.push(satir); }
    const [baslik, ...govde] = satirlar.filter((s) => s.some((x) => x.trim()));
    const dergiler = govde.map((s, i) => {
      const d = { id: "csv-" + i };
      baslik.forEach((b, j) => {
        const k = b.trim(), v = (s[j] || "").trim();
        if (v === "") return;
        if (LISTE_ALANLARI.includes(k)) d[k] = v.split("|").map((x) => x.trim()).filter(Boolean);
        else if (SAYI_ALANLARI.includes(k)) d[k] = Number(v.replace(",", "."));
        else if (k === "etikKurulZorunlu" || k === "dogrulandi") d[k] = /^(1|true|evet)$/i.test(v);
        else d[k] = v;
      });
      return d;
    });
    return { meta: { kaynak: "Yüklenen CSV", guncelleme: new Date().toISOString().slice(0, 10) }, dergiler };
  }

  function calismaOku() {
    const f = $("#calisma");
    const hedef = f.hedef.value ? Motor.ayAyristir(f.hedef.value) : null;
    if (hedef) hedef.setMonth(hedef.getMonth() + 1, 0); // ayın son günü
    return {
      tip: f.tip.value,
      alan: f.alan.value,
      dil: f.dil.value,
      kelime: Number(f.kelime.value) || null,
      apcKabul: f.apcKabul.checked,
      etikKurul: f.etikKurul.checked,
      hedefTarih: hedef,
    };
  }

  function el(etiket, sinif, metin) {
    const e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin != null) e.textContent = metin;
    return e;
  }

  function gun(n) { return n ? Math.round(n) + " gün" : "—"; }

  function dergiKarti(d) {
    const deg = d.degerlendirme;
    const kart = el("article", "dergi" + (deg.uygun ? "" : " uygunsuz"));

    const sol = el("div");
    const h = el("h3");
    if (d.url) {
      const a = el("a", null, d.ad);
      a.href = d.url; a.target = "_blank"; a.rel = "noopener";
      h.append(a);
    } else h.textContent = d.ad;
    sol.append(h);
    const bilgi = [d.yayinci, d.issn && "ISSN " + d.issn, d.ulke].filter(Boolean).join(" · ");
    sol.append(el("div", "alt-bilgi", bilgi));
    kart.append(sol);

    const sag = el("div", "tarih");
    sag.append(el("span", null, "Tahmini yayın"));
    sag.append(el("strong", null, Motor.ayBicimle(deg.tahminiTarih)));
    sag.append(el("span", null, "Uygunluk puanı " + deg.puan + "/100"));
    kart.append(sag);

    const m = el("div", "metrikler");
    const metrik = (ad, deger) => { const s = el("span"); s.append(ad + ": "); s.append(el("b", null, deger)); m.append(s); };
    metrik("Yılda sayı", d.yillikSayi || "—");
    metrik("İlk karar", gun(d.ortIlkKararGun));
    metrik("Gönderim → kabul", gun(d.ortKabulGun));
    metrik("Kabul → yayın", gun(d.ortKabulYayinGun));
    metrik("Toplam", gun(Motor.ortalamaToplamGun(d)));
    metrik("İlk boş sayı", d.ilkBosSayi || "—");
    metrik("Ücret", d.apc ? d.apc + " " + (d.apcBirim || "TL") : "Yok");
    if (d.ceyrek) metrik("Çeyrek", d.ceyrek);
    kart.append(m);

    const r = el("div", "rozetler");
    (d.endeksler || []).forEach((x) => r.append(el("span", "rozet", x)));
    (d.kabulEdilenTurler || []).forEach((x) => r.append(el("span", "rozet iyi", Motor.CALISMA_TIPLERI[x] || x)));
    deg.engeller.forEach((x) => r.append(el("span", "rozet kotu", x)));
    deg.uyarilar.forEach((x) => r.append(el("span", "rozet dikkat", x)));
    kart.append(r);
    return kart;
  }

  function listeCiz(kap, ozet, dergiler, toplam, ek) {
    const sadeceUygun = $("#calisma").sadeceUygun.checked;
    const gosterilen = sadeceUygun ? dergiler.filter((d) => d.degerlendirme.uygun) : dergiler;
    const uygun = dergiler.filter((d) => d.degerlendirme.uygun).length;
    $(ozet).textContent = toplam + " dergiden " + dergiler.length + " tanesi filtreye uyuyor, " +
      uygun + " tanesi çalışmanıza uygun." + (ek || "");
    const k = $(kap);
    k.replaceChildren();
    if (!gosterilen.length) k.append(el("div", "bos", "Bu ölçütlere uyan dergi yok. Filtreleri gevşetmeyi deneyin."));
    else gosterilen.forEach((d) => k.append(dergiKarti(d)));
  }

  function ciz() {
    const calisma = calismaOku();
    const bugun = new Date();
    if (durum.sekme === "trdizin") {
      const [min, maks] = $("#tr-frekans").value.split("-").map(Number);
      const liste = Motor.trDizinListele(durum.tr.dergiler, { minSayi: min, maksSayi: maks, doluGizle: $("#tr-dolu").checked, calisma }, bugun);
      const dolu = durum.tr.dergiler.filter((d) => Motor.doluMu(d)).length;
      listeCiz("#tr-liste", "#tr-ozet", liste, durum.tr.dergiler.length,
        dolu ? " " + dolu + " dergi " + Motor.DOLULUK_SINIR_YILI + " ve sonrasına dolu." : "");
    } else if (durum.sekme === "esci") {
      // ESCI hem TR hem uluslararası listede olabilir; ISSN ile tekilleştir.
      // TR kaydı önce gelir çünkü DergiPark'tan ölçülmüş süreleri taşır.
      const goruldu = new Set();
      const hepsi = durum.tr.dergiler.concat(durum.ul.dergiler).filter((d) => {
        const k = d.issn || d.id;
        if (goruldu.has(k)) return false;
        goruldu.add(k); return true;
      });
      const liste = Motor.esciDergileri(hepsi, {
        sadeceTurkiye: $("#esci-tr").checked, apcsiz: $("#esci-apc").checked, calisma,
      }, bugun);
      listeCiz("#esci-liste", "#esci-ozet", liste, hepsi.length);
    } else if (durum.sekme === "yurtdisi") {
      const ceyrekler = [$("#yd-q1").checked && "Q1", $("#yd-q2").checked && "Q2"].filter(Boolean);
      const liste = Motor.yurtdisiSec(durum.ul.dergiler, {
        ceyrekler, ssci: $("#yd-ssci").checked, sadeceSsci: $("#yd-sadece-ssci").checked, calisma,
      }, bugun);
      listeCiz("#yd-liste", "#yd-ozet", liste, durum.ul.dergiler.length);
    } else {
      veriDurumCiz();
    }
  }

  function veriDurumCiz() {
    const dl = $("#veri-durum");
    dl.replaceChildren();
    [["TR Dizin", durum.tr], ["Uluslararası", durum.ul]].forEach(([ad, v]) => {
      dl.append(el("dt", null, ad));
      dl.append(el("dd", null, v.dergiler.length + " dergi · " + (v.meta.kaynak || "?") + " · güncelleme " + (v.meta.guncelleme || "?")));
    });
  }

  function ornekUyarisi() {
    const ornek = [durum.tr, durum.ul].some((v) => v.meta.ornek);
    const u = $("#ornek-uyari");
    u.hidden = !ornek;
    u.textContent = ornek
      ? "Şu an örnek (kurgusal) veri gösteriliyor. Gerçek dergi listesi için README'deki güncelleme adımlarını izleyin ya da Veri sekmesinden kendi dosyanızı yükleyin."
      : "";
  }

  function secenekleriDoldur() {
    const tip = $("#tip");
    Object.entries(Motor.CALISMA_TIPLERI).forEach(([k, v]) => {
      const o = el("option", null, v); o.value = k; tip.append(o);
    });
    const alanlar = new Set(SABIT_ALANLAR);
    durum.tr.dergiler.concat(durum.ul.dergiler).forEach((d) => (d.alanlar || []).forEach((a) => alanlar.add(a)));
    const alan = $("#alan");
    const secili = alan.value;
    alan.replaceChildren(el("option", null, "Tümü"));
    alan.firstChild.value = "";
    [...alanlar].sort((a, b) => a.localeCompare(b, "tr")).forEach((a) => {
      const o = el("option", null, a); o.value = a; alan.append(o);
    });
    alan.value = secili;
  }

  function dosyaYukle(input, anahtar) {
    input.addEventListener("change", async () => {
      const dosya = input.files[0];
      if (!dosya) return;
      try {
        const metin = await dosya.text();
        const veri = /\.csv$/i.test(dosya.name) ? csvOku(metin) : JSON.parse(metin);
        if (!Array.isArray(veri.dergiler)) throw new Error("'dergiler' dizisi bulunamadı");
        veri.meta = veri.meta || { kaynak: dosya.name };
        durum[anahtar] = veri;
        secenekleriDoldur(); ornekUyarisi(); ciz();
      } catch (e) {
        alert("Dosya okunamadı: " + e.message);
      }
    });
  }

  function sekmeSec(ad) {
    durum.sekme = ad;
    document.querySelectorAll(".sekmeler button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sekme === ad)));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== ad; });
    ciz();
  }

  async function basla() {
    try {
      const [tr, ul] = await Promise.all([veriYukle("trdizin"), veriYukle("uluslararasi")]);
      durum.tr = tr; durum.ul = ul; durum.varsayilan = { tr, ul };
    } catch (e) {
      $("#tr-liste").append(el("div", "bos", "Veri yüklenemedi: " + e.message + ". Siteyi bir web sunucusu üzerinden açın (README)."));
      return;
    }
    secenekleriDoldur();
    ornekUyarisi();
    document.querySelectorAll(".sekmeler button").forEach((b) => b.addEventListener("click", () => sekmeSec(b.dataset.sekme)));
    document.querySelectorAll("#calisma input, #calisma select, .filtre input, .filtre select").forEach((x) => {
      if (x.type !== "file") x.addEventListener("input", ciz);
    });
    $("#yd-sadece-ssci").addEventListener("change", (e) => {
      ["#yd-q1", "#yd-q2", "#yd-ssci"].forEach((s) => { $(s).disabled = e.target.checked; });
    });
    dosyaYukle($("#yukle-tr"), "tr");
    dosyaYukle($("#yukle-ul"), "ul");
    $("#sifirla").addEventListener("click", () => {
      durum.tr = durum.varsayilan.tr; durum.ul = durum.varsayilan.ul;
      secenekleriDoldur(); ornekUyarisi(); ciz();
    });
    ciz();
  }

  basla();
})();
