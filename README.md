# Tempero de Mãe — Sistema de Quentinhas

Sistema web para um restaurante administrar os pedidos de quentinhas das empresas que atende: cadastro de empresas e funcionários, preços por empresa, cardápio semanal, pedidos diários, cobranças com pagamentos e descontos, relatórios e dashboard.

Hoje ele roda no **Google Apps Script** (servidor) com uma **Planilha Google** como banco de dados, publicado como *App da Web*. Funciona no computador e no celular.

> Este repositório guarda o código-fonte e permite publicar o sistema no Apps Script direto daqui (com o `clasp`). O plano para uma versão que roda fora do Google, em hospedagem própria, está em [`docs/PLANO_VERSAO_INDEPENDENTE.md`](docs/PLANO_VERSAO_INDEPENDENTE.md).

## O que o sistema faz

| Área | Recursos |
|---|---|
| Acesso | Login por usuário e senha, "manter conectado", convites por link para empresas e administradores, troca de senha |
| Restaurante | Dashboard com gráficos, empresas, preços com histórico e vigência, funcionários, cardápio semanal, pedidos ao vivo, cobranças, relatórios (Excel e PDF) |
| Empresas | Portal próprio: funcionários, pedido do dia, cardápio, cobranças e extrato |
| Proprietário | Escolhe as abas e funções de cada administrador, exclusões com histórico preservado, **modo teste** com dados fictícios |
| Aparência | Tema claro, escuro ou automático |

## Estrutura do repositório

```
apps-script/        Código que roda no Google Apps Script (é o que o clasp envia)
  appsscript.json   Manifesto: fuso, V8 e configuração do App da Web
  *.gs              Servidor (regras de negócio, acesso à planilha)
  Index.html        Página única do aplicativo (inclui os outros .html)
  Script*.html      JavaScript do navegador, por tela
  Estilos.html      CSS (claro e escuro)
docs/               Banco de dados, como publicar e plano da versão independente
testes/             Testes automáticos que rodam o sistema inteiro no Chrome
.github/workflows/  Testes a cada envio e publicação manual no Apps Script
```

## Arquivos do servidor

| Arquivo | Responsabilidade |
|---|---|
| `Config.gs` | Configuração, estrutura das abas, abertura do app, leitura/gravação com cache e trava |
| `Auth.gs` | Login, sessões, senhas, administradores |
| `Permissoes.gs` | Abas e funções liberadas para cada administrador |
| `Empresas.gs` / `Precos.gs` / `Funcionarios.gs` | Cadastros |
| `Cardapios.gs` / `Pedidos.gs` | Cardápio semanal e pedidos |
| `Cobrancas.gs` | Cobranças, pagamentos e descontos |
| `Relatorios.gs` / `Dashboard.gs` / `Painel.gs` | Relatórios, gráficos e tela inicial |
| `Sistema.gs` | Configurações gerais e convites |
| `Limpeza.gs` | Exclusões do proprietário (com histórico) |
| `ModoTeste.gs` | Modo teste do proprietário (planilha separada com dados fictícios) |

## Banco de dados

Planilha **SISTEMA DE QUENTINHAS - BANCO DE DADOS** (o ID está em `CONFIG.PLANILHA_ID`, no `Config.gs`). As abas e colunas estão descritas em [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md). A função `verificarEstrutura` (executada pelo editor) cria abas e colunas que estiverem faltando.

## Publicar

Resumo (detalhes em [`docs/PUBLICAR.md`](docs/PUBLICAR.md)):

```bash
npm install
npx clasp login          # uma vez, com a conta Google dona do projeto
npm run enviar           # envia o código ao Apps Script
npm run publicar -- "Descrição da versão"   # nova versão no MESMO endereço do app
```

Ou pelo GitHub: aba **Actions → Publicar no Apps Script → Run workflow** (depois de configurar o segredo `CLASPRC_JSON`).

## Testes

```bash
pip install playwright && python -m playwright install chromium   # uma vez
npm run testes
```

Os testes montam o aplicativo numa página local com uma imitação do Apps Script e da planilha (`testes/mock_gas.js`), abrem no Chrome e conferem as telas e as regras (login, pedidos, cobranças, permissões, modo teste, tema escuro, celular…). Eles também rodam sozinhos no GitHub a cada envio.

## Regras de negócio importantes

- O restaurante controla os preços; cada empresa pode ter um acordo diferente, com início e fim de vigência.
- O pedido guarda o preço do momento da compra; reajustes não mudam pedidos antigos.
- Cada empresa só vê os próprios dados (conferido no servidor em toda chamada).
- O horário limite do pedido do dia é configurável.
- Exclusões do proprietário preservam o histórico nos relatórios.
