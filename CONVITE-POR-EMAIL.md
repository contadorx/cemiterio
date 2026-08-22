# O convite por e-mail — o que rodar e o que configurar

O aplicativo passou a oferecer, no fim do uso, mandar o **endereço da ferramenta**
para um colega por e-mail. Antes era um `mailto:`, que depende de haver um cliente
de e-mail configurado na máquina — em computador corporativo com webmail, o clique
abria o Outlook que ninguém usa, ou não abria nada.

Agora quem manda somos nós. **Isso muda uma coisa na história de privacidade**, e a
página de privacidade passou a dizer: o endereço de quem vai receber o convite
passa pelo nosso servidor. Nada mais passa — nem vídeo, nem transcrição, nem
documento. Continua valendo, ao pé da letra, que o material de quem grava não sai
da máquina dele.

Sem as variáveis abaixo, **o endereço responde 503 e o aplicativo cai no `mailto:`
sozinho**, dizendo por quê. Nada quebra enquanto isto não estiver configurado.

---

## 1. O SQL, para colar no Supabase

Supabase → SQL Editor → cole tudo e rode.

```sql
-- A contagem de convites. Nem o IP nem o endereço de destino são guardados:
-- só um hash com sal do ambiente. Dá para contar sem dar para saber de quem é,
-- e a tabela vazada não permite testar "este e-mail está aqui?" com dicionário.
create table if not exists public.convite_envio (
  id          bigserial primary key,
  ip_hash     text        not null,
  para_hash   text        not null,
  criado_em   timestamptz not null default now()
);

create index if not exists convite_envio_ip_idx   on public.convite_envio (ip_hash, criado_em desc);
create index if not exists convite_envio_para_idx on public.convite_envio (para_hash, criado_em desc);

-- Ninguém lê esta tabela pelo navegador. Nem para contar.
alter table public.convite_envio enable row level security;

-- Confere os dois limites E registra, na mesma transação.
--
-- Numa função só, de propósito: conferir num lugar e registrar em outro abre a
-- janela entre os dois — dois pedidos simultâneos passariam pela conferência
-- antes de qualquer um deles registrar, e o limite viraria decoração.
--
--   5 por hora por origem   — o teto de quem está usando de verdade
--   2 por dia por destino   — o que impede usar o convite para incomodar alguém
create or replace function public.walkstamp_convite_pode(p_ip text, p_para text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ip   int;
  n_para int;
begin
  select count(*) into n_ip
    from public.convite_envio
   where ip_hash = p_ip and criado_em > now() - interval '1 hour';
  if n_ip >= 5 then return false; end if;

  select count(*) into n_para
    from public.convite_envio
   where para_hash = p_para and criado_em > now() - interval '1 day';
  if n_para >= 2 then return false; end if;

  insert into public.convite_envio (ip_hash, para_hash) values (p_ip, p_para);
  return true;
end;
$$;

-- Regra de servidor, e só de servidor. O mesmo tratamento das outras: se o
-- navegador pudesse chamar, bastaria chamar com hashes inventados para zerar o
-- limite a cada pedido.
revoke all on function public.walkstamp_convite_pode(text, text) from public, anon, authenticated;
grant execute on function public.walkstamp_convite_pode(text, text) to service_role;
```

### A faxina desta tabela

A contagem não precisa de memória longa: o limite maior é de um dia. Rode junto
com a faxina que já existe, ou como um cron do próprio Supabase:

```sql
delete from public.convite_envio where criado_em < now() - interval '7 days';
```

Sete e não um: uma janela de folga ajuda a investigar um pico de abuso sem
guardar nada que identifique alguém.

---

## 2. As variáveis de ambiente, na Vercel

| variável | o que é | se faltar |
|---|---|---|
| `BREVO_API_KEY` | a chave do Brevo (Settings → SMTP & API → API keys) | 503 → o app cai no `mailto:` |
| `EMAIL_DE` | o remetente, ex.: `ola@walkstamp.com` | 503 |
| `EMAIL_DE_NOME` | o nome que aparece, ex.: `Walkstamp` | usa "Walkstamp" |
| `CONVITE_SAL` | um texto longo e aleatório, o sal dos hashes | usa o `CRON_SECRET`; sem nenhum dos dois, 503 |
| `CONVITE_DE` | forma antiga do remetente, `Nome <endereço>` — continua aceita | — |
| `SUPABASE_SERVICE_ROLE_KEY` | já existe, para a conta | 503 |
| `SUPABASE_URL` | já existe | 503 |

**O sal não pode mudar depois de entrar em produção.** Trocar o sal reescreve
todos os hashes, e as contagens do último dia se perdem — não é grave, mas é bom
saber por que os limites "zeraram sozinhos".

### O domínio, no Brevo

Antes de a primeira mensagem chegar em caixa de entrada e não em spam:

1. Brevo → **Senders, Domains & Dedicated IPs** → adicione `walkstamp.com`;
2. cole no DNS os registros que ele der (DKIM e o `dmarc`, além do SPF);
3. espere autenticar — costuma levar minutos, às vezes horas.

> ⚠️ **SPF: um registro, não dois.** A HostGator já criou o dela quando você
> criou a primeira caixa. O Brevo vai pedir um `include:`. Dois TXT de SPF no
> mesmo nome é **erro permanente** pela especificação — o servidor que recebe
> descarta os dois, e a sua autenticação some inteira. Junte num só.
>
> DKIM não tem esse problema: os seletores são diferentes e convivem.

Enquanto o domínio não estiver autenticado, o e-mail sai mas cai em spam com
frequência alta. Isso é útil para testar e é ruim em produção.

---

## 3. O que este endereço aceita, e por quê tão pouco

`POST /api/convite` recebe **três coisas**: o e-mail de destino, um primeiro nome
e o nome de quem indica. Não há campo de mensagem.

Isso é deliberado. Um endereço que manda e-mail com texto livre usando o nosso
remetente é um envelope aberto: o conteúdo é de quem chamou e a reputação
queimada é a nossa. Com o corpo escrito no servidor, o pior uso possível é
alguém disparar convites do Walkstamp — chato, limitado a dois por destino por
dia, e sem valor nenhum para quem manda spam.

As cinco travas estão comentadas em `app/api/convite/route.ts`. A que mais
importa está lá em cima: **faltando qualquer segredo, o endereço recusa em vez
de abrir**.

---

## 4. Como conferir que ficou de pé

```bash
# 503 enquanto faltar variável — e é isso que se espera antes de configurar
curl -i -X POST https://walkstamp.com/api/convite \
  -H 'content-type: application/json' -H 'origin: https://walkstamp.com' \
  -d '{"para":"voce@exemplo.com","lang":"pt"}'

# 403 sem a origem certa: só o nosso próprio site chama este endereço
curl -i -X POST https://walkstamp.com/api/convite \
  -H 'content-type: application/json' \
  -d '{"para":"voce@exemplo.com"}'

# 429 no sexto pedido da mesma hora
```

E, no aplicativo: gere qualquer documento, o convite aparece, digite um e-mail e
mande. Se o servidor não responder, o botão vira "abrir o meu programa de
e-mail" — e diz por quê.
