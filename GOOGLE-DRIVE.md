# Abrir vídeo do Google Drive

O botão nasce **desligado**. As três constantes no topo do bloco de script de `src/template.html` são
todas obrigatórias: faltando qualquer uma, a linha inteira não é renderizada e nenhum endereço do
Google é requisitado. Quem clona o repositório e roda o build recebe exatamente a ferramenta de antes.

O App ID entra nessa exigência de propósito. Sem ele o seletor abre normalmente e **todo download morre
em 404**, porque é o App ID que faz o Google conceder a permissão sobre o arquivo escolhido. É um erro
caro de diagnosticar; melhor não deixar o botão aparecer.

Desde 15/08/2026 os valores **não se digitam no `template.html`**. Eles moram no `build.py`,
junto da marca, do domínio e dos tokens de medição — um lugar só onde a identidade do projeto
vive, em vez de um arquivo de 5.600 linhas:

```python
G_CLIENT = ""   # ...apps.googleusercontent.com
G_KEY    = ""
G_APP    = ""
```

O `build.py` estampa os três no `public/app.html` e os deixa **vazios no build offline**, do mesmo
jeito que faz com os endereços de medição. E uma trava nova derruba o build se qualquer
`__TOKEN__` sobreviver à substituição — credencial que não existe produzindo um botão que só falha
em produção é exatamente o tipo de erro que não se quer descobrir pelo usuário.

---

## O que isso muda na promessa da página

Nada. E esse foi o critério para aceitar a funcionalidade.

O arquivo vai do Google direto para o navegador da pessoa, por `fetch` autenticado, e para por aí. Não
existe servidor nosso no caminho, não existe proxy, não existe cópia. A frase *"não temos seus arquivos
porque não temos servidor"* continua literalmente verdadeira — diferente do que vai acontecer no dia em
que a conversão de formato entrar no ar (veja `ARQUITETURA-PAGO.md`, seção 5).

O único fato novo a declarar é que, **se a pessoa clicar no botão**, o navegador dela passa a falar com
`accounts.google.com` e `apis.google.com`. Por isso os dois SDKs são carregados sob demanda, no clique,
e não no carregamento da página: quem nunca usa o Drive continua com uma página que não conversa com
terceiro nenhum. Vale uma linha na política de privacidade dizendo isso.

## Por que o escopo `drive.file`

É o escopo mais restrito que existe para essa finalidade: dá acesso **apenas aos arquivos que a pessoa
escolher no seletor**, nunca ao Drive inteiro. O `drive.readonly`, que seria o caminho preguiçoso, é
classificado como *restricted* pelo Google e arrasta consigo auditoria de segurança anual paga (CASA) —
inviável para um projeto assim.

O `drive.file` é **não sensível**: publicar o app em produção com ele não exige verificação de escopo
nem auditoria. É a diferença entre configurar isso numa tarde e não configurar nunca.

---

## Configuração no Google Cloud

Uma vez só, cerca de vinte minutos.

