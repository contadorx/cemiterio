# Política de dados — o que o sistema guarda, por quanto tempo, e o que faz quando pedem para apagar

**Build 6, entrega 4.** Escrito em 22/08/2026 a partir do que o sistema **faz**,
conferido no banco — não do que seria bom que fizesse.

> **Isto não é parecer jurídico.** É a descrição técnica fiel do sistema, para
> servir de base a um. Quem for redigir a política pública precisa ler
> principalmente a seção 5, que lista o que a remoção **não** alcança hoje.

---

## 1. De quem são os dados

| Titular | Como entra |
|---|---|
| **A família** (pessoa que contrata e paga) | cadastro pela responsável, ou lead pelo site/WhatsApp |
| **A pessoa falecida** | nome no cadastro do jazigo (`tumulos.falecido_nome`) |
| **A pessoa de campo** | conta de acesso (`membros`), remuneração, dias de campo |

A pessoa falecida não é titular no sentido da LGPD, mas o nome dela **identifica
a família** — quem vê "jazigo de Maria Aparecida" chega na família Aparecida. É
dado pessoal por associação, e a política pública deve tratá-lo como tal.

---

## 2. O que é guardado, e por quê

| Dado | Onde | Por que existe |
|---|---|---|
| nome, telefone | `clientes` | falar com a família; cobrar |
| parentesco, quem recebe foto | `clientes` | mandar a foto para quem quer receber |
| responsável financeiro | `clientes` | uma dívida, uma cobrança (`DECISOES.md` D-01) |
| conversas de WhatsApp | `mensagens`, `conversas` | histórico do atendimento |
| **fotos do túmulo (antes/depois)** | Storage `servicos` | provar o serviço; é o produto |
| **comprovantes de Pix** | Storage `comprovantes` | conferir pagamento |
| lançamentos financeiros | `conta_corrente` | a conta da família |
| nome da pessoa falecida | `tumulos` | achar o jazigo certo |
| consentimento | `clientes.consentimento_em` | registro de quando foi dado |

---

## 3. Fotos: link permanente e público — decisão D-03

**Esta seção é a mais importante da política pública, e precisa aparecer nela
com estas palavras.**

As fotos vão para a família por **link direto no WhatsApp**, sem login e sem
senha. É uma decisão registrada em `DECISOES.md` D-03: a maioria das famílias é
idosa, e qualquer passo a mais desequilibra o acesso.

O que isso significa, conferido no banco em 22/08:

| | |
|---|---|
| Baldes `servicos` e `comprovantes` | públicos |
| RLS em `storage.objects` | **ligada**, com zero policies |
| Listar o conteúdo dos baldes | **não é possível** — a listagem volta vazia |
| Caminho do arquivo | `{org}/{servicoId}/depois-{timestamp}.jpg` (UUID) |

**Não é possível descobrir os links.** É possível usar um link que se tenha.

Consequência a declarar: **quem receber o link — encaminhado num grupo de
família, por exemplo — abre a foto, e continua abrindo indefinidamente.** O
sistema não expira o link, não conta acessos e não sabe quem abriu.

A política pública **não pode** prometer que as fotos são privadas ou de acesso
restrito. Prometer isso seria afirmar uma proteção que o sistema não faz.

---

## 4. Prazos

O sistema **não apaga nada sozinho hoje.** Não há rotina de expurgo, e é
proposital: apagar automaticamente dado financeiro ou foto de serviço, sem
alguém decidir, é pior que guardar demais.

Prazos a definir com quem redigir a política pública:

| Dado | Sugestão de prazo | Raciocínio |
|---|---|---|
| Lançamentos financeiros | **5 anos** após a quitação | prazo civil de cobrança |
| Fotos de serviço | **enquanto o contrato durar** + 1 ano | prova do serviço |
| Comprovantes de Pix | **5 anos** | acompanham o lançamento |
| Conversas de WhatsApp | **2 anos** | histórico de atendimento |
| Leads não convertidos | **6 meses** | depois disso não servem a nada |

**Aprovados pela responsável em 22/08/2026 e implementados na `0078`** como
`sureya_expurgo_previa(p_hoje)`, que **conta e não apaga**.

Duas decisões de desenho valem registro:

- **lançamento financeiro só sai se a família estiver quitada.** Apagar dívida
  em aberto por prazo seria perdoar sozinho;
- **contrato ativo nunca perde foto**, por mais velha que seja — ela é a prova
  do serviço.

A função que **apaga** não existe ainda, e isso é deliberado: hoje a prévia
devolve zero em todas as categorias (o sistema tem meses de vida, não anos).
Escrever agora o único código que destrói dado de família, sem possibilidade de
testar contra dado real, seria escrever no escuro. Ela entra quando houver o que
apagar — e depois de alguém olhar o número da prévia uma vez.

---

## 5. O que acontece quando pedem para remover — e o que NÃO acontece

O botão existe: `POST /api/clientes/[id]/lgpd` com `acao: "anonimizar"`, que
chama `sureya_anonimizar_cliente`.

### O que ela faz, hoje

