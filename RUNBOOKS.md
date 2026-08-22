# Runbooks — o que fazer quando

**Build 6, entrega 7.** Escrito em 22/08/2026.

Cada procedimento aqui foi escrito para ser executado **por quem não escreveu o
sistema**, às onze da noite, com o celular na mão. Se um passo exigir julgamento
técnico, ele diz isso e diz a quem ligar.

> **O que está ensaiado e o que não está.** A restauração (§4) e o rollback de
> migration (§2.3) **nunca foram testados neste ambiente** — estão escritos a
> partir de como o sistema é montado. O critério de saída do Build 6 pede que
> sejam ensaiados; ensaiar é o passo que falta.

---

## 0. O mapa

| Peça | Onde | Sinal de que caiu |
|---|---|---|
| Aplicação | Vercel | site não abre |
| Banco + Storage | Supabase (`ymftitdusechmsnpcpsj`) | site abre, tudo dá erro |
| WhatsApp | Evolution API | fila não envia |
| Rotinas | Vercel Cron (5 agendamentos) | agenda não gera, cobrança não lança |

Os cinco crons: `minuto` (a cada minuto), `diario` 9h, `convites` 13h,
`perfis` 6h, `mensal` dia 1 às 11h. **Horário do servidor é UTC** — 9h no cron é
6h da manhã em Brasília.

---

## 1. Deploy

### 1.1 Antes

```bash
npm ci
npm run ci          # checar → tipos → testar → migrar-limpo → build
```

`npm run ci` reconstrói o banco do zero a partir das migrations e compara com
produção. **Se ele falhar, não faça deploy** — não importa o quanto pareça
pequeno o que falhou.

### 1.2 A ordem que importa

**Migration primeiro, código depois** — quando a migration só acrescenta.
**Migration e código juntos** — quando ela renomeia coluna ou muda assinatura de
função.

Como saber em qual caso você está: se a migration tem `rename`, `drop column`,
ou `drop function ... create` com assinatura diferente, é do segundo tipo. O
cabeçalho de cada migration diz isso em texto.

> Exemplo real: a `0073` renomeou `movimento_id` para `lancamento_id` em três
> tabelas. Rodar ela sem publicar o código quebraria a tela de entradas na hora.

### 1.3 Aplicar migration

Cole no SQL Editor do Supabase, **um arquivo por vez, na ordem numérica**.

**Exceção:** arquivos que dizem "RODA SOZINHO" no cabeçalho (`0047b`, `0065`,
`0069`, `0076`) contêm `alter type ... add value`, que não roda dentro de
transação — e o editor envolve o que você cola em uma. Cole **só aquele
arquivo**, sem nada antes nem depois.

Depois de cada uma, rode o bloco de conferência que vem no fim do arquivo.

---

## 2. Rollback

### 2.1 Código

Vercel → Deployments → a versão anterior → **Promote to Production**. Leva
segundos e não toca no banco.

### 2.2 Quando o código volta mas a migration ficou

Este é o caso perigoso. Migration aditiva (coluna nova, função nova) **não
atrapalha** código antigo — deixe onde está.

O problema é migration que renomeia. Se você voltou o código e a `0073` está
aplicada, a tela de entradas procura `movimento_id` e o banco tem
`lancamento_id`. Duas saídas:

- **preferida:** publicar o código novo de novo (o rollback foi o erro);
- **último caso:** reverter a migration pelo bloco ROLLBACK do cabeçalho dela.

### 2.3 Reverter uma migration

Todo arquivo tem uma seção `ROLLBACK` no fim dizendo o que desfazer. Não é
automático e não deve ser: reverter dinheiro exige alguém olhando.

**Nunca reverta** `0065`, `0069` ou `0076` — não se remove valor de enum no
PostgreSQL, e o código depende deles.

---

## 3. Rotação de segredos

Variáveis, do mais crítico ao menos:

| Variável | Se vazar |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **acesso total ao banco, ignorando RLS.** Rotacione imediatamente |
| `EVOLUTION_API_KEY` | manda WhatsApp pela linha da casa |
| `CRON_SECRET` | dispara as rotinas de fora |
| `SUREYA_WEBHOOK_SECRET` | injeta mensagem falsa pelo webhook |
| `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` | custo |
| `VAPID_PRIVATE_KEY` | manda notificação push |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | já é pública por desenho; protegida por RLS |

### Procedimento

1. Gere a nova no serviço (Supabase → Settings → API; Evolution → painel).
2. Vercel → Settings → Environment Variables → atualize.
3. **Redeploy** — variável nova não entra em deploy antigo.
4. Confira: abra o painel, abra a fila, veja se o WhatsApp aparece conectado.
5. Só então revogue a antiga.

### Atenção: hoje dois segredos aceitam query string

Conferi antes de escrever isto, porque ia afirmar o contrário:

