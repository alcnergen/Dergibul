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
      konu = konuEslesme(dergi, calisma.konu, calisma.konuAnlam);
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

  // Başka alanlarda farklı anlama gelen ifadeler: başlıkta bu bağlam varsa eşleşme sayılmaz
  // ("cell migration" hücre göçüdür, "data migration" veri taşımadır)
  const BAGLAM_DISI = {
    migration: /\b(cell|cells|cellular|tumou?r|cancer|metasta|stent|implant|neutrophil|leukocyte|macrophage|data|database|cloud|server|software|larva|fish|bird|ion|electro|particle|seed|hormone)/,
    migrant: /\b(cell|cells|larva|fish|bird)/,
    goc: /\b(hucre|tumor|kanser|kus|balik)/,
  };

  function terimleriGenislet(terim) {
    const t = sadelestir(terim);
    if (!t) return [];
    const grup = KONU_ESANLAM.find((g) => g.some((x) => x === t || (t.length >= 4 && x.startsWith(t))));
    return [...new Set([t].concat(grup || []))];
  }

  // Kelime başı eşleşmesi: "goc" -> "goc", "gocun"; "asiri sag" -> "asiri sagci".
  // 3 harf ve altındaki ifadelere en çok 3 harflik ek izin verilir ("din" -> "dini", ama "dinamik" değil).
  function iceriyor(sadeMetin, ifade) {
    const disla = BAGLAM_DISI[ifade];
    if (disla && disla.test(sadeMetin)) return false;
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
  function konuEslesme(dergi, terimler, anlamEslesmeleri) {
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
    // Yapay zekâ ile anlamca yakın bulunan başlıklar (varsa): kelime eşleşmesi olmasa da konuya yakındır
    const anlam = anlamEslesmeleri && anlamEslesmeleri[dergi.id];
    if (anlam && anlam.makale > sonuc.makale) {
      sonuc.anlam = anlam.makale - sonuc.makale;
      sonuc.makale = anlam.makale;
      sonuc.ornek = sonuc.ornek || anlam.ornek;
    }
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
   * Derginin son makaleleri tek tek sorguyla karşılaştırılır: bir başlıkta sorgunun ne kadar çok ve ne kadar
   * ayırt edici (nadir) kelimesi birlikte geçiyorsa o makale o kadar benzerdir. Dergi puanı en benzer üç
   * makalenin puanından (1 + 1/2 + 1/4 ağırlıkla) ve anahtar kelime eşleşmelerinden oluşur.
   * Dönüş: [{ dergi, benzerlik (0-1, en iyiye göre), seviye, benzerBasliklar[] }] azalan sırada.
   */
  function makaleyeGoreOner(dergiler, metin, secenek) {
    secenek = Object.assign({ enFazla: 20 }, secenek);
    const sorgu = new Set(kokler(metin));
    konuTerimleri(metin).forEach((t) => terimleriGenislet(t).slice(1).forEach((e) => kokler(e).forEach((k) => sorgu.add(k))));
    if (!sorgu.size) return [];
    const adaylar = dergiler.filter(konuVerisiVar).map((d) => ({
      d,
      basliklar: (d.basliklar || []).map((b) => [b, new Set(kokler(b))]),
      anahtar: new Set((d.anahtarKelimeler || []).flatMap(kokler)),
    }));
    // Ayırt edicilik: kelime ne kadar az makale başlığında geçiyorsa o kadar değerli
    const df = new Map();
    let N = 0;
    adaylar.forEach((a) => a.basliklar.forEach(([, k]) => { N++; k.forEach((x) => { if (sorgu.has(x)) df.set(x, (df.get(x) || 0) + 1); }); }));
    const idf = (k) => Math.log((N + 1) / ((df.get(k) || 0) + 1));
    const sonuc = adaylar.map((a) => {
      const puanli = a.basliklar.map(([b, k]) => {
        let p = 0, adet = 0;
        sorgu.forEach((x) => { if (k.has(x)) { p += idf(x); adet++; } });
        return [b, adet >= 2 ? p * (1 + 0.25 * (adet - 2)) : p * 0.5];  // tek kelimelik eşleşme zayıf sayılır
      }).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]);
      let anahtarPuan = 0;
      sorgu.forEach((x) => { if (a.anahtar.has(x)) anahtarPuan += idf(x) * 0.3; });
      const puan = (puanli[0] ? puanli[0][1] : 0) + (puanli[1] ? puanli[1][1] / 2 : 0) + (puanli[2] ? puanli[2][1] / 4 : 0) + anahtarPuan;
      return { dergi: a.d, puan, benzerBasliklar: puanli.slice(0, 2).map((x) => x[0]) };
    }).filter((x) => x.puan > 0).sort((x, y) => y.puan - x.puan);
    const enYuksek = sonuc.length ? sonuc[0].puan : 1;
    sonuc.forEach((x) => {
      x.benzerlik = x.puan / enYuksek;
      x.seviye = x.benzerlik >= 0.7 && x.benzerBasliklar.length ? "Çok yüksek" : x.benzerlik >= 0.45 ? "Yüksek" : x.benzerlik >= 0.25 ? "Orta" : "Düşük";
      delete x.puan;
    });
    return sonuc.slice(0, secenek.enFazla);
  }

  /* ---------- Yapay zekâ ile anlam araması ----------
   * Yayın sırasında her derginin en yeni başlıkları çok dilli bir anlam modeliyle 384 boyutlu vektörlere
   * çevrilir (int8). Tarayıcı aynı modelle aramayı vektöre çevirir; kosinüs benzerliği başlık başına hesaplanır.
   * Böylece "mülteci entegrasyonu" araması "Suriyeli göçmenlerin toplumsal uyumu" başlığını da bulur.
   */
  // Eşikler canlı denemeyle ayarlandı (paraphrase-multilingual-MiniLM-L12-v2): cümle sorgularında ilgili
  // başlıklar 0,6-0,85, ilgisizler 0,35'in altında; tek kelimelik terimlerde ilgisiz başlıklar 0,48'e çıkabildiği
  // için konu kutusu eşiği daha yüksek tutulur.
  const ANLAM_ESIK = { cokYuksek: 0.65, yuksek: 0.55, orta: 0.45, konu: 0.55 };

  function anlamPaketi(ham, dergiler) {
    const ikili = typeof atob === "function" ? atob(ham.vektor) : Buffer.from(ham.vektor, "base64").toString("binary");
    const v = new Int8Array(ikili.length);
    for (let i = 0; i < ikili.length; i++) v[i] = (ikili.charCodeAt(i) << 24) >> 24;
    const yer = new Map();
    let bas = 0;
    ham.dergiler.forEach(([id, n]) => { yer.set(String(id), { bas, n }); bas += n; });
    const dizin = new Map((dergiler || []).map((d) => [String(d.id), d]));
    return { boyut: ham.boyut, v, yer, dizin, guncelleme: ham.guncelleme };
  }

  // Bir derginin başlıklarının sorgu vektörüne benzerlikleri: [[başlık sırası, benzerlik], ...] azalan
  function baslikBenzerlikleri(paket, id, q) {
    const y = paket.yer.get(String(id));
    if (!y) return [];
    const d = paket.boyut, sonuc = [];
    for (let i = 0; i < y.n; i++) {
      let s = 0;
      const o = (y.bas + i) * d;
      for (let k = 0; k < d; k++) s += paket.v[o + k] * q[k];
      sonuc.push([i, s / 127]);
    }
    return sonuc.sort((a, b) => b[1] - a[1]);
  }

  function anlamSeviyesi(enIyi) {
    return enIyi >= ANLAM_ESIK.cokYuksek ? "Çok yüksek" : enIyi >= ANLAM_ESIK.yuksek ? "Yüksek" : enIyi >= ANLAM_ESIK.orta ? "Orta" : "Düşük";
  }

  /*
   * Makale metnine anlamca en yakın dergiler. q: normalize edilmiş sorgu vektörü (Float32Array).
   * Dergi puanı en benzer üç başlığın benzerliği (1 + 1/2 + 1/4 ağırlıkla).
   */
  function anlamselOner(dergiler, paket, q, secenek) {
    secenek = Object.assign({ enFazla: 20 }, secenek);
    return dergiler.map((d) => {
      const b = baslikBenzerlikleri(paket, d.id, q);
      if (!b.length) return null;
      const puan = b[0][1] + (b[1] ? b[1][1] / 2 : 0) + (b[2] ? b[2][1] / 4 : 0);
      return { dergi: d, benzerlik: b[0][1], puan, seviye: anlamSeviyesi(b[0][1]),
        benzerBasliklar: b.slice(0, 2).filter((x) => x[1] >= ANLAM_ESIK.orta).map((x) => d.basliklar[x[0]]) };
    }).filter(Boolean).sort((a, b) => b.puan - a.puan).slice(0, secenek.enFazla);
  }

  /*
   * Yapay zekâ ve kelime benzerliğini birleştirir: anlam puanı esastır, aynı kelimeleri paylaşan başlıkları olan
   * dergiler bir miktar öne çıkar. İki listeden birinde olmayan dergi de sonuca girebilir.
   */
  function birlesikOner(anlamListesi, kelimeListesi, enFazla) {
    const birlesik = new Map();
    anlamListesi.forEach((x) => birlesik.set(x.dergi.id, Object.assign({}, x, { toplam: x.puan })));
    kelimeListesi.forEach((x) => {
      const var_ = birlesik.get(x.dergi.id);
      if (var_) {
        var_.toplam += 0.4 * x.benzerlik;
        if (!var_.benzerBasliklar.length) var_.benzerBasliklar = x.benzerBasliklar;
      } else birlesik.set(x.dergi.id, Object.assign({}, x, { toplam: 0.4 * x.benzerlik, seviye: x.seviye }));
    });
    return [...birlesik.values()].sort((a, b) => b.toplam - a.toplam).slice(0, enFazla || 20);
  }

  /*
   * Konu kutusundaki terimlere anlamca yakın başlıklar: { dergiId: { makale, ornek } }.
   * terimVektorleri: [Float32Array, ...]; eşik ANLAM_ESIK.konu.
   */
  function anlamKonuEslesmeleri(dergiler, paket, terimVektorleri, esik) {
    esik = esik || ANLAM_ESIK.konu;
    const sonuc = {};
    dergiler.forEach((d) => {
      const eslesen = new Map();
      terimVektorleri.forEach((q) => baslikBenzerlikleri(paket, d.id, q).forEach(([i, s]) => {
        if (s >= esik && (!eslesen.has(i) || eslesen.get(i) < s)) eslesen.set(i, s);
      }));
      if (eslesen.size) {
        const enIyi = [...eslesen.entries()].sort((a, b) => b[1] - a[1])[0][0];
        sonuc[d.id] = { makale: eslesen.size, ornek: d.basliklar[enIyi] };
      }
    });
    return sonuc;
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
    ANLAM_ESIK,
    anlamPaketi,
    anlamselOner,
    birlesikOner,
    anlamKonuEslesmeleri,
    trDizinListele,
    esciDergileri,
    yurtdisiSec,
  };
});
