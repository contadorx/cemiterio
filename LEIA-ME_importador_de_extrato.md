# O extrato entra inteiro

## O que eu achei antes de escrever qualquer coisa

A tabela `entradas_banco` existe desde a migração **0045**. A API existe. A tela
`Entradas.tsx` existe. O palpiteiro existe. Tem até teste passando
(*"identificar entrada credita a familia"*).

**Zero linhas.**

O extrato nunca foi importado porque não havia por onde: as entradas só entravam
uma a uma, na mão. Em agosto foram **112 Pix**. Ninguém digita 112 linhas todo
mês. O zero não era desinteresse — era a falta desta tela.

É o mesmo padrão do alarme do WhatsApp na fatia anterior: construído inteiro,
nunca ligado no fio.

---

## Como usar

**Financeiro → Entradas → Importar o extrato do banco.**

Baixe o extrato no aplicativo e traga o arquivo. **OFX é o melhor** — é o
formato feito para isso, e não tem limite de tamanho. CSV, XLSX e PDF também
servem.

Aí você vê a prévia, marca o que é gasto seu, e confirma. **Nada entra sem
você olhar.**

---

## O saldo é o juiz

Todo extrato traz o saldo depois de cada movimento. Isso deixa a leitura **se
provar**: eu refaço a conta movimento a movimento e comparo com o que o banco
imprimiu, linha por linha.

Foi assim que eu provei, à mão, que a extração do seu extrato de agosto estava
certa:

```
6.111,21 (abertura) + 538,82 = 6.650,03   →  o Bradesco diz 6.650,03
linhas em que a conta discorda do valor impresso: 0
```

Agora isso virou código, e a tela diz uma de três coisas:

| | o que aparece |
|---|---|
| **A conta fecha** | refiz o saldo do começo ao fim e bate ao centavo |
| **A conta não fecha** | *"a linha 47 deixaria o saldo em R$ 6.230,00 mas o extrato diz R$ 6.180,00"* — e o botão de importar some |
| **Não deu para conferir** | o arquivo não traz saldo por linha (o OFX não traz). Isso **não** é "está tudo certo": é ausência de prova, e a tela fala com essas palavras |

**É essa prova que torna honesto ler o PDF com IA.** Sem ela, um modelo lendo
dez páginas de extrato seria um chute caro. Com ela, ou fecha ao centavo ou não
entra.

---

## As saídas pessoais

A conta é sua — tem supermercado e cartão no meio das despesas do negócio.

Na prévia, cada saída tem uma caixinha. O que você marcar entra como
**pessoal** e fica fora do resultado. O que não marcar entra **sem
classificação** — e sem classificação também não entra em resultado nenhum, até
você decidir. Nada é chutado como despesa do negócio por omissão.

Dá para classificar depois, e dá para desfazer.

Duas travas no banco: débito não pode ganhar dono de família (era a porta por
onde um pagamento de fornecedor viraria crédito de alguém), e `natureza` só
aceita `negocio`, `pessoal` ou nulo.

---

## Importar duas vezes não dobra nada

Cada linha ganha uma chave gerada no banco, e um índice único recusa a
repetição. Reimportar o mesmo arquivo entra como **zero novas**. Reimportar o
mês inteiro depois de ter importado a primeira semana acrescenta **só o que
falta** — e a marcação de pessoal que você já fez sobrevive.

Dois Pix iguais, no mesmo dia, do mesmo valor e sem número de documento são
distinguidos **pelo saldo**: dois movimentos não deixam a conta no mesmo lugar.

---

## Os formatos

| | como é lido |
|---|---|
| **.ofx** | leitor próprio. O melhor caminho — é o formato do banco |
| **.csv / .txt** | leitor próprio, fareja o separador (`;`, `,`, tab) |
| **.xlsx** | leitor próprio: o zip é aberto na mão, sem dependência nova |
| **.xls** | quase sempre é uma tabela **HTML** com a extensão trocada — o Bradesco faz isso, e eu leio. Se for o Excel 97 de verdade, recuso com a receita: baixe em OFX ou salve como CSV |
| **.pdf** | vai para a IA, e volta para a mesma conferência de saldo, sem desconto |

O formato é reconhecido **pelo conteúdo**, não pela extensão. A extensão mente;
o conteúdo não.

Não entrou nenhuma dependência nova no projeto. Uma biblioteca de planilha é
código grande, com histórico de falha de segurança, para ler um arquivo por mês.

---

## E o palpiteiro estava quebrado

Achei isso no caminho. `sureya_palpites_entrada` calculava o saldo de cada
família a partir de `movimentos` — o razão **aposentado na migração 0073**, que
tem **2 linhas** em produção contra **63** no razão de verdade
(`conta_corrente`).

Resultado: todo mundo aparecia com saldo zero, e os dois braços do palpite que
dependem de valor — *"deve exatamente este valor"* e *"deve um valor próximo"* —
**nunca disparavam**. Sobrava um `LIKE` no **primeiro nome** do remetente, que
para "MARIO KANASHIRO" procura "MARIO" e devolve três famílias diferentes.

É o mesmo defeito que já mordeu as Campanhas: olhar uma tabela que esvaziou.

O que mudou:

- lê `conta_corrente`, com **a mesma conta de `financeiro.ts`** — para o palpite
  não contradizer a ficha na tela ao lado
- o saldo é da **família**, não do contato
- casa por **qualquer** palavra de 4+ letras, com prefixo nos dois sentidos:
  o extrato corta o nome em 21 caracteres (`LUCIA NORIKO YAMASHIR`) e o cadastro
  guarda apelido curto (`Mario Kana` para KANASHIRO). Exigir igualdade perdia os
  dois lados do corte
- **força 100 só quando batem duas palavras** (nome *e* sobrenome). É o único
  caso em que dá para confiar sem uma pessoa olhar

---

## O que isto NÃO faz

Importar é **só colocar o extrato na mesa**. Nenhum Pix vira crédito de família
sozinho — quem diz de quem é continua sendo você, na tela de Entradas. Nenhuma
mensagem sai. Nenhuma cobrança para sozinha.

---

## A Josi — e o que não fecha no cadastro

Você disse que ela pagou **três meses: julho, agosto e setembro**. Duas coisas
não batem com o que está no banco, e eu não mexi em nenhuma:

1. **O contrato dela está cadastrado para começar em outubro**
   (`inicio_cobranca = 2026-10-01`). Se ela pagou julho, o início é julho.
2. **R$ 100,00 não é 3 × R$ 30,00.** A mensalidade cadastrada é R$ 30 e três
   meses dariam R$ 90. Sobram R$ 10 — ou o valor do contrato é outro, ou ela
   arredondou.

Me diz qual é a verdade dos dois e eu acerto a ficha junto com o lançamento.

---

## Provas

`npm run ci` verde: **217 testes** no simulador (19 novos para os leitores e a
conferência) e **20 verificações** em `testes/extrato.sql`, incluindo:

- reimportar o arquivo maior traz só o que falta
- a marcação de pessoal sobrevive à reimportação
- a que ninguém classificou fica **nula**, não "negócio"
- dois Pix iguais no mesmo dia entram os dois
- débito não gera palpite de família nem aceita dono
- linha que não bate com o saldo **reprova** a importação, dizendo qual linha
- célula vazia omitida no XLSX não desloca as colunas

O placar do banco reconstruído bate com produção nos quatro números.
