#!/bin/sh
# Confere cada migração contra o md5 do que a BASE diz que aplicou.
# `$(cat)` come as quebras finais dos dois lados, então o arquivo pode terminar
# com newline (como todo arquivo de texto deve) sem a conferência reclamar.
cd "$(dirname "$0")" || exit 1
ok=0; falta=0; mau=0
while read -r md5 arq; do
  [ -z "$arq" ] && continue
  if [ ! -f "migrations/$arq" ]; then printf '  FALTA  %s\n' "$arq"; falta=$((falta+1)); continue; fi
  got=$(printf '%s' "$(cat "migrations/$arq")" | md5sum | cut -d' ' -f1)
  if [ "$got" = "$md5" ]; then ok=$((ok+1))
  else printf '  DIFERE %s\n     esperado %s\n     obtido   %s\n' "$arq" "$md5" "$got"; mau=$((mau+1)); fi
done < MANIFESTO.md5
printf '\n%d conferem, %d faltam, %d diferem\n' "$ok" "$falta" "$mau"
[ "$falta" -eq 0 ] && [ "$mau" -eq 0 ]
