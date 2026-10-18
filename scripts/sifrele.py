#!/usr/bin/env python3
"""
Veri dosyalarını parolayla şifreler / çözer.

Depo herkese açık olduğu için düz JSON yerine yalnızca şifreli kopyalar (*.enc.json) saklanır ve
yayınlanır. Site, girilen paroladan anahtarı tarayıcıda türetip veriyi orada çözer.

Biçim: gzip'lenmiş JSON → AES-256-GCM; anahtar PBKDF2-HMAC-SHA256(parola, tuz, 310000).
Parola DERGIBUL_PAROLA ortam değişkeninden okunur (GitHub'da depo sırrı). Parola değiştirildiyse
eski parola ESKI_PAROLA'ya konur: çözerken önce yeni, olmazsa eski parola denenir; şifreleme hep yenisiyle.

Örnek:
  DERGIBUL_PAROLA=... python3 scripts/sifrele.py sifrele   # düz dosyalar -> *.enc.json
  DERGIBUL_PAROLA=... python3 scripts/sifrele.py coz       # *.enc.json -> düz dosyalar
"""

import argparse
import base64
import gzip
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

KOK = Path(__file__).resolve().parent.parent
DOSYALAR = ["data/trdizin.json", "data/uluslararasi.json", "data/kaynak/makale_onbellek.json"]
TEKRAR = 310_000


def sifreli_yol(duz):
    return Path(str(duz)[: -len(".json")] + ".enc.json")


def anahtar(parola, tuz, tekrar=TEKRAR):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=tuz, iterations=tekrar)
    return kdf.derive(parola.encode("utf-8"))


def sifrele(veri_bayt, parola):
    tuz, iv = os.urandom(16), os.urandom(12)
    sifreli = AESGCM(anahtar(parola, tuz)).encrypt(iv, gzip.compress(veri_bayt, mtime=0), None)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return {"v": 1, "kdf": "PBKDF2-SHA256", "tekrar": TEKRAR, "tuz": b64(tuz), "iv": b64(iv),
            "sikistirma": "gzip", "veri": b64(sifreli)}


def coz(paket, parola):
    b = lambda k: base64.b64decode(paket[k])  # noqa: E731
    acik = AESGCM(anahtar(parola, b("tuz"), paket["tekrar"])).decrypt(b("iv"), b("veri"), None)
    return gzip.decompress(acik) if paket.get("sikistirma") == "gzip" else acik


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("islem", choices=["sifrele", "coz"])
    ap.add_argument("dosyalar", nargs="*", help="düz JSON yolları (varsayılan: sitenin veri dosyaları)")
    ap.add_argument("--duz-sil", action="store_true", help="şifreledikten sonra düz dosyayı sil")
    ap.add_argument("--istege-bagli", action="store_true",
                    help="çözülemeyen dosyada durma, uyarı ver ve atla (ör. önbellek)")
    args = ap.parse_args()
    parola = os.environ.get("DERGIBUL_PAROLA", "")
    adaylar = [p for p in dict.fromkeys([parola, os.environ.get("ESKI_PAROLA", "")]) if p]
    hedefler = args.dosyalar or DOSYALAR
    if args.islem == "coz" and not args.dosyalar and not any(sifreli_yol(KOK / y).exists() for y in DOSYALAR):
        print("Şifreli veri yok; çözülecek bir şey yok.")
        return
    if not parola:
        sys.exit("DERGIBUL_PAROLA tanımlı değil. GitHub: Settings → Secrets and variables → Actions → "
                 "New repository secret.")
    if len(parola) < 8:
        print("::warning::DERGIBUL_PAROLA 8 karakterden kısa; şifreli veri deneme yoluyla daha kolay açılabilir.")
    for yol in hedefler:
        duz = Path(yol) if args.dosyalar else KOK / yol
        if args.islem == "coz" and str(duz).endswith(".enc.json"):
            duz = Path(str(duz)[: -len(".enc.json")] + ".json")
        enc = sifreli_yol(duz)
        if args.islem == "sifrele" and duz.exists():
            enc.write_text(json.dumps(sifrele(duz.read_bytes(), parola)) + "\n", encoding="utf-8")
            print(f"şifrelendi: {duz.name} -> {enc.name}")
            if args.duz_sil:
                duz.unlink()
        elif args.islem == "coz" and enc.exists():
            paket = json.loads(enc.read_text(encoding="utf-8"))
            for sira, aday in enumerate(adaylar):
                try:
                    duz.write_bytes(coz(paket, aday))
                except Exception:
                    continue
                print(f"çözüldü: {enc.name} -> {duz.name}" + (" (eski parolayla)" if sira else ""))
                break
            else:
                mesaj = (f"{enc.name} çözülemedi: parola yanlış ya da dosya bozuk. Parola değiştirildiyse eski "
                         "parolayı ESKI_PAROLA sırrına ekleyin.")
                if not args.istege_bagli:
                    sys.exit(mesaj)
                print(f"::warning::{mesaj} Atlandı.")


if __name__ == "__main__":
    main()
