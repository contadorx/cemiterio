# Varredura do código inteiro — 24/08/2026

317 arquivos, 55.239 linhas de TypeScript, 129 migrations, 66 tabelas em
produção. Tudo abaixo foi **medido**, não lido. Onde há número, ele saiu do
banco de produção hoje.

---

## 1. A porta do anônimo estava encostada — **já consertei**

**Dez funções `security definer` estavam com `EXECUTE` concedido ao papel
`anon`.** A chave anônima do Supabase é pública por desenho: vai no pacote que
o navegador baixa. Quem a tivesse chamava essas funções direto.

Não é teoria. Dentro de um bloco desfeito, com `set local role anon`, a
`sureya_saude_whatsapp` **devolveu os números de produção**:

```
{"em_24h": {...}, "total_24h": 305, "ultimo_evento": "2026-08-24T16:06:49Z", ...}
```

Depois da 0129, a mesma chamada devolve `permission denied`.

### Por que as tabelas estavam bem e as funções não

O anônimo tem `SELECT` em quase toda tabela — e isso **não** é problema: a RLS
está ligada em todas, com política `org_id = current_org_id()`, e para o
anônimo `current_org_id()` é nulo. Nenhuma linha volta. Conferido: **zero
tabelas sem RLS, zero sem política.**

Função `security definer` **não passa pela RLS**. É a lição que a 0079 já tinha
deixado escrita neste repositório: *"SECURITY DEFINER ignora RLS — só o GRANT
EXECUTE protege"*. Nessas dez, o único cadeado tinha sido aberto por omissão: o
Supabase concede EXECUTE a `anon` por padrão em `public`, e migration que não
revoga, publica.

### O que estava aberto

| função | o que dava para fazer |
|---|---|
| `sureya_registrar_pagamento` | **escrever dinheiro** — recebe `p_org` por parâmetro, nem sessão precisava |
| `sureya_importar_extrato` | escrever extrato bancário |
| `sureya_classificar_saidas` | reclassificar saídas |
| `sureya_limpar_eventos_webhook` | **apagar** eventos |
| `sureya_palpites_entrada` | ler `cliente_id` e **nome** das famílias |
| `sureya_rastro_telefone` | quem soubesse o telefone de uma família lia o rastro de mensagens dela |
| `sureya_saude_whatsapp` | números de operação da casa |
| `sureya_envia_fotos`, `sureya_texto_modelo`, `sureya_textos_do_tipo` | preferência da família e os textos da casa |

**Não exercitei a de pagamento em produção, de propósito.** A ACL é idêntica à
da que eu provei; escrever para confirmar seria causar o dano que estou
consertando.

### O agravante, e por que a guarda não estava errada

Várias guardam assim:

```sql
if auth.uid() is not null and not is_admin() then
  raise exception 'somente_admin';
end if;
```

Isso quer dizer *"sem sessão, pode"* — e existe por um motivo legítimo: o cron
e o psql chamam sem `auth.uid()` (a lição da 0103). A guarda está certa **para
quem pode chamar**. O erro nunca foi a guarda: foi deixar o anônimo na lista de
quem pode chamar.

### E não volta a abrir

`testes/porta_do_anonimo.sql` não confere uma lista de funções: confere uma
**regra** contra todas as que existirem no dia. Qualquer função nova sem
`revoke` reprova o `npm run ci`, com a linha do `revoke` pronta na mensagem de
erro. Uma lista fixa não pegaria a próxima.

**A origem é minha:** 0121, 0122 e 0123 criaram funções sem revogar. A 0125
revogou — foi a exceção, não a regra.

---

## 2. A régua de cobrança fica muda exatamente onde está o dinheiro

O último degrau da régua é **+30 dias**. Depois dele, não há mais nenhum. O
casamento é por igualdade exata (`d.dias = r.dias_do_vencimento`), então um
débito com 31 dias, ou 90, ou 379, **nunca mais gera mensagem**.

Medido nos 68 débitos de competência em aberto:

| faixa | débitos | famílias | valor | mais velho |
|---|---|---|---|---|
| **passou do último degrau (+30)** | **43** | **7** | **R$ 1.565,00** | **379 dias** |
| dentro da régua (0 a 30) | 19 | 15 | R$ 790,00 | 14 dias |
| ainda não venceu | 6 | 4 | R$ 370,00 | — |

**R$ 1.565,00 de R$ 1.980,00 em aberto — 79% do dinheiro devido — está na zona
de silêncio.** Uma família com um débito de mais de um ano não recebe nada
desde o trigésimo dia.

E o cron relata isso como `sem_degrau: 65`, um número que parece diagnóstico e
esconde o fato.

**O conserto é pequeno:** um degrau final que se repete (a cada 30 dias, por
exemplo) em vez de acabar. A régua já sabe não repetir no mesmo dia e já
respeita o adiamento da 0124. Não fiz porque muda o que a Sureya diz para as
famílias — é decisão sua, não minha.

---

## 3. Duas funcionalidades prontas entregando zero