**1. Projeto e APIs.** Crie um projeto em [console.cloud.google.com](https://console.cloud.google.com/).
Em *APIs e serviços → Biblioteca*, ative as duas:

- **Google Drive API** — é o que baixa o arquivo
- **Google Picker API** — é a janela de seleção

**2. Tela de consentimento** (hoje sob *Google Auth Platform*). Tipo de usuário **Externo**. Preencha
nome do app, e-mail de suporte e e-mail do desenvolvedor. Em *Escopos*, adicione manualmente:

```
https://www.googleapis.com/auth/drive.file
```

Confira que ele aparece como **não sensível**. Se aparecer em outra categoria, o escopo escolhido está
errado.

**3. Público.** Enquanto estiver em *Teste*, só funciona para até 100 contas cadastradas na lista de
teste, e a autorização de cada uma expira em 7 dias. Para uso público, mude para **Em produção**. Com
`drive.file` isso não dispara verificação de escopo — no máximo a revisão de marca, se você quiser nome
e logotipo próprios na tela de consentimento.

**4. Client ID.** *Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web*. Em
**Origens JavaScript autorizadas**, liste os endereços de onde a página é servida:

```
https://walkstamp.com
https://www.walkstamp.com
http://localhost:8000
```

Não preencha *URIs de redirecionamento* — o fluxo de token do GIS não usa. Copie o Client ID.

**5. Chave de API.** *Credenciais → Criar credenciais → Chave de API*. Restrinja em duas frentes, e faça
isso agora, não depois:

- *Restrições de aplicativo* → **Referenciadores HTTP**, com os mesmos domínios acima
- *Restrições de API* → apenas **Google Picker API**

**6. App ID.** É o **número do projeto**, só dígitos, no painel inicial do console. Não confunda com o
ID do projeto, que é textual.

**7. Preencha as constantes** no topo do `build.py` (`G_CLIENT`, `G_KEY`, `G_APP`) e rode
`python3 build.py`. Confira em `public/app.html` que os três valores chegaram, e em
`offline/walkstamp-offline.html` que continuam vazios.

---

## Os três valores são públicos, e tudo bem

Eles vão para dentro de um arquivo HTML estático — qualquer pessoa lê. É assim que funciona toda
aplicação de página única com OAuth. O que protege a chave não é o segredo, é a lista de origens
autorizadas: uma cópia da sua página hospedada em outro domínio simplesmente não autentica.

Por isso o passo 5 não é opcional. Chave de API sem restrição de referenciador é chave de API de
qualquer um.

## Build offline

O arquivo de `offline/` carrega as mesmas constantes, mas o botão se esconde sozinho quando a página é
aberta por `file://` — OAuth não funciona sem origem HTTP. Servido por HTTP em outro domínio, o botão
aparece e o Google recusa, com a mensagem de erro visível na interface. Coerente: o build offline
existe para funcionar sem internet, e o Drive precisa de internet.

## Limites conhecidos

- **Arquivos muito grandes.** O vídeo inteiro vira um `Blob` na memória do navegador. Acima de ~1,5 GB a
  interface avisa; acima de ~3 GB a aba tende a morrer. Nesses casos, baixar e arrastar é mais seguro.
- **Atalhos do Drive** (`application/vnd.google-apps.shortcut`) não baixam por `alt=media`. A pessoa
  precisa escolher o arquivo em si. O 404 que o Google devolve nesse caso é traduzido para uma
  mensagem que diz isso, em vez de mostrar o código.
- **A sessão do Google dura cerca de uma hora.** Depois disso o download responde 401 e a ferramenta
  pede um novo clique — renovar sozinha exigiria abrir um pop-up sem clique recente, o que o navegador
  bloqueia.
- **Vídeos de Drives compartilhados** funcionam — `supportsAllDrives=true` está ligado —, mas dependem
  da permissão de download concedida pelo administrador.
- **O download pode ser cancelado**, a transcrição automática ainda não.

---

## Enviar o documento para o Google Docs

Construído em 15/08/2026. Usa o **mesmo escopo `drive.file`** e o mesmo client ID — não há
credencial nova a criar. O que ele faz: sobe o `.docx` montado no navegador para
`upload/drive/v3/files` em `multipart`, com `mimeType: application/vnd.google-apps.document` nos
metadados, e o Google devolve um documento nativo do Drive já convertido.

Três decisões que valem registro:

**O botão aparece só com o `G_CLIENT`.** A chave de API e o App ID são o que abre o
*seletor* de arquivos; criar um arquivo novo não passa pelo seletor. Então o envio funciona mesmo
numa configuração parcial, enquanto o botão de abrir vídeo continua exigindo os três.

**O formato enviado é `.docx`, não HTML.** O conversor de HTML do Drive descarta imagem em
`data:`, e o documento é feito de imagens. Com `.docx` as imagens são partes do pacote e
atravessam a conversão intactas.

**Este é o único ponto da ferramenta em que o conteúdo sai da máquina.** Por isso ele pede
confirmação explícita, tem borda tracejada e seta ↗, está na tabela da página de segurança com
linha própria e tem parágrafo próprio na política de privacidade. O caminho continua sendo
navegador → Google, sem servidor nosso — mas a partir dali o arquivo está no Google, e o texto diz
isso com essas palavras. Na versão offline o botão não existe (ele exige `http(s)`).
