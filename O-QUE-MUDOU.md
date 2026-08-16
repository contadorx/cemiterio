# O que mudou — Zelo & Memória

**Este zip é o projeto inteiro, com a MESMA estrutura de raiz do `src.zip` que
você enviou** — `src/`, `migrations/`, `package.json`, `public/` e o resto no
mesmo lugar.

O pacote anterior estava embrulhado numa pasta `src-atualizado/`, e por isso
não sobrescreveu nada: ao descompactar, ele criava uma pasta nova ao lado da
sua em vez de substituir os arquivos. Se aquele pacote foi extraído no
repositório, **apague a pasta `src-atualizado/`** antes de usar este.

## Como aplicar

Descompacte por cima da raiz do repositório, aceitando substituir. Depois
`npm run build` e deploy.

## Exatamente o que muda

**4 arquivos alterados**
- `src/lib/agenda.ts` — a rota do dia passa a sair do endereço, não do GPS
- `src/middleware.ts` — as telas desligadas devolvem 404
- `src/app/painel/ui.tsx` — menu de 12 para 8 itens
- `src/app/painel/page.tsx` — links órfãos removidos

**6 arquivos/pastas novos**
- `src/lib/rota.ts` · `src/lib/conta-corrente.ts` · `src/lib/mensagens.ts`
- `src/app/campo/CardTumulo.tsx`
- `src/app/painel/fila/` · `src/app/api/fila/`

**4 migrations novas** em `migrations/` (todas já aplicadas no Supabase)

Nenhum outro arquivo do projeto foi tocado.

---

## Já aplicado no banco (projeto `cemiterio`)

Estas migrations **já rodaram** no Supabase. Estão aqui só para o repositório
voltar a reproduzir o produto.

| Migration | Situação |
|---|---|
| `0047_roteiro_por_endereco.sql` | já estava aplicada |
| `0047b_cadencia_semanal.sql` | já estava aplicada |
| planta do cemitério (quadras + ruas) | **aplicada agora** |
| `0049_familia_tumulo_conta_corrente.sql` | **aplicada agora** |
| `0050_fila_liberacao.sql` | **aplicada agora** |
| família por cliente existente | **aplicada agora** |

### Estado atual do banco

- 4 quadras · 39 ruas com ordem de caminhada
- 65 clientes · 65 famílias, cada cliente já é responsável financeiro da sua
- 0 túmulos — zerados a seu pedido, prontos para o recadastro
- Backup do que foi apagado em `backup_20260816` (tumulos, planos, servicos,
  gps_leituras, quadras)

---

## Arquivos ALTERADOS

### `src/lib/agenda.ts`

A mudança mais importante do pacote. `ordenarPorProximidade` foi substituída
por `ordenarPorEndereco`.

O que havia: a rota do dia era calculada por vizinho-mais-próximo em lat/lng.
Dois defeitos que custavam caro no chão do cemitério. Primeiro, túmulo sem
coordenada ia para o **fim da fila**, solto, fora de qualquer rua — e a Nina
descobria isso andando. Segundo, o GPS não conhece muro: enxergava um túmulo
do outro lado da divisa como "logo ali" e mandava ela bater na parede.

Agora a ordem é a que ela realmente caminha: **rua (ordem cadastrada) →
posição na rua**. Com serpentina — ruas alternadas são percorridas ao
contrário, para ela emendar uma na outra em vez de voltar ao começo.

Túmulo ainda sem rua fecha o dia em ordem alfabética: é um aviso visível de
cadastro incompleto, não um item perdido no meio da lista.

Também mudaram os três `select` que buscam serviços, para trazerem
`rua_id`, `ordem_na_rua` e `ruas(ordem)`.

---

## Arquivos NOVOS

### `src/lib/rota.ts`

- `ordenarRota` — quadra → rua → posição, com serpentina
- `posicionarNaRua` — deriva a ordem do GPS do cadastro, projetando as
  coordenadas sobre o eixo da rua
- `encaixarPeloGps` — onde entra um túmulo novo. **Nenhum vizinho é
  renumerado, nunca**: o novo recebe o ponto médio entre os dois vizinhos
- `resumirDia` / `fraseDoDia` — "Quadra 1 — Ruas 3, 4 e 5"
- `gerarCodigo` — `Q1-R5-007`, baseado na **ordem de cadastro**, não na
  posição, para que o código nunca mude depois de impresso na ficha

### `src/lib/conta-corrente.ts`

Lavagem lança débito, pagamento lança crédito, o saldo diz se está em dia.

O débito nasce do **período devido**, não do serviço executado — a lavagem
pode falhar (foto não sobe, sem sinal, esqueceu de tocar no botão), e o
financeiro não pode ficar refém do operacional.

Avulso entra na mesma conta como débito único, sem competência.

`situacao()` devolve a frase que a Sureya lê: "Em dia", "Em aberto ·
R$ 240,00", "Pago adiantado". Nada de "inadimplente".

### `src/lib/mensagens.ts`

Os quatro textos com as variáveis preenchidas. **Nenhum modelo de linguagem é
chamado.** `primeiroNome` preserva o tratamento: "Sr. João Batista da Silva"
vira "Sr. João", não "Sr.".