```
src/lib/cron-auth.ts:10
  auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret

src/app/api/webhook/evolution/route.ts:80
  req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret")
```

Os dois preferem o header, **mas aceitam `?secret=...` como alternativa**. Query
string vai parar em log de servidor, log de proxy e histórico de navegador — que
é onde segredo não deve estar. É o item que ficou em aberto desde o Build 1.

**Enquanto isso não for fechado:** nunca chame esses endpoints com `?secret=`
manualmente, nem cole uma URL dessas em lugar nenhum. O Vercel Cron já usa o
header sozinho (`Authorization: Bearer`), então as rotinas não dependem da query
string.

**Para fechar:** tirar o `|| searchParams.get("secret")` das duas linhas. Não
está feito porque a Evolution pode estar configurada para chamar o webhook com
`?secret=` — mudar sem conferir isso derruba o recebimento de mensagem. Confira
a configuração do webhook na Evolution primeiro, e aí é uma linha em cada
arquivo.

---

## 4. Restauração — NÃO ENSAIADA

Supabase mantém backup automático (a janela depende do plano; confira em
Database → Backups).

1. Supabase → Database → Backups → escolha o ponto.
2. **Restaure para um projeto NOVO**, nunca por cima do que está de pé.
3. Aponte um ambiente de teste para ele e confira: quantas famílias, quantos
   lançamentos, o saldo total.
4. Só depois de conferir, decida se troca a produção.

**O Storage não vem no backup do banco.** As fotos são outra coisa e precisam de
cópia própria. Hoje **não há** rotina de cópia do Storage — é um buraco
conhecido, e as 409 fotos existentes não têm segunda via.

**Ensaie isto antes do piloto.** Backup nunca testado é backup que não existe.

---

## 5. Incidente

### 5.1 O site não abre

Vercel → Deployments → veja se o último falhou. Se falhou, **Promote** o
anterior (§2.1). Se está verde, o problema é o Supabase — veja status.supabase.com.

### 5.2 O WhatsApp parou

A fila avisa no topo quando a instância cai. Vá em `/painel/whatsapp` e reconecte
(QR code). **As mensagens não se perdem** — ficam em `aguardando` e saem quando
a conexão voltar.

Se uma mensagem ficou presa em "enviando", a tela da fila devolve sozinha depois
de 10 minutos, ao ser aberta.

### 5.3 As rotinas pararam

Sintoma: agenda sem gerar, cobrança do mês sem lançar. Vercel → Cron Jobs → veja
a última execução. Para adiantar à mão, a tela de fechamento tem o botão de
lançar a cobrança do período.

### 5.4 Os números não batem

1. `/painel/fechamento` → o funil mostra o que está pendente e onde resolver;
2. `select * from sureya_alertas;` → o que precisa de alguém agora;
3. `select * from sureya_lavagens_incompletas;` → limpeza com efeito faltando.

Uma lavagem com efeito faltando **se repara chamando `sureya_concluir_lavagem`
de novo com o mesmo id** — a função é convergente: confere cada efeito e cria o
que faltar, sem duplicar.

### 5.5 Suspeita de vazamento de dados

1. Rotacione `SUPABASE_SERVICE_ROLE_KEY` **primeiro** (§3);
2. Supabase → Logs → procure acesso fora do horário ou de IP desconhecido;
3. Anote **o que** pode ter vazado, olhando `POLITICA_DADOS.md` §2;
4. A parte legal — prazo de comunicação à ANPD e à família — **está em aberto**
   (`POLITICA_DADOS.md` §8). Resolva isso antes do piloto, não durante um
   incidente.

---

## 6. Operar sem integração

Critério de saída do Build 6: *"responsável consegue operar manualmente durante
indisponibilidade de integração"*.

| Caiu | Dá para trabalhar? |
|---|---|
| WhatsApp | **sim.** A fila guarda tudo; envie do próprio celular se for urgente e descarte o item na fila para não sair duas vezes |
| IA (Anthropic/Groq) | **sim.** Os rascunhos ficam mais secos; a fila continua funcionando |
| Vercel Cron | **sim.** Fechamento tem botão manual; a agenda pode ser gerada pela tela |
| Supabase | **não.** É o sistema |

O ponto de atenção: se mandar do celular **e** o item continuar na fila, alguém
vai reenviar. Descarte na fila logo depois — e o desfazer existe se errar.

---

## 7. O que falta ensaiar

- [ ] restaurar um backup em projeto separado e conferir os números (§4);
- [ ] rotina de cópia do Storage — hoje não existe;
- [ ] rollback de uma migration num ambiente de teste (§2.3);
- [ ] simular queda da Evolution no meio de um envio com várias fotos, e
      confirmar na tela que a retomada não repete o que já saiu;
- [ ] conferir como a Evolution chama o webhook e, se for por header, remover o
      `|| searchParams.get("secret")` das duas linhas (§3).
