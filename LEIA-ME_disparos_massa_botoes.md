# Sureya — Chave de disparos, seleção em massa e UX dos botões

Três frentes nesta entrega. Nenhuma depende de Supabase configurado por mim — você
publica e roda a migration como sempre.

## 1) Rode a migration ANTES de publicar
Arquivo à parte: **`0024_disparos_ativos.sql`** (também está dentro de
`sureya-app/migrations/`). Rode no SQL do Supabase.

Ela adiciona `orgs.disparos_ativos boolean not null default false`.
**Começa DESLIGADO** — nada dispara sozinho até você ligar de propósito.

> Se publicar o código sem rodar a migration, a tela lê o estado como "desligado"
> (fail-safe) e ligar dá erro ao salvar. Rode a migration primeiro.

## 2) Chave liga/desliga dos disparos automáticos
Nova seção no topo de **Config** (sempre visível, acima das abas) + uma **faixa
vermelha em todas as telas do painel** enquanto estiver desligado, com atalho "Ligar".

**Desligado (padrão) bloqueia só o automático:**
- a IA não responde sozinha — a resposta vira **rascunho para você aprovar**;
- a fila de reenvio e os avisos/convites automáticos ficam **parados**.

**Continua funcionando:**
- mensagens dos clientes **entram normalmente**;
- suas **respostas manuais** pelo painel **saem normalmente**.

Ao religar, a fila que ficou parada volta a sair sozinha. Cada liga/desliga fica
registrado na **Auditoria** (quem e quando).

Onde foi mexido: `orgs.disparos_ativos` (banco) · `src/lib/disparos.ts` (leitura com
cache de 15s, fail-safe = desligado) · gate na resposta automática da IA
(`src/lib/atendimento.ts`) e na fila de reenvio (`src/lib/envio.ts`) ·
rota `GET/PUT /api/config/disparos` · toggle na Config e faixa no `ui.tsx`.

## 3) Seleção em massa nas Conversas
Caixa de marcar em cada conversa + **"Selecionar todas"** (as visíveis do filtro) +
barra de ação que aparece ao selecionar: **Resolver · Arquivar · Excluir**
(na aba Arquivadas, vira **Reabrir · Excluir**). Excluir pede confirmação e apaga as
mensagens — o **histórico financeiro não é tocado**. Recados de equipe ficam de fora
da seleção, igual às ações por item.

Nova rota `POST /api/conversas/acao-massa` (espelha a ação por item, sem divergência).

## 4) UX dos botões — a causa dos "tamanhos distintos"
Dois problemas resolvidos na fonte, no `src/app/painel/ui.tsx`:

- **Link/`<a>` estilizado como botão** não recebia altura (o `minHeight` é ignorado
  em elemento em linha) — por isso o "Abrir" ficava mais baixo que o "Resolver" ao
  lado. Agora todo botão tem uma base comum (`inline-flex` + centralização +
  `box-sizing`), então `<button>`, `<a>` e `<Link>` ficam **idênticos**.
- **Cada tela inventava um padding** de botão pequeno ("4px 10px", "6px 12px",
  "8px 14px"…). Criei **um tamanho compacto oficial** — `botaoMini`, `botaoMiniSec`,
  `botaoMiniPerigo` — e troquei **todos os ~22 pontos** que improvisavam padding
  (agenda, config, clientes, financeiro, planos, agente, conversas).

Como usar daqui pra frente: botão normal = `painel.botao` / `botaoSec` /
`botaoPerigo`; botão pequeno de linha de ação = `painel.botaoMini*`. **Não** volte a
sobrescrever `padding` — se precisar de um tamanho novo, crie um token no `ui.tsx`.

## Como publicar
1. Rode `0024_disparos_ativos.sql` no Supabase.
2. Substitua os arquivos pelo conteúdo de `sureya-app/` (GitHub Desktop → Vercel).
3. Confira: a faixa vermelha aparece (está desligado). Termine a migração/quadras,
   depois **Config → Ligar disparos**.

Build validado aqui com env fake (`next build` ok, tipos e lint sem erro).
