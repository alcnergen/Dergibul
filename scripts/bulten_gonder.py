#!/usr/bin/env python3
"""
scripts/bulten.mjs'in hazırladığı bülteni SMTP ile gönderir.

Ortam değişkenleri (GitHub depo sırları):
  SMTP_SUNUCU, SMTP_PORT (varsayılan 587), SMTP_KULLANICI, SMTP_PAROLA,
  BULTEN_ALICI (virgülle birden çok adres), BULTEN_GONDEREN (yoksa SMTP_KULLANICI)

  python3 scripts/bulten_gonder.py bulten_klasoru
"""

import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path


def mesaj_olustur(klasor, gonderen, alicilar):
    k = Path(klasor)
    m = EmailMessage()
    m["Subject"] = k.joinpath("konu.txt").read_text(encoding="utf-8").strip()
    m["From"] = gonderen
    m["To"] = ", ".join(alicilar)
    m.set_content(k.joinpath("bulten.txt").read_text(encoding="utf-8"))
    m.add_alternative(k.joinpath("bulten.html").read_text(encoding="utf-8"), subtype="html")
    return m


def main():
    klasor = sys.argv[1]
    eksik = [a for a in ("SMTP_SUNUCU", "SMTP_KULLANICI", "SMTP_PAROLA", "BULTEN_ALICI") if not os.environ.get(a)]
    if eksik:
        sys.exit("Eksik sır: " + ", ".join(eksik) + ". GitHub: Settings → Secrets and variables → Actions.")
    alicilar = [a.strip() for a in os.environ["BULTEN_ALICI"].split(",") if a.strip()]
    gonderen = os.environ.get("BULTEN_GONDEREN") or os.environ["SMTP_KULLANICI"]
    m = mesaj_olustur(klasor, gonderen, alicilar)
    port = int(os.environ.get("SMTP_PORT") or 587)
    baglam = ssl.create_default_context()
    if port == 465:
        sunucu = smtplib.SMTP_SSL(os.environ["SMTP_SUNUCU"], port, context=baglam, timeout=60)
    else:
        sunucu = smtplib.SMTP(os.environ["SMTP_SUNUCU"], port, timeout=60)
        sunucu.starttls(context=baglam)
    with sunucu:
        sunucu.login(os.environ["SMTP_KULLANICI"], os.environ["SMTP_PAROLA"])
        sunucu.send_message(m)
    print(f"Bülten gönderildi: {len(alicilar)} alıcı")


if __name__ == "__main__":
    main()
