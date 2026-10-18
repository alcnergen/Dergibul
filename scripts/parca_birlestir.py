#!/usr/bin/env python3
"""
Paralel ölçüm parçalarını (trdizin_guncelle.py --parca i/n çıktıları) tek data/trdizin.json'da birleştirir.

Her dergi için onu ölçen parçanın kaydı alınır. Bir parça başarısız olduysa o parçanın dergileri
için önceki data/trdizin.json kaydı korunur. Makale önbellekleri birleştirilir.

Örnek:  python3 scripts/parca_birlestir.py parcalar/
"""

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import json_oku, json_yaz  # noqa: E402
from alan import alan_belirle  # noqa: E402
from trdizin_guncelle import wos_etiketle  # noqa: E402

KOK = Path(__file__).resolve().parent.parent


def birlestir(parcalar, onceki):
    """parcalar: [trdizin.json biçiminde sözlük]; onceki: önceki trdizin.json ya da {}."""
    onceki_dizin = {d["id"]: d for d in (onceki or {}).get("dergiler", [])
                    if not (onceki or {}).get("meta", {}).get("ornek")}
    sonuc, sira = {}, []
    for p in parcalar:
        for d in p.get("dergiler", []):
            if d["id"] not in sonuc:
                sira.append(d["id"])
                sonuc[d["id"]] = None
            if d.get("olcumParca"):  # bu parça ölçtü: en güncel kayıt bu
                sonuc[d["id"]] = d
    for k in sira:
        if sonuc[k] is None:  # ölçen parça başarısız: önceki kaydı, o da yoksa listeden geleni kullan
            sonuc[k] = onceki_dizin.get(k) or next(d for p in parcalar for d in p["dergiler"] if d["id"] == k)
    return [sonuc[k] for k in sira]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("klasor", help="parca-*.json ve onbellek-*.json dosyalarının bulunduğu klasör")
    ap.add_argument("--cikti", default=KOK / "data/trdizin.json")
    ap.add_argument("--onbellek", default=KOK / "data/kaynak/makale_onbellek.json")
    args = ap.parse_args()

    klasor = Path(args.klasor)
    parcalar = [json_oku(p, {}) for p in sorted(klasor.rglob("parca-*.json"))]
    parcalar = [p for p in parcalar if p.get("dergiler")]
    if not parcalar:
        sys.exit("Birleştirilecek parça yok; mevcut veri korunuyor.")
    dergiler = birlestir(parcalar, json_oku(args.cikti, {}))
    for d in dergiler:
        d.pop("olcumParca", None)
        # Eşleme tablosu iyileştikçe alanlar mevcut konulardan yeniden türetilir (elle düzeltme varsa korunur)
        if d.get("konular") and not d.get("alanElle"):
            d.update(alan_belirle(d["ad"], d["konular"], d.get("veritabanlari") or []))
    wos_etiketle(dergiler, json_oku(KOK / "data/uluslararasi.json"))

    onbellek = json_oku(args.onbellek, {}) or {}
    for p in sorted(klasor.rglob("onbellek-*.json")):
        onbellek.update(json_oku(p, {}) or {})
    json_yaz(args.onbellek, onbellek)

    json_yaz(args.cikti, {
        "meta": {
            "ornek": False,
            "guncelleme": date.today().isoformat(),
            "kaynak": "TR Dizin API + DergiPark + Crossref",
            "dergiSayisi": len(dergiler),
            "olculenDergi": sum(1 for d in dergiler if d.get("olcumMakaleSayisi")),
            "parcaSayisi": len(parcalar),
        },
        "dergiler": dergiler,
    })
    print(f"{len(parcalar)} parça, {len(dergiler)} dergi, {len(onbellek)} makale önbellekte -> {args.cikti}")


if __name__ == "__main__":
    main()
