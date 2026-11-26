# Como publicar o sistema a partir deste repositório

O código em `apps-script/` é enviado ao projeto do Apps Script com o **clasp** (ferramenta oficial do Google). Depois disso, uma nova **versão** é publicada no mesmo App da Web, então o endereço usado pelas empresas não muda.

- Projeto do Apps Script: `1kqeSQxoFlw3qV4bEhy3W3VqhR26jWki39oO9bnrVfklAmw-j6yX3Mjkx` (em `.clasp.json`)
- Implantação (App da Web): `AKfycbzjFyTv6So_5jGqcm1yUgIzOG_3Z1fg2RgHpFeXkmjxSgXUWXMlPXIz-bwW3-jAkNO0zQ`
- Endereço: https://script.google.com/macros/s/AKfycbzjFyTv6So_5jGqcm1yUgIzOG_3Z1fg2RgHpFeXkmjxSgXUWXMlPXIz-bwW3-jAkNO0zQ/exec
- Versão no ar: **24** (26/11/2026)

> ⚠️ O `clasp push` **substitui todos os arquivos** do projeto pelo que está em `apps-script/`. Mudanças feitas direto no editor do Google e não trazidas para cá serão perdidas. Escolha um lugar para editar (de preferência aqui) — ou rode `npm run baixar` antes, para trazer o que mudou no editor.

## 1. Preparação (uma vez)

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou mais nova).
2. Ative a **API do Google Apps Script** na conta dona do projeto: https://script.google.com/home/usersettings → *API do Google Apps Script* → **Ativada**.
3. No terminal, dentro da pasta do repositório:
   ```bash
   npm install
   npx clasp login
   ```
   Abre o navegador; entre com a conta Google dona do projeto. O clasp cria o arquivo `~/.clasprc.json` (credenciais — **nunca** coloque no repositório; ele já está no `.gitignore`).
4. **Antes do primeiro envio**, confira o manifesto: no editor do Apps Script, *Configurações do projeto* → marque *Mostrar o arquivo de manifesto "appsscript.json"* e compare com `apps-script/appsscript.json` (fuso horário e acesso do App da Web). Se for diferente, copie o do editor para cá.

## 2. Publicar pelo computador

```bash
npm run enviar                                   # envia o código (equivale a salvar no editor)
npm run publicar -- "Descrição da nova versão"   # envia e cria nova versão no mesmo endereço
```

Depois de publicar, abra o endereço do app e confira.

## 3. Publicar pelo GitHub (sem terminal)

1. Faça o passo 1 acima uma vez em qualquer computador e abra o arquivo `~/.clasprc.json` (na pasta do seu usuário).
2. No GitHub: *Settings* do repositório → *Secrets and variables* → *Actions* → **New repository secret**
   - Nome: `CLASPRC_JSON`
   - Valor: todo o conteúdo do `.clasprc.json`
3. Para publicar: aba **Actions** → **Publicar no Apps Script** → **Run workflow** → escreva a descrição → **Run**.

O fluxo roda os testes antes; se algum falhar, nada é publicado.

## 4. Testes

```bash
pip install playwright
python -m playwright install chromium
npm run testes
```

Os testes usam o Google Chrome instalado (`/usr/bin/google-chrome`). No GitHub eles rodam sozinhos a cada envio (aba *Actions* → *Testes*).

## 5. Planilha nova (instalação do zero)

1. Crie uma Planilha Google vazia e copie o ID dela (o trecho entre `/d/` e `/edit` no endereço).
2. Coloque o ID em `CONFIG.PLANILHA_ID`, no `apps-script/Config.gs`.
3. Crie um projeto Apps Script (script.google.com → Novo projeto), coloque o ID dele no `.clasp.json` e rode `npm run enviar`.
4. No editor, execute `verificarEstrutura` (cria as abas) e publique: *Implantar → Nova implantação → App da Web*, executar como **Eu**, acesso **Qualquer pessoa**.
5. Abra o endereço: a primeira tela cadastra o administrador proprietário.

## Backup

A planilha é o banco de dados — o código aqui não guarda dados. Faça cópias da planilha no Drive (Arquivo → Fazer uma cópia) antes de mudanças grandes.
