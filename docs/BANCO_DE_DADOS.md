# Banco de dados (Planilha Google)

Cada aba da planilha é uma tabela; a primeira linha tem os nomes das colunas. A estrutura oficial está em `ESTRUTURA`, no `apps-script/Config.gs` — a função `verificarEstrutura` cria o que faltar.

Identificadores são textos com prefixo + UUID (ex.: `EMP-…`, `PED-…`). Datas são gravadas como datas da planilha (fuso `America/Sao_Paulo`).

O **modo teste** usa uma segunda planilha com exatamente a mesma estrutura ("TESTE - Sistema de Quentinhas"), criada automaticamente no Drive do proprietário; o ID dela fica nas Propriedades do script (`PLANILHA_TESTE_ID`).

## EMPRESAS

Empresas clientes, ciclo de cobrança e configurações próprias (JSON).

| # | Coluna |
|---|---|
| 1 | `empresa_id` |
| 2 | `nome_empresa` |
| 3 | `cnpj` |
| 4 | `telefone` |
| 5 | `email` |
| 6 | `endereco` |
| 7 | `status` |
| 8 | `data_cadastro` |
| 9 | `ciclo_cobranca` |
| 10 | `dias_vencimento` |
| 11 | `configuracoes` |

## USUARIOS

Logins: proprietário/administradores (`perfil` = admin) e o responsável de cada empresa (`perfil` = empresa). `senha_hash` usa sal + SHA-256 repetido. `permissoes` (JSON) define abas e funções de cada administrador.

| # | Coluna |
|---|---|
| 1 | `usuario_id` |
| 2 | `empresa_id` |
| 3 | `nome` |
| 4 | `email` |
| 5 | `senha_hash` |
| 6 | `perfil` |
| 7 | `status` |
| 8 | `data_cadastro` |
| 9 | `login` |
| 10 | `permissoes` |

## FUNCIONARIOS

Funcionários das empresas (sem login próprio).

| # | Coluna |
|---|---|
| 1 | `funcionario_id` |
| 2 | `empresa_id` |
| 3 | `nome` |
| 4 | `matricula` |
| 5 | `setor` |
| 6 | `telefone` |
| 7 | `pode_alterar_quentinha` |
| 8 | `status` |

## CARDAPIOS

Um cardápio por dia (segunda a domingo). Listas (proteínas, saladas…) ficam uma por linha dentro da célula. `fechado`: SIM = dia fechado (feriado, folga), NAO = aberto, vazio = padrão (sábado e domingo fechados, os outros dias abertos).

| # | Coluna |
|---|---|
| 1 | `cardapio_id` |
| 2 | `data` |
| 3 | `dia_semana` |
| 4 | `acompanhamentos` |
| 5 | `saladas` |
| 6 | `guarnicoes` |
| 7 | `proteinas` |
| 8 | `opcao_extra` |
| 9 | `observacoes` |
| 10 | `status` |
| 11 | `fechado` |

## PEDIDOS

Um pedido por empresa e dia (ou de cliente sem cadastro). `valor_total` fica congelado com o preço do momento.

| # | Coluna |
|---|---|
| 1 | `pedido_id` |
| 2 | `empresa_id` |
| 3 | `data_pedido` |
| 4 | `data_entrega` |
| 5 | `usuario_id` |
| 6 | `status` |
| 7 | `observacoes` |
| 8 | `valor_total` |
| 9 | `quantidade_total` |
| 10 | `atualizado_em` |
| 11 | `confirmado_em` |
| 12 | `resposta_restaurante` |
| 13 | `cliente_nome` |
| 14 | `cliente_telefone` |
| 15 | `cobranca_id` |

## ITENS_PEDIDOS

Uma linha por quentinha do pedido, com preço unitário, proteína, extra e itens removidos.

| # | Coluna |
|---|---|
| 1 | `item_id` |
| 2 | `pedido_id` |
| 3 | `empresa_id` |
| 4 | `funcionario_id` |
| 5 | `cardapio_id` |
| 6 | `tipo_quentinha` |
| 7 | `quantidade` |
| 8 | `preco_unitario` |
| 9 | `subtotal` |
| 10 | `observacoes` |
| 11 | `nome` |
| 12 | `proteina` |
| 13 | `opcao_extra` |
| 14 | `itens_removidos` |

