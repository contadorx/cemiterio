# Apagar o jazigo precisa apagar as fotos dele

Fui atrás do item mais velho da `PENDENCIAS.md` — *"409 arquivos sem segunda
via"* — e a primeira coisa que achei foi que o número está velho.

## O que eu medi hoje na produção

| | |
|---|---|
| Arquivos no balde `servicos` | **817** (292 MB) |
| Referenciados por algum registro | 535 |
| **Órfãos** | **282** — 105 MB, **36% do depósito** |
| Órfãos de túmulo que **não existe mais** | **281** |

Não é lixo aleatório. `DELETE /api/tumulos/[id]` apaga serviços, planos,
leituras de GPS e a linha do túmulo — e **nunca tocou no Storage**. A foto fica
lá, abrindo por URL pública, para sempre.

## E isso é mais que desperdício

A rota de LGPD faz a coisa certa, e faz há tempo: pega a lista pela função
`sureya_arquivos_do_cliente`, apaga **os arquivos primeiro** e só então marca a
pessoa como removida — porque comprovante de remoção sobre arquivo que ficou é
pior que não ter removido.

Só que essa lista sai dos **túmulos da família**. Um túmulo já apagado não está
mais lá, e as fotos dele não entram na lista.

**Ou seja: dava para uma família pedir remoção, o sistema responder "removido",
e as fotos do jazigo dela seguirem abrindo por link direto.** Não é hipótese —
são 281 arquivos exatamente nessa situação agora.

## O que este build faz

**Migração 0135**, já aplicada na produção:

- `sureya_arquivos_do_tumulo` — a mesma lista da LGPD, um nível abaixo, para a
  exclusão poder apagar antes de apagar. **Uma lista só**: se a exclusão e a
  exportação divergirem, volta a existir arquivo que se exporta e não se apaga.
- `sureya_arquivos_orfaos` — o inventário do que já ficou para trás. **Ela não
  apaga nada.**

As duas com `EXECUTE` revogado de `anon` e `public` — sem isso, qualquer um com
a chave pública listaria o depósito inteiro (a lição da 0129).

**A exclusão do túmulo** passou a apagar as fotos, **na mesma ordem da LGPD**:
arquivo primeiro. Se o Storage falhar, o túmulo **não** é apagado e a resposta
diz isso. Apagar o registro assim mesmo é exatamente como se fabricaram os 281.

**A faxina** (`/api/manutencao/arquivos-orfaos`): `GET` lista, `POST` apaga.

Duas travas, e as duas têm razão:

- o `POST` exige `{ "confirmar": "APAGAR" }` — não é cerimônia: essa rota também
  sai de um `curl`, de um teste, de um script de outra pessoa, e a palavra é o
  que separa "eu quis" de "eu chamei sem ler";
- por padrão só mexe no que tem **dono sumido**. Sobre esses não há dúvida: o
  túmulo não existe mais, ninguém aponta, nunca mais aparecem em tela. O resto
  ("não referenciado") pode ser um upload em andamento no minuto da leitura.

**Eu não apaguei nada.** Os 105 MB continuam lá. Apagar foto é irreversível e é
decisão sua — quando quiser, é um `POST` com a palavra.

## Duas coisas que eu quase errei, e as duas seriam mudas

Escrevendo a auditoria da faxina:

1. `detalhe` é o **sexto** parâmetro de `auditar`, não uma chave de `alvo`.
   Dentro de `alvo` ele seria simplesmente descartado.
2. `auditoria.alvo_id` é **UUID**. Meu `id: "orfaos"` faria o insert estourar —
   e `auditar` engole a exceção de propósito, porque auditoria não pode derrubar
   operação. O registro nunca existiria, e o comentário que eu tinha acabado de
   escrever ("fica registrado") estaria mentindo.

As duas passariam pelo typecheck porque eu tinha posto um `as any`. Tirei o
`as any`, e ele apontou a primeira.

## Provas

**6 checagens em SQL** rodando no banco limpo, entre elas que a lista de um
jazigo traz as quatro fotos (faltar uma é o defeito inteiro), que **arquivo
referenciado não aparece como órfão** — o falso positivo aqui manda apagar foto
viva — e que a coluna `dono_sumido` distingue sobra de exclusão de upload solto.

**8 guardas estáticas**, entre elas que o arquivo sai **antes** do registro, que
o Storage falhando impede a exclusão, e que a auditoria não usa id de texto em
campo uuid.

`npm run ci` verde: 253 testes, 125 migrações, placar igual à produção
(funções 131 = 131).

## O que continua aberto — e é o pedido original

Isto **não é backup**. Nada aqui cria uma segunda cópia das fotos.

O que dá para fazer daqui a diante, e depende de você escolher o destino:

- **Cópia para fora.** 292 MB hoje, e cai para ~187 MB depois da faxina. Precisa
  de um lugar seu — outro bucket, um disco, uma conta de armazenamento. Eu não
  tenho, e mandar as fotos das famílias para um serviço que você não escolheu
  não é uma decisão minha.
- **Ensaiar a restauração** (item *b* da `PENDENCIAS.md`). Continua valendo, e
  continua sendo 30 minutos: restaurar num projeto novo e conferir quantas
  famílias e qual o saldo. Sem isso, "temos backup" é crença.

Atualizei o número na `PENDENCIAS.md` — de 409 para 817, com a data.