```
clientes    nome     → "Cliente removido"
            telefone → "anon:<aleatório>"
            perfil_ia, instrucoes_ia → null
            ativo_ia → false
            anonimizado_em → agora
conversas   aberta → false
mensagens   texto → "[removido a pedido]", midia_url → null
leads       nome_wa → null, mensagens → [], status → descartado
```

E `anonimizado_em` tira a pessoa da cobrança automática, das campanhas e da
contagem de clientes ativos — conferido: sete lugares do código filtram por ele.

### O QUE ELA NÃO ALCANÇA

Esta é a lista que a política pública precisa considerar antes de prometer
qualquer coisa. Levantei coluna por coluna no banco:

**Fechado na `0078`** (decisão da responsável, 22/08/2026):

| Onde | Estado |
|---|---|
| **Storage** (`servicos`, `comprovantes`) | ✅ **os arquivos são apagados de verdade** — ver abaixo |
| `telefones_cliente` | ✅ a linha é removida |
| `fila_liberacao.texto` / `texto_final` | ✅ vira `[removido a pedido]`, fotos zeradas |
| `clientes.observacoes`, `foto_url` | ✅ zerados |
| `indicacoes` | ✅ o **vínculo** sai (`indicador_id` → null) |
| `conta_corrente.descricao` | ⚠️ fica — é registro contábil, e o prazo dele é 5 anos (§4) |
| `tumulos.falecido_nome` | ⚠️ **fica, por decisão** |

**Por que a indicação não é apagada inteira:** `indicado_nome` e `indicado_tel`
são de um **terceiro** — quem foi indicado. O pedido de remoção de quem indicou
não alcança o dado de outra pessoa. O que sai é o vínculo.

**Por que `falecido_nome` fica:** apagar o nome do falecido inutiliza o cadastro
do jazigo, que é o objeto do contrato. E o titular do pedido é a família viva,
não o registro do jazigo.

### Como o arquivo é apagado de verdade

`storage.objects` é uma tabela, e dá para apagar linha dela — mas isso remove só
o **registro**. O arquivo continua no balde e continua abrindo pela URL pública.
Apagar a linha e achar que removeu é pior que não remover.

Por isso a divisão: `sureya_arquivos_do_cliente` **lista** (sete origens
diferentes de URL, levantadas uma a uma no esquema), e a rota
`/api/clientes/[id]/lgpd` **apaga** pela API de Storage.

**A ordem é deliberada: se o Storage falhar, a pessoa NÃO é marcada como
removida.** A tela devolve *"removi 11 de 13 arquivos; não marquei como
removida"* — porque um comprovante de remoção sobre arquivo que ficou é pior
que não ter removido.

O caso de `tumulos.falecido_nome` é uma **decisão de negócio, não um bug**:
apagar o nome do falecido inutiliza o cadastro do jazigo, que é o objeto do
contrato. A política precisa dizer se ele fica.

> **Todas essas tabelas estão vazias hoje** (pré-piloto: 0 clientes
> anonimizados, 0 linhas em `telefones_cliente`, 0 na fila). É por isso que este
> é o momento barato para decidir. Depois do piloto, cada linha dessa lista é
> uma conversa com uma família real.

### O que ainda falta

1. **Ensaiar a remoção com uma família de teste em produção**, antes da primeira
   real — é o item 1 do roteiro de piloto (`BUILD_7.md`).
2. Incluir as fotos no direito de acesso (§6).

---

## 6. Direito de acesso

`GET /api/clientes/[id]/lgpd` devolve um JSON com cadastro, jazigos, serviços,
o razão da família, o razão antigo e as mensagens.

Desde a migração do Build 4 ele leva **os dois razões**, e o da família vai
identificado como tal — porque é um extrato **compartilhado** entre os membros,
não um registro individual, e quem lê o arquivo precisa saber disso.

**Não inclui as fotos.** Deve incluir: são dado pessoal e são o produto. Falta.

---

## 7. Consentimento

`clientes.consentimento_em` registra **quando**. Não registra **o quê** nem
**como** — não há versão de termo, nem o canal.

Para o piloto isso basta se a política pública tiver uma versão datada e o
cadastro registrar qual versão a pessoa aceitou. Hoje não registra.

---

## 8. Incidente

Não há procedimento escrito nem canal definido. Ver `RUNBOOKS.md` §5, que trata
a parte operacional (o que fazer nas primeiras horas). A parte legal — quem
comunica a ANPD, em quanto tempo, e como se avisa a família — é do documento
público, e está em aberto.

---

## 9. Resumo honesto

| Item | Estado |
|---|---|
| Base de dados descrita | ✅ conferida no banco |
| Fotos com link permanente declarado | ✅ (seção 3) |
| Prazos de retenção | ⚠️ definidos e **medidos** (`sureya_expurgo_previa`); a função que apaga entra quando houver o que apagar |
| Remoção a pedido | ✅ alcança Storage, `telefones_cliente`, fila e indicações |
| Direito de acesso | ⚠️ existe, **sem as fotos** |
| Versão de termo aceito | ❌ não registrada |
| Procedimento de incidente | ❌ operacional em `RUNBOOKS.md`, legal em aberto |

Nenhum item marcado ❌ ou ⚠️ impede o piloto — mas **todos precisam estar
decididos antes de a primeira família real entrar**, porque depois disso cada
correção envolve dado de gente.
