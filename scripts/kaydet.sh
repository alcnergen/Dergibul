#!/usr/bin/env bash
# Güncellenen veriyi depoya kaydeder. DERGIBUL_PAROLA tanımlıysa yalnızca şifreli kopyalar
# (*.enc.json) saklanır; tanımlı değilse veri eskisi gibi düz JSON olarak kaydedilir.
# Kullanım: scripts/kaydet.sh "commit mesajı"
set -euo pipefail
MESAJ="${1:-Veri güncellemesi $(date -u +%F)}"
DUZ="data/trdizin.json data/uluslararasi.json data/kaynak/makale_onbellek.json"

git config user.name "dergibul-bot"
git config user.email "dergibul-bot@users.noreply.github.com"
if [ -n "${DERGIBUL_PAROLA:-}" ]; then
  python3 scripts/sifrele.py sifrele
  # Düz veri depoda tutulmaz (.gitignore); daha önce izleniyorsa izlemeyi bırak
  git rm -q --cached --ignore-unmatch $DUZ
  git add -A data
else
  echo "::warning::DERGIBUL_PAROLA tanımlı değil; veri şifrelenmeden kaydediliyor."
  for f in $DUZ; do if [ -f "$f" ]; then git add -f "$f"; fi; done
fi
git diff --cached --quiet && { echo "Değişiklik yok."; exit 0; }
git commit -q -m "$MESAJ"
git pull -q --rebase origin main
git push origin HEAD:main
