/*
 * Dergibul uygunluk motoru.
 * Tarayıcıda window.Motor olarak, Node'da require('./motor') ile kullanılır.
 * DOM'a dokunmaz; tüm fonksiyonlar saf (pure) olduğu için test edilebilir.
 */
(function (kok, fabrika) {
  if (typeof module === "object" && module.exports) module.exports = fabrika();
  else kok.Motor = fabrika();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Çalışma tipleri: anahtar -> görünen ad
  const CALISMA_TIPLERI = {
    arastirma: "Araştırma makalesi",
    derleme: "Derleme",
    sistematik: "Sistematik derleme / meta-analiz",
    olgu: "Olgu sunumu",
    kisa: "Kısa makale / editöre mektup",
    kitap: "Kitap incelemesi",
    ceviri: "Çeviri",
    tez: "Tezden üretilmiş makale",
  };

  // TR Dizin başvurularında varsayılan "dolu" sınırı: bu yıl ve sonrası kapalı sayılır
  const DOLULUK_SINIR_YILI = 2028;

  function gunEkle(tarih, gun) {
    const t = new Date(tarih.getTime());
    t.setDate(t.getDate() + Math.round(gun));
    return t;
  }

  // "2027-03" veya "2027" -> ayın ilk günü
  function ayAyristir(deger) {
    if (!deger) return null;
    const m = String(deger).match(/^(\d{4})(?:-(\d{1,2}))?/);
    if (!m) return null;
    return new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1);
  }

  function ayBicimle(tarih) {
    if (!tarih) return "—";
    const aylar = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    return aylar[tarih.getMonth()] + " " + tarih.getFullYear();
  }

  // Gönderimden yayına toplam ortalama gün. Ölçülmüş toplam yoksa parçalardan hesaplanır.
  function ortalamaToplamGun(dergi) {
    if (dergi.ortToplamGun) return dergi.ortToplamGun;
    if (dergi.ortKabulGun && dergi.ortKabulYayinGun) return dergi.ortKabulGun + dergi.ortKabulYayinGun;
    return null;
  }

  /*
   * Bugün gönderilen bir çalışmanın en erken tahmini yayın tarihi.
   * İki sınırdan büyük olanı alınır: (1) ortalama süreler, (2) derginin ilan ettiği ilk boş sayı.
   */
  // Gönderim geçici olarak kapalıysa ve açılış tarihi duyurulduysa, saat o tarihte başlar
  function gonderimBaslangici(dergi, bugun) {
    const acilis = dergi.gonderimAcilis ? new Date(dergi.gonderimAcilis) : null;
    return acilis && !isNaN(acilis) && acilis > bugun ? acilis : bugun;
  }

  function tahminiYayinTarihi(dergi, bugun) {
    bugun = bugun || new Date();
    const toplam = ortalamaToplamGun(dergi);
    const sureyeGore = toplam ? gunEkle(gonderimBaslangici(dergi, bugun), toplam) : null;
    const bosSayi = ayAyristir(dergi.ilkBosSayi);
    if (sureyeGore && bosSayi) return sureyeGore > bosSayi ? sureyeGore : bosSayi;
    return sureyeGore || bosSayi;
  }

  function doluMu(dergi, sinirYili) {
    sinirYili = sinirYili || DOLULUK_SINIR_YILI;
    const bos = ayAyristir(dergi.ilkBosSayi);
    return !!(bos && bos.getFullYear() >= sinirYili);
  }

  function frekansUygunMu(dergi, min, maks) {
    const n = dergi.yillikSayi;
    return typeof n === "number" && n >= min && n <= maks;
  }

  /*
   * Bir çalışmanın bir dergiye uygunluğunu değerlendirir.
   * calisma: { tip, alan, dil, kelime, apcKabul, etikKurul, hedefTarih (Date|null) }
   * Dönüş: { uygun, puan (0-100), engeller[], uyarilar[], tahminiTarih }
   */
  function uygunlukDegerlendir(dergi, calisma, bugun) {
    bugun = bugun || new Date();
    const engeller = [];
    const uyarilar = [];

    if (calisma.tip && dergi.kabulEdilenTurler && dergi.kabulEdilenTurler.length &&
        !dergi.kabulEdilenTurler.includes(calisma.tip)) {
      engeller.push((CALISMA_TIPLERI[calisma.tip] || calisma.tip) + " kabul etmiyor");
    }
    // Her dergi tek ana alana atanır; alanı belirlenemeyen dergi hiçbir alan aramasında çıkmaz
    if (calisma.alan && !(dergi.alanlar || []).includes(calisma.alan)) {
      engeller.push(dergi.alanlar && dergi.alanlar.length ? "Alan uyuşmuyor" : "Alanı belirlenemedi");
    }
    let konu = null;
    if (calisma.konu && calisma.konu.length) {
      konu = konuEslesme(dergi, calisma.konu);
      if (!konu.veriVar) engeller.push("Konu verisi henüz yok");
      else if (!konu.makale && !konu.anahtar.length) engeller.push("Konu eşleşmesi yok");
    }
    if (calisma.dil && dergi.diller && dergi.diller.length && !dergi.diller.includes(calisma.dil)) {
      engeller.push(calisma.dil.toUpperCase() + " dilinde yayın yapmıyor");
    }
    if (calisma.kelime && dergi.maxKelime && calisma.kelime > dergi.maxKelime) {
      engeller.push("Kelime sınırı aşılıyor (en çok " + dergi.maxKelime + ")");
    }
    if (calisma.apcKabul === false && dergi.apc > 0) {
      engeller.push("Yayın ücreti var (" + dergi.apc + " " + (dergi.apcBirim || "TL") + ")");
    }
    if (calisma.etikKurul === false && dergi.etikKurulZorunlu) {
      uyarilar.push("Etik kurul izni isteniyor");
    }
    if (dergi.gonderimKapali) {
      const acilis = gonderimBaslangici(dergi, bugun);
      if (acilis > bugun) uyarilar.push("Gönderim " + acilis.toLocaleDateString("tr-TR") + " tarihinde açılıyor");
      else engeller.push("Makale gönderimine şu an kapalı");
    }
    if (doluMu(dergi)) {
      engeller.push("İlk boş sayı " + dergi.ilkBosSayi + " (" + DOLULUK_SINIR_YILI + "+ dolu)");
    }

    const tahmini = tahminiYayinTarihi(dergi, bugun);
    if (!tahmini) uyarilar.push("Süre verisi yok");
    if (calisma.hedefTarih && tahmini && tahmini > calisma.hedefTarih) {
      engeller.push("Tahmini yayın (" + ayBicimle(tahmini) + ") hedef tarihten sonra");
    }
    if (dergi.yillikSayi && (dergi.yillikSayi < 3 || dergi.yillikSayi > 4)) {
      uyarilar.push("Yılda " + dergi.yillikSayi + " sayı");
    }
    if (dergi.kabulOrani != null && dergi.kabulOrani < 20) uyarilar.push("Düşük kabul oranı (%" + dergi.kabulOrani + ")");
    if (dergi.dogrulandi === false) uyarilar.push("Veri doğrulanmadı");

    // Puan: hız (50), yayın sıklığı (20), ücret (15), veri güveni (15)
    let puan = 0;
    if (tahmini) {
      const ay = (tahmini - bugun) / (1000 * 60 * 60 * 24 * 30.44);
      puan += Math.max(0, 50 - Math.max(0, ay - 3) * 3); // 3 ay ve altı tam puan, sonra her ay -3
    }
    if (dergi.yillikSayi >= 3 && dergi.yillikSayi <= 4) puan += 20;
    else if (dergi.yillikSayi > 4) puan += 15;
    else if (dergi.yillikSayi) puan += 5;
    if (!dergi.apc) puan += 15;
    if (dergi.dogrulandi !== false && dergi.olcumMakaleSayisi >= 10) puan += 15;
    else if (dergi.dogrulandi !== false) puan += 8;

    return {
      uygun: engeller.length === 0,
      puan: Math.round(Math.min(100, puan)),
      engeller: engeller,
      uyarilar: uyarilar,
      tahminiTarih: tahmini,
      konu: konu,
    };
  }


  /* ---------- Konu araması ve makaleye göre dergi önerisi ----------
   * Veri: her derginin son makalelerinin başlıkları (basliklar) ve anahtar kelimeleri (anahtarKelimeler).
   * Metinler Türkçe harfler sadeleştirilerek (ı→i, ş→s ...) küçük harfe çevrilir; kelime başı eşleşmesi
   * sayesinde "göç" araması "göçmen", "göçün" gibi çekimleri de bulur.
   */
  function sadelestir(metin) {
    return String(metin || "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o")
      .replace(/ç/g, "c").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Sık aranan konular için Türkçe-İngilizce yakın ifadeler (sadeleştirilmiş, kelime başı olarak aranır)
  const KONU_ESANLAM = [
    ["goc", "gocmen", "migration", "migrant", "immigra", "emigra", "multeci", "refugee", "siginmaci", "asylum", "diaspora"],
    ["asiri sag", "radikal sag", "far right", "radical right", "extreme right", "asiri milliyetci"],
    ["populizm", "populist", "populism"],
    ["terorizm", "teror", "terrorism", "terrorist", "radikallesme", "radicali", "siddetli asiri", "violent extrem"],
    ["milliyetcilik", "nationalism", "nationalist"],
    ["demokrasi", "democracy", "democrati"],
    ["otoriter", "authoritarian"],
    ["secim", "election", "electoral", "voting", "secmen"],
    ["guvenlik", "security", "guvenliklestirme", "securitization"],
    ["dis politika", "foreign policy"],
    ["uluslararasi iliskiler", "international relations"],
    ["kimlik", "identity"],
    ["irkcilik", "racism", "yabanci dusmanligi", "xenophobia", "islamofobi", "islamophobia"],
    ["toplumsal cinsiyet", "gender", "kadin", "women", "feminizm", "feminism"],
    ["iklim degisikligi", "climate change", "kuresel isinma", "global warming"],
    ["yapay zeka", "artificial intelligence", "makine ogrenmesi", "machine learning", "derin ogrenme", "deep learning"],
    ["sosyal medya", "social media"],
    ["dijital", "digital"],
    ["yoksulluk", "poverty"],
    ["issizlik", "unemployment"],
    ["enflasyon", "inflation"],
    ["kamu politikasi", "public policy"],
    ["yerel yonetim", "local government", "belediye", "municipal"],
    ["avrupa birligi", "european union"],
    ["ortadogu", "orta dogu", "middle east"],
    ["din", "religion", "religious"],
    ["egitim", "education"],
    ["saglik", "health"],
    ["turizm", "tourism"],
    ["surdurulebilir", "sustainab"],
  ];

  function terimleriGenislet(terim) {
    const t = sadelestir(terim);
    if (!t) return [];
    const grup = KONU_ESANLAM.find((g) => g.some((x) => x === t || (t.length >= 4 && x.startsWith(t))));
    return [...new Set([t].concat(grup || []))];
  }

  // Kelime başı eşleşmesi: "goc" -> "goc", "gocun"; "asiri sag" -> "asiri sagci".
  // 3 harf ve altındaki ifadelere en çok 3 harflik ek izin verilir ("din" -> "dini", ama "dinamik" değil).
  function iceriyor(sadeMetin, ifade) {
    if (ifade.length > 3 || ifade.includes(" ")) return (" " + sadeMetin).indexOf(" " + ifade) >= 0;
    return sadeMetin.split(" ").some((k) => k.startsWith(ifade) && k.length - ifade.length <= 3);
  }

  function konuVerisiVar(dergi) {
    return Boolean((dergi.basliklar && dergi.basliklar.length) || (dergi.anahtarKelimeler && dergi.anahtarKelimeler.length));
  }

  /*
   * Konu eşleşmesi. terimler: ["göç", "aşırı sağ"] (herhangi biri eşleşirse yeter).
   * Dönüş: { veriVar, makale (eşleşen başlık sayısı), toplam, anahtar[], terimler{terim: sayı}, ornek }
   */
  function konuEslesme(dergi, terimler) {
    const basliklar = (dergi.basliklar || []).map(sadelestir);
    const anahtarlar = dergi.anahtarKelimeler || [];
    const sonuc = { veriVar: konuVerisiVar(dergi), makale: 0, toplam: basliklar.length, anahtar: [], terimler: {}, ornek: null };
    const eslesenBaslik = new Set();
    terimler.forEach((terim) => {
      const ifadeler = terimleriGenislet(terim);
      if (!ifadeler.length) return;
      let sayi = 0;
      basliklar.forEach((b, i) => {
        if (ifadeler.some((f) => iceriyor(b, f))) { sayi++; eslesenBaslik.add(i); }
      });
      anahtarlar.forEach((a) => {
        if (ifadeler.some((f) => iceriyor(sadelestir(a), f)) && !sonuc.anahtar.includes(a)) sonuc.anahtar.push(a);
      });
      sonuc.terimler[terim] = sayi;
    });
    sonuc.makale = eslesenBaslik.size;
    if (eslesenBaslik.size) sonuc.ornek = dergi.basliklar[Math.min(...eslesenBaslik)];
    return sonuc;
  }

  function konuTerimleri(metin) {
    return String(metin || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  }

  const DURAK = new Set(("ve ile bir bu da de icin olarak uzerine uzerinde hakkinda bazi gibi kadar daha en cok " +
    "olan ile ya veya ama ancak the of and in on for to a an with from by as at its is are be this that between " +
    "study analysis case example evidence role effect effects impact approach perspective turkey turkiye " +
    "uzerine inceleme analiz analizi ornegi ornek degerlendirme etkisi etkileri rolu yaklasim").split(" "));

  // Kaba kök: Türkçe ekleri kabaca atmak için kelimenin ilk 6 harfi
  function kokler(metin) {
    return sadelestir(metin).split(" ").filter((k) => k.length >= 3 && !DURAK.has(k)).map((k) => k.slice(0, 6));
  }

  /*
   * Makale metnine (başlık, özet, anahtar kelimeler) en yakın dergiler.
   * TF-IDF kosinüs benzerliği: derginin son makale başlıkları + anahtar kelimeleri bir belge sayılır.
   * Dönüş: [{ dergi, benzerlik (0-1), seviye, benzerBasliklar[] }] benzerliğe göre azalan.
   */
  function makaleyeGoreOner(dergiler, metin, secenek) {
    secenek = Object.assign({ enFazla: 20 }, secenek);
    const sorguKok = kokler(metin);
    konuTerimleri(metin).forEach((t) => terimleriGenislet(t).slice(1).forEach((e) => sorguKok.push(...kokler(e))));
    if (!sorguKok.length) return [];
    const adaylar = dergiler.filter(konuVerisiVar);
    const belgeler = adaylar.map((d) => {
      const tf = new Map();
      const ekle = (k, w) => tf.set(k, (tf.get(k) || 0) + w);
      (d.basliklar || []).forEach((b) => kokler(b).forEach((k) => ekle(k, 1)));
      (d.anahtarKelimeler || []).forEach((a) => kokler(a).forEach((k) => ekle(k, 2)));
      return tf;
    });
    const df = new Map();
    belgeler.forEach((tf) => tf.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)));
    const N = belgeler.length || 1;
    const idf = (k) => Math.log((N + 1) / ((df.get(k) || 0) + 1)) + 1;
    const q = new Map();
    sorguKok.forEach((k) => q.set(k, (q.get(k) || 0) + 1));
    let qNorm = 0;
    q.forEach((v, k) => { qNorm += (v * idf(k)) ** 2; });
    qNorm = Math.sqrt(qNorm) || 1;
    const sonuc = adaylar.map((d, i) => {
      const tf = belgeler[i];
      let carp = 0, dNorm = 0;
      tf.forEach((v, k) => { const w = (1 + Math.log(v)) * idf(k); dNorm += w * w; });
      q.forEach((v, k) => { if (tf.has(k)) carp += v * idf(k) * (1 + Math.log(tf.get(k))) * idf(k); });
      const benzerlik = carp / (qNorm * (Math.sqrt(dNorm) || 1));
      // Hangi başlıklar benziyor: sorgu köklerinden en çok içeren 2 başlık
      const qk = new Set(q.keys());
      const benzerBasliklar = (d.basliklar || [])
        .map((b) => [b, kokler(b).filter((k) => qk.has(k)).length])
        .filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]);
      return { dergi: d, benzerlik, benzerBasliklar };
    }).filter((x) => x.benzerlik > 0).sort((a, b) => b.benzerlik - a.benzerlik);
    const enYuksek = sonuc.length ? sonuc[0].benzerlik : 1;
    sonuc.forEach((x) => {
      const oran = x.benzerlik / enYuksek;
      x.seviye = oran >= 0.75 && x.benzerBasliklar.length ? "Çok yüksek" : oran >= 0.5 ? "Yüksek" : oran >= 0.3 ? "Orta" : "Düşük";
    });
    return sonuc.slice(0, secenek.enFazla);
  }

  /*
   * Kabaca kabul şansı: derginin kabul oranı ve konu uyumu birlikte. Gerçek bir olasılık değildir;
   * yalnızca karşılaştırma için Yüksek / Orta / Düşük döner ve nedenini tek cümleyle açıklar.
   */
  function sansTahmini(dergi, seviye) {
    const uyum = { "Çok yüksek": 2, "Yüksek": 1, "Orta": 0, "Düşük": -1 }[seviye] || 0;
    const oran = dergi.kabulOrani;
    let puan = uyum + (oran == null ? 0 : oran >= 50 ? 2 : oran >= 30 ? 1 : oran >= 15 ? 0 : -1);
    const etiket = puan >= 3 ? "Yüksek" : puan >= 1 ? "Orta" : "Düşük";
    const neden = "Konu uyumu " + seviye.toLocaleLowerCase("tr") + (oran == null
      ? "; derginin kabul oranı bilinmiyor." : ", derginin kabul oranı %" + oran + (dergi.kabulOraniYil ? " (" + dergi.kabulOraniYil + ")" : "") + ".");
    return { etiket, neden };
  }

  /*
   * TR Dizin listesi: varsayılan olarak yılda 3-4 sayı çıkaran ve 2028 öncesinde
   * boş sayısı olan dergileri, en erken tahmini yayın tarihine göre sıralar.
   */
  // Alan seçildiyse yalnızca o alandaki dergiler listelenir (alanı bilinmeyenler de dışarıda kalır)
  function alanUyar(dergi, alan) {
    return !alan || (dergi.alanlar || []).includes(alan);
  }

  function trDizinListele(dergiler, secenek, bugun) {
    secenek = Object.assign({ minSayi: 3, maksSayi: 4, doluGizle: true, sadeceUygun: false, calisma: {} }, secenek);
    bugun = bugun || new Date();
    return dergiler
      .filter((d) => !secenek.minSayi || frekansUygunMu(d, secenek.minSayi, secenek.maksSayi))
      .filter((d) => !secenek.doluGizle || !doluMu(d))
      .filter((d) => alanUyar(d, secenek.calisma.alan))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, secenek.calisma, bugun) }))
      .filter((d) => !secenek.sadeceUygun || d.degerlendirme.uygun)
      .sort(tarihSirala);
  }

  // Çalışmaya uygun dergiler her zaman uygun olmayanlardan önce gelir
  function uygunOnce(a, b) {
    return (b.degerlendirme.uygun ? 1 : 0) - (a.degerlendirme.uygun ? 1 : 0);
  }

  function tarihSirala(a, b) {
    if (uygunOnce(a, b)) return uygunOnce(a, b);
    const ta = a.degerlendirme.tahminiTarih, tb = b.degerlendirme.tahminiTarih;
    if (ta && tb && ta - tb !== 0) return ta - tb;
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return b.degerlendirme.puan - a.degerlendirme.puan;
  }

  /*
   * ESCI (Emerging Sources Citation Index) dergileri.
   * secenek: { alan, sadeceTurkiye, apcsiz, calisma }
   */
  // Uluslararası listelerde makale başlığı verisi yok; konu filtresi yalnızca TR Dizin'de uygulanır
  function konusuz(calisma) {
    return Object.assign({}, calisma || {}, { konu: null });
  }

  function esciDergileri(dergiler, secenek, bugun) {
    secenek = secenek || {};
    return dergiler
      .filter((d) => d.endeksler && d.endeksler.includes("ESCI"))
      .filter((d) => !secenek.sadeceTurkiye || d.ulke === "Türkiye")
      .filter((d) => !secenek.apcsiz || !d.apc)
      .filter((d) => alanUyar(d, secenek.alan || (secenek.calisma || {}).alan))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, konusuz(secenek.calisma), bugun) }))
      .sort(tarihSirala);
  }

  const CEYREK_SIRA = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

  /*
   * Yurtdışı dergiler: Q1, Q2 veya SSCI'da taranan dergileri döndürür.
   * secenek.ceyrekler: ["Q1","Q2"] (varsayılan), secenek.ssci: SSCI dergilerini de dahil et (varsayılan true),
   * secenek.sadeceSsci: yalnızca SSCI.
   */
  function yurtdisiSec(dergiler, secenek, bugun) {
    secenek = Object.assign({ ceyrekler: ["Q1", "Q2"], ssci: true, sadeceSsci: false }, secenek);
    return dergiler
      .filter((d) => d.ulke !== "Türkiye" || secenek.turkiyeDahil)
      .filter((d) => {
        const ssci = (d.endeksler || []).includes("SSCI");
        if (secenek.sadeceSsci) return ssci;
        return secenek.ceyrekler.includes(d.ceyrek) || (secenek.ssci && ssci);
      })
      .filter((d) => alanUyar(d, secenek.alan || (secenek.calisma || {}).alan))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, konusuz(secenek.calisma), bugun) }))
      .sort((a, b) => uygunOnce(a, b) || (CEYREK_SIRA[a.ceyrek] || 9) - (CEYREK_SIRA[b.ceyrek] || 9) || tarihSirala(a, b));
  }

  return {
    CALISMA_TIPLERI,
    DOLULUK_SINIR_YILI,
    ayAyristir,
    ayBicimle,
    ortalamaToplamGun,
    tahminiYayinTarihi,
    doluMu,
    frekansUygunMu,
    uygunlukDegerlendir,
    alanUyar,
    sadelestir,
    konuTerimleri,
    konuEslesme,
    makaleyeGoreOner,
    sansTahmini,
    trDizinListele,
    esciDergileri,
    yurtdisiSec,
  };
});
