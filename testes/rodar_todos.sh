#!/usr/bin/env bash
# Roda todos os testes automáticos do sistema num navegador (Chrome),
# usando uma imitação do Google Apps Script e da planilha (mock_gas.js).
# Uso: cd testes && bash rodar_todos.sh
set -u
cd "$(dirname "$0")"

python3 montar.py ../apps-script >/dev/null

# Servidor local para as páginas de teste
python3 -m http.server 8765 >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
sleep 1

FALHAS=0
rodar() {
  saida=$(timeout 900 python3 "$1" 2>&1)
  problemas=$(echo "$saida" | grep -E "^FALHA|PAGEERROR|Traceback" || true)
}

for t in teste_*.py; do
  rodar "$t"
  if [ -n "$problemas" ]; then
    # Os testes usam tempos de espera; uma falha isolada pode ser lentidão.
    # Repete uma vez antes de considerar erro.
    primeira="$saida"
    rodar "$t"
    if [ -n "$problemas" ]; then
      echo "✗ $t"; echo "$saida" | grep -v "^OK" | tail -25
      FALHAS=$((FALHAS + 1))
      continue
    fi
    echo "✓ $t ($(echo "$saida" | grep -c '^OK') verificações, passou na 2ª tentativa)"
    echo "$primeira" | grep -E "^FALHA|PAGEERROR|Traceback|Error" | head -5 | sed 's/^/    1ª tentativa: /'
    continue
  fi
  echo "✓ $t ($(echo "$saida" | grep -c '^OK') verificações)"
done

echo
if [ $FALHAS -gt 0 ]; then echo "$FALHAS arquivo(s) de teste com falha"; exit 1; fi
echo "Todos os testes passaram"
