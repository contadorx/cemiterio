# Sureya — Fatia 2: IA atendente no WhatsApp

Camada que recebe a mensagem do cliente, monta o contexto **daquele contato**, chama a IA
e decide: **enviar sozinha** (rotineiro + cliente no automático + score alto) ou **virar
rascunho** no painel pra uma pessoa aprovar. Luto, reclamação, cancelamento e preço
**nunca** saem sozinhos.

## Ordem de aplicação
1. Aplique `0001_sureya_schema.sql` e `0002_planos_flex_e_score.sql` (nessa ordem) numa branch do Supabase.
2. Suba os arquivos deste zip no projeto Next.js (mescla em `src/`).
3. Configure as variáveis abaixo na Vercel e no `.env.local`.
4. Aponte o webhook do Evolution para o endpoint.

## Variáveis de ambiente
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # só servidor, nunca no client
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5      # trocável (haiku p/ baratear, opus p/ delicadeza)
EVOLUTION_API_URL=https://api.contatia.com.br   # ou a instância da Sureya
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=sureya
SUREYA_ORG_ID=<uuid da org na tabela orgs>
SUREYA_WEBHOOK_SECRET=<segredo forte>
SUREYA_SCORE_LIMITE_AUTO=80          # 0-100; abaixo disso, sempre rascunho
```

## Config do Evolution API
Aponte o webhook da instância para:
```
POST  https://<seu-dominio>/api/webhook/evolution?secret=<SUREYA_WEBHOOK_SECRET>
```
Eventos: **messages.upsert**. (O handler ignora sozinho: mensagens próprias, grupos e vazias.)

## Build (validação local, env fake)
```
NEXT_PUBLIC_SUPABASE_URL="https://fake.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="fake" npm run build
```

## O fluxo, em uma passada
```
WhatsApp -> Evolution -> /api/webhook/evolution
  |-- telefone bate em cliente ativo?  não -> IA muda (silêncio)   [allowlist]
  |-- grava mensagem de entrada
  |-- conversa já escalada a humano?   sim -> IA cala
  |-- monta contexto do contato (perfil, saldo, próximo/último serviço, túmulos, instruções)
  |-- IA responde (ferramenta "responder": assunto, resposta, sensivel, precisa_humano)
  |-- sensível (luto/reclamação/preço/cancelamento/imagem)? -> RASCUNHO + escala
  |-- automático (modo=auto & score>=limite & rotineiro)?  -> ENVIA e loga 'enviou_direto'
  |-- senão -> RASCUNHO no painel
```

## Como o contato "vai pro automático com o tempo"
O score é real: nasce do que a **pessoa** faz com cada rascunho, no painel, via
`POST /api/atendimento/aprovar`:
- **aprovou** (enviou como estava) -> score sobe
- **editou** (corrigiu e enviou) -> sobe pela metade
- **descartou** -> desce

Média móvel (α=0.25) na coluna `clientes.score`. Quando passa de `SUREYA_SCORE_LIMITE_AUTO`,
os assuntos **rotineiros** daquele contato passam a sair sozinhos — luto e reclamação
continuam sempre em copiloto, por regra dura, não por score.

Para colocar um contato no automático, além do score alto, o cliente precisa estar em
`modo='automatico'`. Começe todo mundo em `copiloto` (default do schema).

## Treinar "contato a contato"
- `clientes.instrucoes_ia` = instruções manuais daquele contato (têm prioridade no prompt).
- `clientes.perfil_ia` = memória destilada do histórico (a carga do histórico da fatia de
  onboarding preenche isto; cada atendimento novo vai atualizando).

## Fora desta fatia (próximas)
- **0003** leitura do comprovante de Pix (hoje imagem = escala pra humano) + conciliação + saldo automático.
- **0004** app da Nina + alocador do dia + carga × capacidade.
- **0005** temperatura de aumento + rascunho de reajuste.
- **Painel** (telas de rascunhos/conversas/fichas) entra junto da 0003/0004 — os endpoints já estão prontos pra ele.

## Aviso operacional
Rodar bot automático no número pessoal da atendente tem risco de ToS do WhatsApp, e ela
precisa saber que aquele número está sendo "ouvido". A allowlist (telefone = cliente
cadastrado) é a proteção: fora dela, silêncio total.