**A memória.** `eventos_memoria` tem **0 linhas**. Dois bloqueios independentes
sobre a mesma coisa:

- `orgs.lembretes_memoria = false` — o motor está **desligado**;
- dos **62 falecidos** cadastrados, **nenhum** tem `data_falecimento` nem
  `data_nascimento`.

Ou seja: mesmo ligando a chave hoje, o motor não teria de onde tirar uma data.
São as tarefas #13, #14 e #15, todas marcadas como concluídas, produzindo nada.

**O importador de extrato** (0122, construído nesta semana). `entradas_banco`:
**0 linhas**. `importacoes_extrato`: **0 linhas**. Nunca foi usado em produção.
O caminho existe, foi testado, e nenhum extrato passou por ele.

---

## 4. Três portas para o mesmo ato — e duas escrevem no razão errado

Registrar um pagamento tem **três funções** em produção:

| função | sabe de desconto/juros/multa? | escreve no razão novo? | usada pela tela? |
|---|---|---|---|
| `sureya_registrar_pagamento` (0123) | **sim** | **sim** (`conta_corrente`) | **sim** |
| `sureya_registrar_pagamento_manual` | não | não (`movimentos`, congelado na 0073) | **não** |
| `sureya_pagamento_avulso` | não | não | **não** |

As duas de baixo têm rota HTTP viva — `/api/financeiro/pagamento-manual` e
`/api/financeiro/pagamento-avulso` — que **nenhuma tela chama**. São portas de
dinheiro abertas, sem uso, escrevendo num razão que foi congelado há 56
migrations, e que não conhecem as partes do pagamento que você pediu ontem.

É o mesmo defeito de forma que já apareceu cinco vezes aqui. Aposentar as duas
é curto e eu recomendo.

---

## 5. Nove rotas e 2.383 linhas de tela que ninguém alcança

**Rotas de API sem nenhum chamador:** `/api/agenda/puxar`, `/api/capacidade`,
`/api/campo/materiais`, `/api/hoje`, `/api/indicadores`,
`/api/contatos/conversa`, `/api/contatos/conversas`, e as duas de pagamento
acima.

**Componentes órfãos** — existem, compilam, e nenhum arquivo os importa:

```
VisaoMapa.tsx        1001   o mapa; a aba "Mapa" saiu da Carteira e ele ficou
VisaoLeads.tsx        366
Concluir.tsx          276   campo: a câmera migrou para os botões do cartão
VisaoAgente.tsx       210
ConfirmarJazigo.tsx   189
ConcluirAdmin.tsx     174
CardTumulo.tsx        167
```

E `/painel/mapa` ainda redireciona para `/painel/clientes?aba=mapa` — uma aba
que não existe mais. Não dá erro: cai em "Famílias". Mas é um endereço que
promete uma coisa e entrega outra.

**Doze tabelas vazias**, entre elas `competencias` (as competências viram
lançamento em `conta_corrente`, não linha ali) e `lancamentos` e `quitacoes`.

Nada disso quebra hoje. O custo é outro: cada leitura futura deste código
começa perguntando "isto está vivo?".

---

## 6. Cadastro — o que falta preencher

| | |
|---|---|
| jazigos **contratados** sem `ordem_na_rua` | **72 de 79** |
| famílias sem nenhum contato | 28 |
| jazigos sem GPS | 3 (todos contratados) |
| cliente sem telefone | 1 |
| jazigo sem rua, sem família, contratado sem `periodo_inicio` | **0** |

Os 72 sem ordem na rua se resolvem sozinhos com a caminhada (0125), a uma rua
por vez. Se você quiser acelerar, uma volta com o celular resolve.

**Família Zaratini** continua marcada como contratada, com regime "contrato" e
**zero jazigos**.

---

## 7. Dependências e segredos

`npm audit` (produção): **2 altas**, as duas no `postcss` de dentro do `next`.
São de processamento de CSS em build, com entrada que você controla — o risco
real aqui é baixo. O conserto exige `next@16`, uma quebra. **Não force agora.**

Segredos comitados: **nenhum**. Procurei chave de API e JWT no repositório
inteiro.

---

## 8. A ordem em que eu faria

1. ~~Fechar a porta do anônimo~~ — **feito, 0129, aplicada.**
2. **A régua não pode emudecer aos 30 dias.** R$ 1.565,00 esperando. É a única
   coisa aqui que custa dinheiro todo dia.
3. **Aposentar as duas portas de pagamento mortas** e a tabela `planos` (que
   ainda dobra a geração no jazigo Perrela — está no LEIA-ME de ontem).
4. **Decidir sobre a memória:** ou preencher as datas dos 62 falecidos e ligar
   a chave, ou aceitar que a funcionalidade dorme e parar de contá-la como
   pronta.
5. **Apagar o código órfão** — 2.383 linhas e 9 rotas, num commit só, com esta
   lista como justificativa.
6. Backup do Storage (409 fotos sem segunda via) e o ensaio de restauração —
   os dois já estavam em `PENDENCIAS.md` e continuam sendo os maiores riscos
   não-técnicos.
