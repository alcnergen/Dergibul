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
    if (calisma.alan && dergi.alanlar && dergi.alanlar.length && !dergi.alanlar.includes(calisma.alan)) {
      engeller.push("Alan uyuşmuyor");
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
    };
  }

  /*
   * TR Dizin listesi: varsayılan olarak yılda 3-4 sayı çıkaran ve 2028 öncesinde
   * boş sayısı olan dergileri, en erken tahmini yayın tarihine göre sıralar.
   */
  function trDizinListele(dergiler, secenek, bugun) {
    secenek = Object.assign({ minSayi: 3, maksSayi: 4, doluGizle: true, sadeceUygun: false, calisma: {} }, secenek);
    bugun = bugun || new Date();
    return dergiler
      .filter((d) => !secenek.minSayi || frekansUygunMu(d, secenek.minSayi, secenek.maksSayi))
      .filter((d) => !secenek.doluGizle || !doluMu(d))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, secenek.calisma, bugun) }))
      .filter((d) => !secenek.sadeceUygun || d.degerlendirme.uygun)
      .sort(tarihSirala);
  }

  function tarihSirala(a, b) {
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
  function esciDergileri(dergiler, secenek, bugun) {
    secenek = secenek || {};
    return dergiler
      .filter((d) => d.endeksler && d.endeksler.includes("ESCI"))
      .filter((d) => !secenek.sadeceTurkiye || d.ulke === "Türkiye")
      .filter((d) => !secenek.apcsiz || !d.apc)
      .filter((d) => !secenek.alan || (d.alanlar || []).includes(secenek.alan))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, secenek.calisma || {}, bugun) }))
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
      .filter((d) => !secenek.alan || (d.alanlar || []).includes(secenek.alan))
      .map((d) => Object.assign({}, d, { degerlendirme: uygunlukDegerlendir(d, secenek.calisma || {}, bugun) }))
      .sort((a, b) => (CEYREK_SIRA[a.ceyrek] || 9) - (CEYREK_SIRA[b.ceyrek] || 9) || tarihSirala(a, b));
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
    trDizinListele,
    esciDergileri,
    yurtdisiSec,
  };
});
