# Plano: versão independente do Google (etapa 2)

Hoje o sistema depende de três coisas do Google: o **Apps Script** (servidor), a **Planilha** (banco de dados) e o **App da Web** (endereço público). Este documento descreve como levar o mesmo sistema para uma hospedagem própria, aos poucos e sem parar o que já funciona.

## Por que (e quando) fazer

Vale a pena quando aparecer um destes sinais:

- Muitas empresas pedindo perto do horário limite (o Apps Script grava uma coisa por vez e tem limite de execuções simultâneas).
- A planilha ficando grande (relatórios e Dashboard mais lentos).
- Necessidade de domínio próprio (ex.: `pedidos.temperodemae.com.br`), sem o aviso "Este aplicativo foi criado por um usuário do Google Apps Script".
- Não depender de uma conta Gmail pessoal.

Enquanto nada disso acontecer, a versão atual atende bem — este plano é para estar pronto quando precisar.

## Arquitetura proposta

```
Navegador (mesmas telas de hoje)
   │  fetch('/api/<função>', { argumentos })
   ▼
Servidor Node.js (Express)
   │  as mesmas regras de negócio dos arquivos .gs
   ▼
Banco PostgreSQL  (uma tabela para cada aba da planilha)
```

| Peça | Escolha sugerida | Por quê |
|---|---|---|
| Servidor | Node.js 20 + Express | O código atual já é JavaScript; a maior parte das regras é reaproveitada quase sem mudança |
| Banco | PostgreSQL | Gratuito, confiável, transações (substitui as travas), fácil de achar hospedagem e backup |
| Hospedagem | Render, Railway ou uma VPS | Render/Railway: publicação automática a cada envio ao GitHub; plano inicial barato ou gratuito |
| Sessões | Cookie seguro (`httpOnly`) | Mais seguro que o token guardado no navegador |

## O que já ajuda na migração

- **Telas**: todas as chamadas ao servidor passam por uma única função (`api(nome, ...argumentos)` no `Script.html`). Trocar `google.script.run` por `fetch` é uma mudança em um lugar só. A leitura do link de convite (`google.script.url`, também no `Script.html`) já tem alternativa para fora do Google e vira `location.search`.
- **Acesso aos dados**: todas as leituras e gravações passam por poucas funções (`lerAba_`, `comBloqueio_`, `abrirPlanilha_` no `Config.gs`). Elas viram uma camada de banco de dados.
- **Testes**: a pasta `testes/` já roda o sistema inteiro fora do Google, com uma imitação do Apps Script. É a prova de que o código funciona sem o Google e serve para conferir a versão nova.

## Equivalências (Google → hospedagem própria)

| Hoje (Apps Script) | Na versão independente |
|---|---|
| `SpreadsheetApp` (abas e linhas) | Tabelas no PostgreSQL (mesmas colunas de `docs/BANCO_DE_DADOS.md`) |
| `LockService` (trava) | Transações do banco |
| `CacheService` (sessões, cache) | Tabela de sessões ou Redis; cache em memória |
| `PropertiesService` (convites, login salvo) | Tabelas `convites` e `logins_salvos` |
| `HtmlService` + `incluir()` | Página estática montada na publicação (como o `testes/montar.py` já faz) |
| `Utilities.getUuid()` / `computeDigest` | `crypto.randomUUID()` / `crypto` do Node (senhas atuais continuam válidas) |
| `Session.getScriptTimeZone()` | Variável `TZ=America/Sao_Paulo` |
| Endereço do App da Web | Domínio próprio, com HTTPS |
| Modo teste (planilha separada) | Segundo banco (ou esquema) só para testes |

## Etapas

1. **Esqueleto** — pasta `servidor/` com Express, ligação ao banco, criação das tabelas e uma rota `/api/:funcao` que chama as funções existentes.
2. **Camada de dados** — reescrever `lerAba_`/gravações para usar o banco, mantendo o mesmo formato de retorno; o resto das regras continua igual.
3. **Telas** — trocar `google.script.run` por `fetch` e servir os `.html` montados.
4. **Rodar os testes** da pasta `testes/` contra o servidor novo até tudo passar.
5. **Migração dos dados** — script que lê a planilha (exportada) e grava no banco. Ensaiar com uma cópia.
6. **Período em paralelo** — publicar num endereço de teste, usar com uma empresa piloto.
7. **Virada** — num fim de semana: congelar a planilha, migrar, apontar as empresas para o endereço novo. A planilha fica como backup.

## Decisões a tomar antes de começar

- Hospedagem (Render, Railway ou VPS) e quem paga.
- Domínio (ex.: `temperodemae.com.br`).
- Se a planilha continua existindo como relatório (exportação diária) ou só como backup.

## Custo estimado

- Hospedagem do servidor: de R$ 0 (planos gratuitos, com limitações) a ~R$ 40/mês.
- Banco PostgreSQL gerenciado: de R$ 0 a ~R$ 50/mês.
- Domínio `.com.br`: ~R$ 40/ano.
