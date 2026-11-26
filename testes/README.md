# Testes automáticos

Rodam o aplicativo inteiro num Chrome de verdade, sem precisar do Google:

- `montar.py` junta o `Index.html` com os outros `.html` (como o Apps Script faz) e gera `index.html` (navegador) e `servidor.html` (todos os `.gs`).
- `mock_gas.js` imita o Apps Script: planilhas (guardadas no `localStorage`), cache, propriedades, travas e utilitários.
- `compat.js` adapta chamadas antigas usadas por alguns testes.
- `teste_*.py` abrem o app com o Playwright, clicam pelas telas e conferem os resultados (também tiram fotos em subpastas).

```bash
bash rodar_todos.sh          # todos
python3 montar.py ../apps-script && python3 -m http.server 8765 &   # um só:
python3 teste_modo_teste.py
```

| Arquivo | O que confere |
|---|---|
| `teste_sistema.py` | Primeiro acesso, empresas, convites, login, celular |
| `teste_cobrancas.py` | Cobranças, ciclos, pagamentos parciais, extrato |
| `teste_v20.py` | Dashboard, permissões de administradores, convites, descontos |
| `teste_modo_teste.py` | Modo teste: dados fictícios, isolamento da planilha real, descarte |
| `teste_v25.py` | Cardápio de segunda a domingo, dias fechados, prazo extra de 30 minutos e relatório financeiro por empresa |
| `teste_v26.py` | Modo teste: "Ver como empresa" (entrar, telas da empresa, segurança, voltar, sair do teste) e versículo do dia no Início |
| `teste_v27.py` | "Manter conectado até o fim do dia": entrada vale só no dia, aba aberta e login salvo expiram à meia-noite, login salvo antigo recusado |
| `teste_v28.py` | Assinatura "Feito por Luis Guilherme Wermelinger" no login e no Início (visível, inclusive no celular) |
| `teste_v29.py` | Logo do restaurante: login, primeiro acesso, menu lateral (símbolo + nome) e cabeçalho das impressões/PDF |
| `teste_v30.py` | Cores da logo (dourado/terra, sucesso verde) e login em dois lados: layout, contraste, ícones nos campos, escuro e celular |
| `teste_periodo_versiculo.py` | Dashboard com datas escolhidas no calendário e versículo do dia no login |
| `teste_excluir_historico.py` / `teste_limpeza.py` | Exclusões do proprietário com histórico |
| `teste_tema.py` | Tema claro, escuro e automático |

A pasta `exploratorios/` tem roteiros mais antigos (pedidos, cardápio, funcionários, relatórios, várias abas, cache…). Eles não dão "passou/falhou": imprimem o que aconteceu e tiram fotos para conferência visual. Rode a partir da pasta `testes/`, com o servidor local ligado: `python3 exploratorios/teste_pedidos.py`.
