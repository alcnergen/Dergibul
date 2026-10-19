/* Dergibul arayüzü: veriyi yükler, formu okur, Motor ile listeler. */
(function () {
  "use strict";

  const SABIT_ALANLAR = [
    "Eğitim Bilimleri", "Sosyal Bilimler", "İktisadi ve İdari Bilimler", "Sağlık Bilimleri",
    "Psikoloji", "Hukuk", "İlahiyat", "Dil ve Edebiyat", "Spor Bilimleri", "Güzel Sanatlar",
    "Fen Bilimleri", "Mühendislik", "Ziraat",
  ];
  const LISTE_ALANLARI = ["alanlar", "ikincilAlanlar", "diller", "kabulEdilenTurler", "endeksler"];
  const SAYI_ALANLARI = ["yillikSayi", "ortIlkKararGun", "ortKabulGun", "ortKabulYayinGun", "ortToplamGun",
    "olcumMakaleSayisi", "maxKelime", "apc"];

  const durum = { tr: null, ul: null, varsayilan: {}, sekme: "trdizin" };
  const $ = (s) => document.querySelector(s);

  const PAROLA_ANAHTARI = "dergibul-parola";

  async function jsonGetir(yol) {
    const yanit = await fetch(yol, { cache: "no-cache" });
    return yanit.ok ? yanit.json() : null;
  }

  // scripts/sifrele.py ile şifrelenmiş paketi çözer: PBKDF2-SHA256 -> AES-256-GCM -> gzip -> JSON
  async function paketiCoz(paket, parola) {
    const b = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const temel = await crypto.subtle.importKey("raw", new TextEncoder().encode(parola), "PBKDF2", false, ["deriveKey"]);
    const anahtar = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b(paket.tuz), iterations: paket.tekrar, hash: "SHA-256" },
      temel, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const acik = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(paket.iv) }, anahtar, b(paket.veri));
    let akis = new Blob([acik]).stream();
    if (paket.sikistirma === "gzip") akis = akis.pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(akis).text());
  }

  // Şifreli dosya varsa parola gerekir; yoksa (yerel geliştirme) düz JSON okunur
  async function veriYukle(ad, parola) {
    const paket = await jsonGetir("data/" + ad + ".enc.json");
    if (paket) {
      if (!parola) throw Object.assign(new Error("parola gerekli"), { parolaGerekli: true });
      return paketiCoz(paket, parola);
    }
    const duz = await jsonGetir("data/" + ad + ".json");
    if (!duz) throw new Error(ad + " verisi bulunamadı");
    return duz;
  }

  function kayitliParola() {
    try { return sessionStorage.getItem(PAROLA_ANAHTARI) || localStorage.getItem(PAROLA_ANAHTARI); } catch (e) { return null; }
  }

  function parolayiKaydet(parola, kalici) {
    try {
      sessionStorage.setItem(PAROLA_ANAHTARI, parola);
      if (kalici) localStorage.setItem(PAROLA_ANAHTARI, parola);
    } catch (e) { /* depo kapalı: her açılışta parola sorulur */ }
  }

  function parolayiUnut() {
    try { sessionStorage.removeItem(PAROLA_ANAHTARI); localStorage.removeItem(PAROLA_ANAHTARI); } catch (e) { /* depo kapalı */ }
  }

  async function verileriAc(parola) {
    const [tr, ul] = await Promise.all([veriYukle("trdizin", parola), veriYukle("uluslararasi", parola)]);
    durum.tr = tr; durum.ul = ul; durum.varsayilan = { tr, ul };
    durum.parola = parola;
  }

  /* ---------- Yapay zekâ ile anlam araması (tarayıcıda) ----------
   * Model ilk kullanımda indirilir (~120 MB) ve tarayıcı önbelleğinde kalır. Başlık vektörleri yayın sırasında
   * üretilir (data/vektorler.enc.json). Arama metni bu cihazdan çıkmaz.
   */
  const ANLAM_MODELI = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
  const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
  const anlam = { paket: null, cikar: null, yukleniyor: null, hata: null };

  function anlamDurumu(metin, tur) {
    document.querySelectorAll(".anlam-durum").forEach((p) => {
      p.textContent = metin || "";
      p.className = "anlam-durum ozet" + (tur ? " " + tur : "");
    });
  }

  function anlamHazirla() {
    if (anlam.paket && anlam.cikar) return Promise.resolve(true);
    if (anlam.yukleniyor) return anlam.yukleniyor;
    anlam.yukleniyor = (async () => {
      try {
        anlamDurumu("Yapay zekâ verisi açılıyor…");
        const ham = await veriYukle("vektorler", durum.parola);
        if (durum.tr.meta.guncelleme && ham.guncelleme !== durum.tr.meta.guncelleme) {
          throw new Error("başlık vektörleri sitedeki veriyle aynı güne ait değil; bir sonraki yayından sonra kullanılabilecek");
        }
        anlam.paket = Motor.anlamPaketi(ham, durum.tr.dergiler);
        anlamDurumu("Yapay zekâ modeli yükleniyor (ilk kullanımda ~120 MB, sonra önbellekten)…");
        const { pipeline } = await import(TRANSFORMERS_URL);
        const yuzde = {};
        anlam.cikar = await pipeline("feature-extraction", ANLAM_MODELI, {
          dtype: "q8",
          progress_callback: (p) => {
            if (p.status === "progress" && p.total) {
              yuzde[p.file] = p.loaded / p.total;
              const ort = Object.values(yuzde).reduce((a, b) => a + b, 0) / Object.keys(yuzde).length;
              anlamDurumu("Yapay zekâ modeli yükleniyor: %" + Math.round(ort * 100));
            }
          },
        });
        anlamDurumu("Yapay zekâ hazır.", "basarili");
        return true;
      } catch (e) {
        anlam.hata = e;
        anlamDurumu("Yapay zekâ kullanılamadı (" + e.message + "); kelime araması kullanılıyor.", "hata");
        return false;
      } finally {
        anlam.yukleniyor = null;
      }
    })();
    return anlam.yukleniyor;
  }

  async function vektorle(metinler) {
    const t = await anlam.cikar(metinler, { pooling: "mean", normalize: true });
    const d = t.dims[t.dims.length - 1];
    return metinler.map((_, i) => t.data.slice(i * d, (i + 1) * d));
  }

  // "Ara"dan önce: konu kutusu için anlamca yakın başlıkları hesaplar (seçiliyse)
  async function anlamKonuHazirla() {
    durum.konuAnlam = null;
    const terimler = Motor.konuTerimleri(al("konu"));
    if (!al("konuAnlam") || !terimler.length) return;
    if (!(await anlamHazirla())) return;
    durum.konuAnlam = Motor.anlamKonuEslesmeleri(durum.tr.dergiler, anlam.paket, await vektorle(terimler));
  }

  // Giriş ekranı: doğru parola girilene kadar bekler
  // Giriş ekranında her açılışta rastgele bir düşünür sözü
  function sozGoster() {
    const sozler = window.DERGIBUL_SOZLER || [];
    if (!sozler.length) return;
    const [metin, sahibi] = sozler[Math.floor(Math.random() * sozler.length)];
    $("#soz-metin").textContent = "“" + metin + "”";
    $("#soz-sahibi").textContent = "— " + sahibi;
    $("#soz").hidden = false;
  }

  function girisBekle() {
    sozGoster();
    $("#giris").hidden = false;
    return new Promise((coz) => {
      $("#giris-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const parola = $("#parola").value;
        $("#giris-hata").textContent = "Açılıyor…";
        try {
          await verileriAc(parola);
          parolayiKaydet(parola, $("#hatirla").checked);
          $("#giris").hidden = true;
          coz();
        } catch (hata) {
          $("#giris-hata").textContent = hata.name === "OperationError" ? "Parola yanlış." : "Veri açılamadı: " + hata.message;
        }
      });
    });
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

  // Arama parametreleri yalnızca "Ara"ya basınca uygulanır; ciz() bu anlık görüntüyü kullanır
  const PARAMETRE_SECICI = "#calisma [name], .panel:not(#veri) .filtre input, .panel:not(#veri) .filtre select";
  let uygulanan = {};

  function parametreAnahtari(x) { return x.id || x.name; }

  function parametreleriUygula() {
    uygulanan = {};
    document.querySelectorAll(PARAMETRE_SECICI).forEach((x) => {
      uygulanan[parametreAnahtari(x)] = x.type === "checkbox" ? x.checked : x.value;
    });
    bekleyenDegisiklik(false);
  }

  function bekleyenDegisiklik(var_) {
    document.querySelectorAll(".ara-dugme").forEach((b) => b.classList.toggle("bekliyor", var_));
    $(".ara-ipucu").hidden = !var_;
  }

  function al(anahtar) { return uygulanan[anahtar.replace(/^#/, "")]; }

  function calismaOku() {
    const f = {
      tip: { value: al("tip") }, alan: { value: al("alan") }, dil: { value: al("dil") },
      kelime: { value: al("kelime") }, hedef: { value: al("hedef") },
      apcKabul: { checked: al("apcKabul") }, etikKurul: { checked: al("etikKurul") },
    };
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
      konu: Motor.konuTerimleri(al("konu")),
      konuAnlam: al("konuAnlam") ? durum.konuAnlam : null,
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
    // Her dergi yalnızca ana alanının listesinde görünür; kararsız durumlarda nedeni tek cümleyle yazılır
    if (d.alanNotu) sol.append(el("p", "alan-notu", d.alanNotu));
    const konu = deg.konu;
    if (konu && (konu.makale || konu.anahtar.length)) {
      const terimler = Object.entries(konu.terimler).filter(([, n]) => n).map(([t, n]) => t + " " + n)
        .concat(konu.anlam ? ["anlamca yakın " + konu.anlam] : []).join(", ");
      const p = el("p", "konu-notu");
      p.append(el("b", null, "Konu: "));
      p.append((konu.makale ? "son " + konu.toplam + " makaleden " + konu.makale + " tanesi eşleşti" + (terimler ? " (" + terimler + ")" : "") : "") +
        (konu.anahtar.length ? (konu.makale ? "; " : "") + "anahtar kelimeler: " + konu.anahtar.slice(0, 4).join(", ") : ""));
      if (konu.ornek) { p.append(el("br")); p.append(el("i", null, "Örnek: " + konu.ornek)); }
      sol.append(p);
    }
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
    metrik("İlk boş sayı", d.ilkBosSayi ? d.ilkBosSayi + (d.ilkBosSayiKaynak ? " (" + d.ilkBosSayiKaynak + ")" : "") : "—");
    metrik("Ücret", d.apc ? d.apc + " " + (d.apcBirim || "TL") : "Yok");
    if (d.sonYayin) metrik("Son yayın", d.sonYayin);
    if (d.ceyrek) metrik("Çeyrek", d.ceyrek);
    if (d.kabulOrani != null) metrik("Kabul oranı", "%" + d.kabulOrani + (d.kabulOraniYil ? " (" + d.kabulOraniYil + ")" : ""));
    kart.append(m);

    const r = el("div", "rozetler");
    (d.alanlar || []).forEach((x) => r.append(el("span", "rozet alan", x)));
    (d.endeksler || []).forEach((x) => r.append(el("span", "rozet", x)));
    (d.kabulEdilenTurler || []).forEach((x) => r.append(el("span", "rozet iyi", Motor.CALISMA_TIPLERI[x] || x)));
    deg.engeller.forEach((x) => r.append(el("span", "rozet kotu", x)));
    deg.uyarilar.forEach((x) => r.append(el("span", "rozet dikkat", x)));
    // TR Dizin'de olup DergiPark'ta bulunmayan dergiler: süreler varsa Crossref'ten gelir
    if ((d.endeksler || []).includes("TR Dizin") && d.olcumTarihi && !d.dergipark) {
      r.append(el("span", "rozet dikkat", "DergiPark'ta yok"));
      r.append(el("span", "rozet", d.veriKaynagi === "Crossref" ? "Süreler: Crossref" : "Süre verisi bulunamadı"));
    }
    kart.append(r);
    return kart;
  }

  // Arama bir filtredir: çalışmanın kriterlerine uymayan dergiler listelenmez, yalnızca sayılır
  function listeCiz(kap, ozet, dergiler, toplam, ek) {
    const gosterilen = dergiler.filter((d) => d.degerlendirme.uygun);
    const elenen = dergiler.length - gosterilen.length;
    const nedenler = {};
    dergiler.forEach((d) => d.degerlendirme.engeller.forEach((e) => {
      const k = e.replace(/\s*\(.*\)$/, "");  // "Yayın ücreti var (1500 TL)" -> "Yayın ücreti var"
      nedenler[k] = (nedenler[k] || 0) + 1;
    }));
    const enSik = Object.entries(nedenler).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([n, c]) => n.toLocaleLowerCase("tr") + " (" + c + ")").join(", ");
    $(ozet).textContent = gosterilen.length + " dergi arama kriterlerinize uyuyor." +
      (elenen ? " " + elenen + " dergi gizlendi" + (enSik ? ": " + enSik : "") + "." : "") +
      " Toplam " + toplam + " dergi." + (ek || "");
    const k = $(kap);
    k.replaceChildren();
    if (!gosterilen.length) k.append(el("div", "bos", "Bu kriterlere uyan dergi yok. Kriterleri gevşetip yeniden arayın."));
    else gosterilen.forEach((d) => k.append(dergiKarti(d)));
  }

  function ciz() {
    const calisma = calismaOku();
    const bugun = new Date();
    if (durum.sekme === "trdizin") {
      const [min, maks] = al("tr-frekans").split("-").map(Number);
      const liste = Motor.trDizinListele(durum.tr.dergiler, { minSayi: min, maksSayi: maks, doluGizle: al("tr-dolu"), calisma }, bugun);
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
        sadeceTurkiye: al("esci-tr"), apcsiz: al("esci-apc"), calisma,
      }, bugun);
      listeCiz("#esci-liste", "#esci-ozet", liste, hepsi.length);
    } else if (durum.sekme === "yurtdisi") {
      const ceyrekler = [al("yd-q1") && "Q1", al("yd-q2") && "Q2"].filter(Boolean);
      const liste = Motor.yurtdisiSec(durum.ul.dergiler, {
        ceyrekler, ssci: al("yd-ssci"), sadeceSsci: al("yd-sadece-ssci"), calisma,
      }, bugun);
      listeCiz("#yd-liste", "#yd-ozet", liste, durum.ul.dergiler.length);
    } else if (durum.sekme === "oneri") {
      oneriCiz(calisma, bugun);
    } else if (durum.sekme === "docentlik") {
      docentlikCiz(calisma, bugun);
    } else {
      veriDurumCiz();
    }
  }

  // Makale metnine göre öneri: TR Dizin sekmesindeki filtreler ve çalışma bilgileri uygulanır, sonra konu benzerliği
  function oneriCiz(calisma, bugun) {
    const metin = durum.oneriMetin || "";
    const kap = $("#oneri-liste");
    kap.replaceChildren();
    if (!metin.trim()) { $("#oneri-ozet").textContent = "Makalenizin başlığını ya da özetini yazıp Dergi öner'e basın."; return; }
    const veriliDergi = durum.tr.dergiler.filter((d) => (d.basliklar || []).length).length;
    if (!veriliDergi) {
      $("#oneri-ozet").textContent = "Dergilerin makale başlıkları henüz toplanmadı; bir sonraki gece güncellemesinden sonra öneri yapılabilecek.";
      return;
    }
    const [min, maks] = al("tr-frekans").split("-").map(Number);
    const uygun = Motor.trDizinListele(durum.tr.dergiler, { minSayi: min, maksSayi: maks, doluGizle: al("tr-dolu"),
      calisma: Object.assign({}, calisma, { konu: null }) }, bugun).filter((d) => d.degerlendirme.uygun);
    const anlamli = durum.oneriVektor && anlam.paket;
    const kelime = Motor.makaleyeGoreOner(uygun, metin, { enFazla: uygun.length });
    const oneriler = anlamli
      ? Motor.birlesikOner(Motor.anlamselOner(uygun, anlam.paket, durum.oneriVektor, { enFazla: uygun.length }), kelime, 20)
      : kelime.slice(0, 20);
    $("#oneri-ozet").textContent = oneriler.length
      ? "Kriterlerinize uyan " + uygun.length + " dergi arasından konusu en yakın " + oneriler.length + " dergi" +
        (anlamli ? " (yapay zekâ ile anlamca ve kelime benzerliğiyle karşılaştırıldı). " : " (kelime benzerliğiyle karşılaştırıldı). ") +
        "Şans tahmini konu uyumu ile derginin kabul oranına dayanır; kesin bir olasılık değildir."
      : "Kriterlerinize uyan dergilerin son makalelerinde bu konuya yakın bir çalışma bulunamadı. Filtreleri gevşetmeyi deneyin.";
    oneriler.forEach((o) => {
      const kart = dergiKarti(o.dergi);
      const sans = Motor.sansTahmini(o.dergi, o.seviye);
      const kutu = el("div", "oneri-bilgi");
      kutu.append(el("span", "rozet " + (o.seviye === "Çok yüksek" || o.seviye === "Yüksek" ? "iyi" : "dikkat"), "Konu uyumu: " + o.seviye));
      kutu.append(el("span", "rozet " + (sans.etiket === "Yüksek" ? "iyi" : sans.etiket === "Orta" ? "dikkat" : "kotu"), "Tahmini şans: " + sans.etiket));
      kutu.append(el("p", "alan-notu", sans.neden));
      if (o.benzerBasliklar.length) kutu.append(el("p", "konu-notu", "Benzer makaleler: " + o.benzerBasliklar.join(" · ")));
      kart.prepend(kutu);
      kap.append(kart);
    });
  }

  /* ---------- Doçentlik hesaplayıcı ---------- */
  const DOC_ANAHTAR = "dergibul-docentlik";
  let docKayitlar = [];
  try { docKayitlar = JSON.parse(localStorage.getItem(DOC_ANAHTAR) || "[]"); } catch (e) { docKayitlar = []; }

  function docKaydet() {
    try { localStorage.setItem(DOC_ANAHTAR, JSON.stringify(docKayitlar)); } catch (e) { /* depo kapalı */ }
  }

  function docFormHazirla() {
    const sec = $("#doc-tur");
    Docentlik.ALANLAR.sosyal.maddeler.forEach((m) => {
      const g = document.createElement("optgroup");
      g.label = m.no + ". " + m.ad + (m.ustSinir ? " (en fazla " + m.ustSinir + " puan)" : "");
      m.bentler.forEach((b) => {
        const o = el("option", null, b.ad + " — " + b.puan + " puan" + (b.adetli ? " / atıf" : ""));
        o.value = b.kod; g.append(o);
      });
      sec.append(g);
    });
    const guncelle = () => {
      const b = Docentlik.bentBul(Docentlik.ALANLAR.sosyal, sec.value);
      $("#doc-adet-kutu").hidden = !b.adetli;
      $("#doc-dergi-kutu").hidden = !b.dergili;
      $("#doc-es-kutu").hidden = !b.esDanisman;
      $("#doc-yazar").closest("label").hidden = !b.bolunur;
    };
    sec.addEventListener("change", guncelle);
    guncelle();
    $("#doc-ekle").addEventListener("click", () => {
      const b = Docentlik.bentBul(Docentlik.ALANLAR.sosyal, sec.value);
      docKayitlar.push({
        kod: sec.value,
        yazar: b.bolunur ? Math.max(1, Number($("#doc-yazar").value) || 1) : 1,
        adet: b.adetli ? Math.max(1, Number($("#doc-adet").value) || 1) : undefined,
        dergi: b.dergili ? $("#doc-dergi").value.trim() : undefined,
        esDanisman: b.esDanisman ? $("#doc-es").checked : undefined,
        doktoraSonrasi: $("#doc-ds").checked,
      });
      docKaydet();
      $("#doc-dergi").value = "";
      ciz();
    });
    $("#doc-iletisim").addEventListener("change", () => ciz());
  }

  function docentlikCiz(calisma, bugun) {
    const alan = Docentlik.ALANLAR.sosyal;
    const secenek = { iletisimAlani: $("#doc-iletisim").checked };
    // Kayıt listesi
    const liste = $("#doc-liste");
    liste.replaceChildren();
    if (!docKayitlar.length) liste.append(el("p", "ipucu", "Henüz kayıt yok. Yukarıdan türünü seçip ekleyin."));
    else {
      const tablo = el("table", "doc-tablo");
      docKayitlar.forEach((k, i) => {
        const b = Docentlik.bentBul(alan, k.kod);
        const tr = el("tr");
        const ad = el("td");
        ad.append(el("span", null, b.ad));
        const ek = [k.yazar > 1 ? k.yazar + " yazar" : b.bolunur ? "tek yazar" : "", k.adet ? k.adet + " atıf" : "",
          k.dergi || "", k.esDanisman ? "eş danışman" : "", k.doktoraSonrasi === false ? "doktora öncesi" : ""].filter(Boolean).join(" · ");
        if (ek) ad.append(el("small", null, ek));
        tr.append(ad);
        tr.append(el("td", "sayi", String(Math.round(Docentlik.kayitPuani(alan, k) * 100) / 100)));
        const sil = el("button", "sil", "Sil");
        sil.type = "button";
        sil.addEventListener("click", () => { docKayitlar.splice(i, 1); docKaydet(); ciz(); });
        const td = el("td"); td.append(sil); tr.append(td);
        tablo.append(tr);
      });
      liste.append(tablo);
    }
    // Sonuç
    const r = Docentlik.hesapla("sosyal", docKayitlar, secenek);
    const sonuc = $("#doc-sonuc");
    sonuc.replaceChildren();
    const ozet = el("div", "doc-ozet");
    ozet.append(el("div", null, "Toplam"), el("strong", null, r.toplam + " / 100"));
    ozet.append(el("div", null, "Doktora sonrası"), el("strong", null, r.doktoraSonrasi + " / 90"));
    sonuc.append(ozet);
    sonuc.append(el("p", "rozet " + (r.yeterli ? "iyi" : "kotu"), r.yeterli ? "Asgari başvuru şartları sağlanıyor" : "Asgari şartlar henüz sağlanmıyor"));
    const ul = el("ul", "doc-sartlar");
    r.sartlar.forEach((s) => {
      const li = el("li", s.saglandi ? "tamam" : "eksik");
      li.append(el("span", "isaret", s.saglandi ? "✓" : "✗"), el("span", null, s.ad + " — " + s.durum));
      ul.append(li);
    });
    sonuc.append(ul);
    const mt = el("table", "doc-tablo");
    r.maddeler.filter((m) => m.ham).forEach((m) => {
      const tr = el("tr");
      tr.append(el("td", null, m.no + ". " + m.ad + (m.ham > m.puan ? " (üst sınır " + m.ustSinir + ")" : "")), el("td", "sayi", String(m.puan)));
      mt.append(tr);
    });
    if (mt.children.length) sonuc.append(mt);

    // Plan
    const plan = Docentlik.planla("sosyal", docKayitlar, secenek);
    const kap = $("#doc-plan");
    kap.replaceChildren();
    if (!plan.adimlar.length) { kap.append(el("p", null, "Eksik görünmüyor; başvuruya hazırsınız.")); return; }
    const [min, maks] = (al("tr-frekans") || "1-12").split("-").map(Number);
    const calismaKonusuz = Object.assign({}, calisma, { konu: null });
    const trUygun = Motor.trDizinListele(durum.tr.dergiler, { minSayi: min, maksSayi: maks, doluGizle: al("tr-dolu"), calisma: calismaKonusuz }, bugun)
      .filter((d) => d.degerlendirme.uygun && d.degerlendirme.tahminiTarih);
    const goruldu = new Set();
    const hepsi = durum.tr.dergiler.concat(durum.ul.dergiler).filter((d) => { const k = d.issn || d.id; if (goruldu.has(k)) return false; goruldu.add(k); return true; });
    const esciUygun = Motor.esciDergileri(hepsi, { calisma: calismaKonusuz }, bugun).filter((d) => d.degerlendirme.uygun && d.degerlendirme.tahminiTarih);
    const kullanilan = new Set();
    let enGec = null;
    const ol = el("ol", "doc-plan");
    plan.adimlar.forEach((a) => {
      const li = el("li");
      li.append(el("strong", null, a.adet + " × " + a.tur), el("span", "ipucu", " — " + a.neden));
      const kaynak = a.dergiTuru === "trdizin" ? trUygun : a.dergiTuru === "esci" ? esciUygun : null;
      if (kaynak) {
        const secilen = kaynak.filter((d) => !kullanilan.has(d.issn || d.id)).slice(0, a.adet);
        secilen.forEach((d) => kullanilan.add(d.issn || d.id));
        if (secilen.length) {
          const dl = el("ul", "doc-dergiler");
          secilen.forEach((d) => {
            const t = d.degerlendirme.tahminiTarih;
            if (!enGec || t > enGec) enGec = t;
            const x = el("li");
            const ad = el("a", null, d.ad); ad.href = d.url || d.dergipark || "#"; ad.target = "_blank"; ad.rel = "noopener";
            x.append(ad, el("span", "ipucu", " · tahmini yayın " + Motor.ayBicimle(t)));
            dl.append(x);
          });
          li.append(dl);
        }
        if (secilen.length < a.adet) li.append(el("p", "ipucu", "Kriterlerinize uyan yeterli dergi bulunamadı (" + secilen.length + "/" + a.adet + "); filtreleri gevşetmeyi deneyin."));
      }
      ol.append(li);
    });
    kap.append(ol);
    if (enGec) kap.append(el("p", "doc-tahmin", "Dergi gerektiren adımlar aynı anda yürütülürse en geç yayın tahmini: " + Motor.ayBicimle(enGec) +
      ". Atıf, kitap bölümü ve bildiri gibi adımların süresi bu tahmine dahil değildir."));
    kap.append(el("p", "ipucu", "Plan sonrasında tahmini toplam: " + plan.sonuc.toplam + " puan, doktora sonrası " + plan.sonuc.doktoraSonrasi + " puan."));
  }

  function veriDurumCiz() {
    const dl = $("#veri-durum");
    dl.replaceChildren();
    [["TR Dizin", durum.tr], ["Uluslararası", durum.ul]].forEach(([ad, v]) => {
      dl.append(el("dt", null, ad));
      dl.append(el("dd", null, v.dergiler.length + " dergi · " + (v.meta.kaynak || "?") + " · güncelleme " + (v.meta.guncelleme || "?") +
        (v.meta.yuklenenDosya ? " · yüklenen dosya: " + v.meta.yuklenenDosya : "") + (v.meta.ornek ? " · örnek veri" : "")));
    });
  }

  // Uyarı yalnızca açık sekmenin kullandığı liste örnek veriyse gösterilir
  function ornekUyarisi() {
    const u = $("#ornek-uyari");
    let metin = "";
    if (durum.sekme === "trdizin" && durum.tr.meta.ornek) {
      metin = "TR Dizin listesi şu an örnek (kurgusal) veri. Veri sekmesinden gerçek trdizin.json dosyasını yükleyebilirsiniz.";
    } else if ((durum.sekme === "esci" || durum.sekme === "yurtdisi") && durum.ul.meta.ornek) {
      metin = "Yurtdışı ve ESCI listesi henüz örnek (kurgusal) veri; Web of Science ve SCImago dosyaları eklenince gerçek liste gelecek. " +
        "TR Dizin sekmesindeki veriler gerçektir.";
    }
    u.hidden = !metin;
    u.textContent = metin;
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

  const DEPO_ANAHTARI = "dergibul-yuklenen-";

  function depoyaYaz(anahtar, veri) {
    try { localStorage.setItem(DEPO_ANAHTARI + anahtar, JSON.stringify(veri)); return true; } catch (e) { return false; }
  }

  function depodanOku(anahtar) {
    try { return JSON.parse(localStorage.getItem(DEPO_ANAHTARI + anahtar) || "null"); } catch (e) { return null; }
  }

  function depoyuTemizle() {
    try { ["tr", "ul"].forEach((k) => localStorage.removeItem(DEPO_ANAHTARI + k)); } catch (e) { /* depo kapalı */ }
  }

  // Dosyanın hangi listeye ait olduğunu tahmin eder: kayıtların çoğu TR Dizin'deyse "tr"
  function hedefiAlgila(veri) {
    if (/TR Dizin/i.test((veri.meta && veri.meta.kaynak) || "")) return "tr";
    const tr = veri.dergiler.filter((d) => (d.endeksler || []).includes("TR Dizin")).length;
    return tr > veri.dergiler.length / 2 ? "tr" : "ul";
  }

  function yuklemeDurumu(metin, tur) {
    const p = $("#yukle-durum");
    p.textContent = metin;
    p.className = "ozet" + (tur ? " " + tur : "");
  }

  function veriyiUygula(anahtar, veri) {
    durum[anahtar] = veri;
    secenekleriDoldur(); ornekUyarisi(); ciz();
  }

  async function sistemeAktar() {
    const dosya = $("#yukle-dosya").files[0];
    if (!dosya) return;
    try {
      const metin = await dosya.text();
      const veri = /\.csv$/i.test(dosya.name) ? csvOku(metin) : JSON.parse(metin);
      if (!veri || !Array.isArray(veri.dergiler) || !veri.dergiler.length) throw new Error("dosyada dergi listesi bulunamadı");
      veri.meta = Object.assign({ kaynak: dosya.name }, veri.meta, { yuklenenDosya: dosya.name });
      const anahtar = $("#yukle-hedef").value || hedefiAlgila(veri);
      veriyiUygula(anahtar, veri);
      const kalici = depoyaYaz(anahtar, veri);
      const ad = anahtar === "tr" ? "TR Dizin" : "Uluslararası";
      yuklemeDurumu("✓ " + dosya.name + ": " + veri.dergiler.length + " dergi " + ad + " listesine aktarıldı" +
        (kalici ? " (bu tarayıcıda hatırlanacak)." : ". Tarayıcı depolaması kapalı olduğu için sayfa yenilenince silinir."), "basarili");
      sekmeSec(anahtar === "tr" ? "trdizin" : "yurtdisi");
    } catch (e) {
      yuklemeDurumu("Dosya aktarılamadı: " + e.message, "hata");
    }
  }

  function sekmeSec(ad) {
    durum.sekme = ad;
    document.querySelectorAll(".sekmeler button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sekme === ad)));
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== ad; });
    ornekUyarisi();
    ciz();
  }

  async function basla() {
    try {
      await verileriAc(kayitliParola());
    } catch (e) {
      if (e.parolaGerekli || e.name === "OperationError") {
        parolayiUnut();
        await girisBekle();
      } else {
        $("#icerik").hidden = false;
        $("#tr-liste").append(el("div", "bos", "Veri yüklenemedi: " + e.message + ". Siteyi bir web sunucusu üzerinden açın (README)."));
        return;
      }
    }
    $("#icerik").hidden = false;
    $("#cikis").hidden = !kayitliParola();
    $("#cikis").addEventListener("click", () => { parolayiUnut(); location.reload(); });
    // Daha önce bu tarayıcıda yüklenen dosyalar
    ["tr", "ul"].forEach((k) => {
      const v = depodanOku(k);
      if (!v || !Array.isArray(v.dergiler)) return;
      // Site gece güncellendiyse ve daha yeniyse eski yüklemeyi bırak
      if ((v.meta.guncelleme || "") < (durum[k].meta.guncelleme || "") && !durum[k].meta.ornek) {
        try { localStorage.removeItem(DEPO_ANAHTARI + k); } catch (e) { /* depo kapalı */ }
        return;
      }
      durum[k] = v;
    });
    secenekleriDoldur();
    docFormHazirla();
    ornekUyarisi();
    document.querySelectorAll(".sekmeler button").forEach((b) => b.addEventListener("click", () => sekmeSec(b.dataset.sekme)));
    document.querySelectorAll(PARAMETRE_SECICI).forEach((x) => {
      x.addEventListener("input", () => bekleyenDegisiklik(true));
    });
    const araVeCiz = async () => { parametreleriUygula(); await anlamKonuHazirla(); ciz(); };
    $("#calisma").addEventListener("submit", (e) => { e.preventDefault(); araVeCiz(); });
    document.querySelectorAll(".panel .ara-dugme").forEach((b) => b.addEventListener("click", araVeCiz));
    $("#oneri-dugme").addEventListener("click", async () => {
      parametreleriUygula();
      durum.oneriMetin = $("#oneri-metin").value;
      durum.oneriVektor = null;
      if ($("#oneri-anlam").checked && durum.oneriMetin.trim() && (await anlamHazirla())) {
        durum.oneriVektor = (await vektorle([durum.oneriMetin.slice(0, 2000)]))[0];
      }
      await anlamKonuHazirla();
      ciz();
    });
    $("#yd-sadece-ssci").addEventListener("change", (e) => {
      ["#yd-q1", "#yd-q2", "#yd-ssci"].forEach((s) => { $(s).disabled = e.target.checked; });
    });
    $("#yukle-dosya").addEventListener("change", (e) => {
      $("#yukle-aktar").disabled = !e.target.files.length;
      yuklemeDurumu(e.target.files.length ? "Dosya seçildi; aktarmak için Sisteme aktar'a basın." : "");
    });
    $("#yukle-aktar").addEventListener("click", sistemeAktar);
    $("#sifirla").addEventListener("click", () => {
      depoyuTemizle();
      durum.tr = durum.varsayilan.tr; durum.ul = durum.varsayilan.ul;
      secenekleriDoldur(); ornekUyarisi(); ciz();
      yuklemeDurumu("Sitenin kendi verisine dönüldü.");
    });
    parametreleriUygula();
    ciz();
  }

  basla();
})();
