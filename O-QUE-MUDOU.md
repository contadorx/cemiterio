# O que mudou — Zelo & Memória

Pacote no mesmo formato do `src.zip` original: a pasta `src/` completa, pronta
para substituir a sua, mais as `migrations/`.

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

## Falta ligar

1. **`CardTumulo` no `campo/page.tsx`** — o componente está pronto, mas a
   página ainda usa `ConfirmarJazigo` + `Concluir`. Trocar os dois pelo card.
2. **Link da fila no menu do painel** — a tela existe em `/painel/fila`.
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