### `src/app/campo/CardTumulo.tsx`

O card de dois toques: `📷 TIRAR FOTO E COMEÇAR` e `📷 TIRAR FOTO E TERMINAR`,
mais `Não deu para fazer`. Um toque abre a câmera direto; sem tela
intermediária, sem botão "salvar". Só um botão aparece por vez — não existe
escolha a fazer.

A foto vem **primeiro** no card porque é assim que a Nina reconhece o túmulo.

### `src/app/painel/fila/page.tsx` e `src/app/api/fila/route.ts`

A fila de liberação. A Sureya vê a prévia exata — fotos e texto já com o nome
preenchido —, pode editar, e escolhe enviar ou descartar. O envio abre o
WhatsApp com o texto pronto, então a mensagem sai da conta dela, com a cara
dela.

O `update` só age em registro `aguardando`, o que protege contra clique duplo
reenviando a mesma mensagem para a família.

---

## Telas desligadas (novo)

### `src/app/painel/ui.tsx` — menu de 12 para 8 itens

Ficaram: **Início · Agenda · Liberação · Avulsos · Campo · Famílias ·
Financeiro · Config**.

Saíram do menu: Atendimento e WhatsApp (o agente de IA foi desligado — no
lugar entrou a Liberação), Plaquetas (a plaquinha de 4 cm aprovada não tem QR)
e Jazigos (virou um bloco dentro da ficha da família, não sumiu).

### `src/middleware.ts` — as rotas desligadas devolvem 404

CRM de leads, reajustes, agente, atendimento, conversas, WhatsApp, mapa,
plaquetas, jazigos, planos, portal antigo, avaliações, indicações e o
resolvedor de QR.

**Por que 404 e não apenas sumir do menu:** link antigo, favorito no celular e
histórico do navegador continuam funcionando. Meio-desligado é pior que
ligado, porque ninguém sabe o que está no ar.

**Nada foi apagado.** O código continua no repositório, os dados continuam no
banco. Religar é tirar a linha da lista `DESLIGADAS`.

### `src/app/painel/page.tsx` — links órfãos removidos

O card "esperando resposta" agora aponta para a Liberação; o aviso de leads
novos saiu; o card de rascunhos aponta para a fila.

---

## Cadastro em campo alinhado à estrutura nova (build mais recente)

**Era a peça que faltava antes do recadastro.** O cadastro ainda criava quadra
por texto livre — foi exatamente assim que quatro quadras viraram treze
(`QD 1`, `Q1`, `Qd 1`, `Q01`, `Quadra 1` eram o mesmo lugar). E não preenchia
`rua_id`, `ordem_na_rua` nem `codigo`, então o roteiro novo não funcionaria.

### `src/app/api/tumulos/route.ts`
- Quadra **escolhida da lista**, nunca criada por digitação. Se o código não
  existe, a resposta devolve as quadras disponíveis.
- Rua obrigatória e validada contra a tabela `ruas`.
- `ordem_na_rua` calculada pelo GPS via `encaixarPeloGps` — o novo entra
  **entre** os vizinhos certos, sem renumerar nenhum.
- `codigo` gerado a partir do contador `ruas.seq_cadastro`.

### `src/app/campo/CapturarJazigo.tsx`
Quadra e rua viraram **listas suspensas**. Trocar de quadra recarrega as ruas
e limpa a escolha, porque a "Rua 5" da Quadra 1 e a da Quadra 2 são trechos
físicos diferentes.

### `src/app/api/ruas/route.ts` (novo)
Lista as ruas de uma quadra, na ordem de caminhada.

### `src/app/api/tumulos/[id]/gps/route.ts`
Recalcula a posição do túmulo quando a coordenada chega **depois** do
cadastro. Sem isso, quem salva a ficha e só então marca o GPS ficaria no fim
da rua para sempre. Se o recálculo falhar, o GPS continua salvo — é melhoria,
não requisito.

---

## Falta ligar

0. **Publicar no Vercel.** O que está no ar hoje é o código antigo — nada
   deste pacote aparece antes do deploy.
1. **`CardTumulo` no `campo/page.tsx`** — o componente está pronto, mas a
   página ainda usa `ConfirmarJazigo` + `Concluir`. Trocar os dois pelo card.
3. **Quem cria o rascunho** — chamar `rascunhoDaLavagem` (de `mensagens.ts`)
   quando o serviço é concluído, inserindo em `fila_liberacao`.
4. **Cron da competência** — chamar `gerarCompetenciaDoMes` no dia 1. A trava
   contra cobrança dupla já está no banco.
5. **Esconder as telas que saem** (CRM, IA, mapa, plaquetas QR, portal antigo).

---

## Testado

Os três módulos de `lib/` passam no `tsc --strict` sem erro. A lógica foi
executada: serpentina, encaixe sem renumerar vizinhos, ciclos de cobrança
diferentes na mesma família, avulso somando na conta, pagamento a maior
virando crédito, e os textos preenchidos.

O `agenda.ts` foi conferido por inspeção — nenhuma referência à função antiga
sobrou, e as chaves fecham. Como ele depende de dezenas de módulos do projeto,
rode `npm run build` no seu ambiente para a checagem completa.