## COBRANCAS

Cobranças por período. Valor líquido = `valor_total` − `desconto`; o status (ABERTA, PARCIAL, PAGA, CANCELADA) segue o valor pago.

| # | Coluna |
|---|---|
| 1 | `cobranca_id` |
| 2 | `empresa_id` |
| 3 | `periodo_inicio` |
| 4 | `periodo_fim` |
| 5 | `data_emissao` |
| 6 | `data_vencimento` |
| 7 | `valor_total` |
| 8 | `status` |
| 9 | `observacoes` |
| 10 | `numero` |
| 11 | `quantidade_total` |
| 12 | `quantidade_pedidos` |
| 13 | `valor_pago` |
| 14 | `criado_por` |
| 15 | `atualizado_em` |
| 16 | `motivo_cancelamento` |
| 17 | `desconto` |
| 18 | `motivo_desconto` |

## PAGAMENTOS

Pagamentos registrados em cada cobrança (aceita pagamento parcial).

| # | Coluna |
|---|---|
| 1 | `pagamento_id` |
| 2 | `cobranca_id` |
| 3 | `empresa_id` |
| 4 | `data_pagamento` |
| 5 | `valor_pago` |
| 6 | `forma_pagamento` |
| 7 | `comprovante` |
| 8 | `observacoes` |
| 9 | `registrado_por` |
| 10 | `registrado_em` |

## LOGS

Histórico de operações.

| # | Coluna |
|---|---|
| 1 | `log_id` |
| 2 | `usuario_id` |
| 3 | `empresa_id` |
| 4 | `acao` |
| 5 | `descricao` |
| 6 | `data_hora` |

## CONFIG

Configurações gerais (chave/valor): horário limite, e-mail do proprietário, dados de pagamento, padrões, numeração de cobranças.

| # | Coluna |
|---|---|
| 1 | `chave` |
| 2 | `valor` |
| 3 | `descricao` |

## PRECOS

Preços por empresa com vigência (`data_inicio`/`data_fim`). Não pode haver períodos sobrepostos.

| # | Coluna |
|---|---|
| 1 | `preco_id` |
| 2 | `empresa_id` |
| 3 | `tipo_quentinha` |
| 4 | `valor_unitario` |
| 5 | `data_inicio` |
| 6 | `data_fim` |
| 7 | `status` |

## EMPRESAS_EXCLUIDAS

Cópia das empresas excluídas pelo proprietário (para os relatórios continuarem mostrando o nome).

| # | Coluna |
|---|---|
| 1 | `empresa_id` |
| 2 | `nome_empresa` |
| 3 | `cnpj` |
| 4 | `telefone` |
| 5 | `email` |
| 6 | `endereco` |
| 7 | `excluida_em` |
| 8 | `excluida_por` |
| 9 | `funcionarios` |
| 10 | `resumo` |

## FUNCIONARIOS_EXCLUIDOS

Cópia dos funcionários excluídos pelo proprietário.

| # | Coluna |
|---|---|
| 1 | `funcionario_id` |
| 2 | `empresa_id` |
| 3 | `nome` |
| 4 | `matricula` |
| 5 | `setor` |
| 6 | `excluido_em` |
| 7 | `excluido_por` |
| 8 | `quentinhas` |

## PRAZOS_EXTRAS

Pedidos de prazo extra: depois do horário limite, a empresa pede mais tempo; se o restaurante liberar, ela tem 30 minutos (a partir da liberação) para enviar ou alterar o pedido daquele dia. `status`: PENDENTE, LIBERADO ou RECUSADO.

| # | Coluna |
|---|---|
| 1 | `solicitacao_id` |
| 2 | `empresa_id` |
| 3 | `data` |
| 4 | `solicitado_em` |
| 5 | `solicitado_por` |
| 6 | `mensagem` |
| 7 | `status` |
| 8 | `respondido_em` |
| 9 | `respondido_por` |
| 10 | `liberado_ate` |
| 11 | `resposta` |
