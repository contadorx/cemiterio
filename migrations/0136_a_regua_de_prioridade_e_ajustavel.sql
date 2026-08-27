-- 0136 — A RÉGUA DE PRIORIDADE VIRA CONFIGURAÇÃO, E PASSA A SE EXPLICAR.
--
-- O QUE HAVIA
--
-- Um número só: `servicos.prioridade`, que subia +15 a cada "não deu para
-- fazer". O alocador ordenava por ele. Nada mais no mundo levantava prioridade
-- — nem a família que ligou pedindo, nem a data de memória chegando, nem o
-- contrato novo que nunca foi lavado.
--
-- E ele era MUDO: "este veio na frente" sem dizer por quê.
--
-- O QUE EU MEDI EM 27/08, ANTES DE ESCOLHER OS CRITÉRIOS
--
--   nunca foi lavado ............ 80 jazigos   <- o único com volume real
--   atrasado ..................... 1
--   ficou para depois ............ 0
--   a família pediu .............. 0
--   data de memória chegando ..... 0  (nenhum dos 62 falecidos tem data)
--
-- Cinco dos seis dariam zero hoje. Isso não os torna errados — torna a tela de
-- configuração obrigada a DIZER quantos cada um alcança, senão o Leandro
-- ajustaria peso no escuro. A tela mostra o alcance ao lado do peso.
--
-- POR QUE TABELA E NÃO COLUNAS EM `orgs`
--
-- Critério novo vira uma LINHA, não uma migração de coluna mais uma tela nova.
-- E a linha carrega o texto que explica o critério para quem vai ajustar.

begin;

-- ---------------------------------------------------------------- 1
create table if not exists prioridade_regua (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  criterio    text not null,
  peso        int  not null default 0,
  ativo       boolean not null default true,
  ordem       int  not null default 0,
  -- O texto que a tela mostra. Mora aqui e não no código para o critério novo
  -- não exigir deploy: quem cria a linha escreve o que ela quer dizer.
  rotulo      text not null,
  explicacao  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint prioridade_regua_criterio_unico unique (org_id, criterio),
  -- Peso negativo REBAIXA de propósito (dá para mandar um caso para o fim da
  -- fila). O teto existe para um dedo errado não zerar a ordem inteira.
  constraint prioridade_regua_peso_sensato check (peso between -200 and 200)
);

alter table prioridade_regua enable row level security;

-- UMA POLICY RESTRITIVA POR COMANDO (lição da 0079: DELETE nunca consulta
-- `with check`, então a porta do delete precisa da sua própria `using`).
drop policy if exists prioridade_regua_sel on prioridade_regua;
drop policy if exists prioridade_regua_ins on prioridade_regua;
drop policy if exists prioridade_regua_upd on prioridade_regua;
drop policy if exists prioridade_regua_del on prioridade_regua;

create policy prioridade_regua_sel on prioridade_regua as restrictive
  for select using (org_id = current_org_id());
create policy prioridade_regua_ins on prioridade_regua as restrictive
  for insert with check (org_id = current_org_id());
create policy prioridade_regua_upd on prioridade_regua as restrictive
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy prioridade_regua_del on prioridade_regua as restrictive
  for delete using (org_id = current_org_id());

create policy prioridade_regua_tudo on prioridade_regua
  for all using (true) with check (true);

-- ---------------------------------------------------------------- 2
-- OS SEIS CRITÉRIOS, com os pesos que eu proponho.
--
-- A escala é de pontos que se SOMAM. Um jazigo nunca lavado (25) e atrasado
-- duas semanas (2 x 10) fica com 45, à frente de um adiado uma vez (15).
--
-- Por que memória é o mais alto: é o único com PRAZO FATAL. A família visita
-- no dia, e o dia não se remarca. Um pedido normalmente aceita dois dias.
--
-- Convergente: `on conflict do nothing`. Rodar de novo não desfaz o ajuste que
-- o Leandro tiver feito na tela — que é o ponto de a régua ser configuração.
insert into prioridade_regua (org_id, criterio, peso, ordem, rotulo, explicacao)
select o.id, v.criterio, v.peso, v.ordem, v.rotulo, v.explicacao
  from orgs o
 cross join (values
   ('memoria_proxima', 40, 1, 'Data de memória chegando',
    'Aniversário de nascimento ou de falecimento nos próximos dias. É o único critério com prazo fatal: a família visita no dia, e o dia não se remarca.'),
   ('pedido_da_familia', 30, 2, 'A família pediu',
    'Alguém pediu esta lavagem — não veio do contrato. Quem pede está esperando.'),
   ('nunca_lavado', 25, 3, 'Nunca foi lavado',
    'Contrato novo que ainda não teve a primeira lavagem. É quando a família está formando opinião sobre o serviço.'),
   ('adiado', 15, 4, 'Ficou para depois (por vez)',
    'Some a cada vez que a lavagem não deu para fazer. Promessa que a operação fez a si mesma e não cumpriu.'),
   ('atrasado_semana', 10, 5, 'Atrasado (por semana)',
    'Passou da data prevista. Acumula por semana de atraso.'),
   ('sem_lavar_ha_muito', 5, 6, 'Faz tempo desde a última (por mês além do ciclo)',
    'O túmulo passou do intervalo combinado. Acumula por mês além do ciclo.')
 ) as v(criterio, peso, ordem, rotulo, explicacao)
on conflict (org_id, criterio) do nothing;

-- ---------------------------------------------------------------- 2b
-- A ORG QUE NASCER AMANHÃ TAMBÉM PRECISA DA RÉGUA.
--
-- O `insert ... from orgs` acima semeia as orgs que existem HOJE. Uma org
-- criada depois nasceria com a tabela vazia — e a régua não faria nada, em
-- silêncio: `sureya_prioridade_calculada` não acha peso nenhum, devolve zero
-- para todo mundo, e a rota sai ordenada só por quadra e rua como antes.
--
-- Ninguém veria. Não dá erro, não aparece em log, e a agenda continua saindo.
--
-- QUEM ACHOU FOI O TESTE: `testes/regua_prioridade.sql` cria uma org sua e
-- reprovou com "a regua nasce com os seis criterios: vieram 0". Era para ser
-- só um fixture.
create or replace function sureya_semear_regua_prioridade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into prioridade_regua (org_id, criterio, peso, ordem, rotulo, explicacao)
  select new.id, v.criterio, v.peso, v.ordem, v.rotulo, v.explicacao
    from (values
     ('memoria_proxima', 40, 1, 'Data de memória chegando',
      'Aniversário de nascimento ou de falecimento nos próximos dias. É o único critério com prazo fatal: a família visita no dia, e o dia não se remarca.'),
     ('pedido_da_familia', 30, 2, 'A família pediu',
      'Alguém pediu esta lavagem — não veio do contrato. Quem pede está esperando.'),
     ('nunca_lavado', 25, 3, 'Nunca foi lavado',
      'Contrato novo que ainda não teve a primeira lavagem. É quando a família está formando opinião sobre o serviço.'),
     ('adiado', 15, 4, 'Ficou para depois (por vez)',
      'Some a cada vez que a lavagem não deu para fazer. Promessa que a operação fez a si mesma e não cumpriu.'),
     ('atrasado_semana', 10, 5, 'Atrasado (por semana)',
      'Passou da data prevista. Acumula por semana de atraso.'),
     ('sem_lavar_ha_muito', 5, 6, 'Faz tempo desde a última (por mês além do ciclo)',
      'O túmulo passou do intervalo combinado. Acumula por mês além do ciclo.')
    ) as v(criterio, peso, ordem, rotulo, explicacao)
  on conflict (org_id, criterio) do nothing;
  return new;
end $$;

drop trigger if exists tg_semear_regua_prioridade on orgs;
create trigger tg_semear_regua_prioridade
  after insert on orgs
  for each row execute function sureya_semear_regua_prioridade();

-- ---------------------------------------------------------------- 3
-- A PRIORIDADE CALCULADA, COM O PORQUÊ.
--
-- Devolve os pontos E os motivos. A prioridade era um número mudo; agora a
-- agenda pode dizer "este veio na frente porque nunca foi lavado (25) e está
-- atrasado 2 semanas (20)".
--
-- `p_org` EXPLÍCITO: `current_org_id()` é nulo fora de uma sessão de usuário,
-- e o alocador roda no cron (lição da 0103, que já custou a régua de cobrança).
create or replace function sureya_prioridade_calculada(p_org uuid)
returns table(servico_id uuid, pontos int, motivos text[])
language sql
stable
security definer
set search_path to 'public'
as $$
  with peso as (
    select criterio, peso from prioridade_regua
     where org_id = p_org and ativo
  ),
  p as (
    select
      coalesce((select peso from peso where criterio='memoria_proxima'), 0)    w_memoria,
      coalesce((select peso from peso where criterio='pedido_da_familia'), 0)  w_pedido,
      coalesce((select peso from peso where criterio='nunca_lavado'), 0)       w_novo,
      coalesce((select peso from peso where criterio='adiado'), 0)             w_adiado,
      coalesce((select peso from peso where criterio='atrasado_semana'), 0)    w_atraso,
      coalesce((select peso from peso where criterio='sem_lavar_ha_muito'), 0) w_velho
  ),
  base as (
    select
      s.id,
      s.tumulo_id,
      coalesce(s.adiado_vezes, 0) adiados,
      s.origem::text = 'pedido' eh_pedido,
      -- Atraso em SEMANAS INTEIRAS: um dia de atraso não é a mesma coisa que
      -- uma semana, e arredondar para cima faria todo mundo atrasado no dia
      -- seguinte.
      greatest(0, floor((current_date - s.data_prevista) / 7.0)::int) semanas_atraso,
      not exists (
        select 1 from servicos x
         where x.tumulo_id = s.tumulo_id and x.status = 'executado'
      ) nunca_lavado,
      -- MEMÓRIA: `datas_gatilho` é um jsonb de {tipo, data:'MM-DD'}. Compara
      -- só mês e dia, porque o aniversário volta todo ano.
      exists (
        select 1
          from jsonb_array_elements(coalesce(t.datas_gatilho, '[]'::jsonb)) g
         where right(g->>'data', 5) ~ '^\d{2}-\d{2}$'
           and (
             -- dentro dos próximos 10 dias, virando o ano
             (to_date(to_char(current_date,'YYYY') || '-' || right(g->>'data',5), 'YYYY-MM-DD')
                between current_date and current_date + 10)
             or
             (to_date(to_char(current_date + interval '1 year','YYYY') || '-' || right(g->>'data',5), 'YYYY-MM-DD')
                between current_date and current_date + 10)
           )
      ) memoria_perto,
      -- Meses além do ciclo, contados da última lavagem que existe DE VERDADE.
      -- Não uso `proximo_servico`: ele é campo derivado e já esteve errado
      -- (os 78 jazigos de 24/08).
      greatest(0, floor(
        extract(epoch from (now() - coalesce(
          (select max(x.data_executada) from servicos x
            where x.tumulo_id = s.tumulo_id and x.status='executado'),
          now()
        ))) / 2592000.0
      )::int) meses_parado
    from servicos s
    join tumulos t on t.id = s.tumulo_id
   where s.org_id = p_org
     and s.status in ('pendente','agendado')
  )
  select
    b.id,
    (case when b.memoria_perto then p.w_memoria else 0 end
     + case when b.eh_pedido then p.w_pedido else 0 end
     + case when b.nunca_lavado then p.w_novo else 0 end
     + b.adiados * p.w_adiado
     + b.semanas_atraso * p.w_atraso
     + b.meses_parado * p.w_velho)::int,
    array_remove(array[
      case when b.memoria_perto then 'data de memória chegando' end,
      case when b.eh_pedido then 'a família pediu' end,
      case when b.nunca_lavado then 'nunca foi lavado' end,
      case when b.adiados > 0 then 'ficou para depois ' || b.adiados || 'x' end,
      case when b.semanas_atraso > 0 then 'atrasado ' || b.semanas_atraso || ' semana(s)' end,
      case when b.meses_parado > 0 then 'sem lavar há ' || b.meses_parado || ' mês(es)' end
    ], null)
  from base b cross join p;
$$;

-- ---------------------------------------------------------------- 4
-- QUANTOS CADA CRITÉRIO ALCANÇA HOJE.
--
-- É o que faz a tela de configuração não ser um formulário no escuro: ao lado
-- de cada peso, quantos jazigos ele pega agora. Cinco dos seis dão zero hoje,
-- e ver isso é mais honesto do que descobrir depois que o ajuste não mudou nada.
create or replace function sureya_prioridade_alcance(p_org uuid)
returns table(criterio text, alcanca int)
language sql
stable
security definer
set search_path to 'public'
as $$
  with pend as (
    select s.id, s.tumulo_id, s.origem::text origem,
           coalesce(s.adiado_vezes,0) adiados, s.data_prevista, t.datas_gatilho
      from servicos s join tumulos t on t.id = s.tumulo_id
     where s.org_id = p_org and s.status in ('pendente','agendado')
  )
  select 'memoria_proxima', count(*)::int from pend
   where exists (select 1 from jsonb_array_elements(coalesce(datas_gatilho,'[]'::jsonb)) g
                  where right(g->>'data',5) ~ '^\d{2}-\d{2}$'
                    and to_date(to_char(current_date,'YYYY')||'-'||right(g->>'data',5),'YYYY-MM-DD')
                        between current_date and current_date + 10)
  union all select 'pedido_da_familia', count(*)::int from pend where origem = 'pedido'
  union all select 'nunca_lavado', count(*)::int from pend p
   where not exists (select 1 from servicos x where x.tumulo_id = p.tumulo_id and x.status='executado')
  union all select 'adiado', count(*)::int from pend where adiados > 0
  union all select 'atrasado_semana', count(*)::int from pend where data_prevista < current_date
  union all select 'sem_lavar_ha_muito', count(*)::int from pend p
   where not exists (select 1 from servicos x where x.tumulo_id = p.tumulo_id
                      and x.status='executado' and x.data_executada > now() - interval '30 days');
$$;

-- ---------------------------------------------------------------- 5
-- A PORTA DO ANÔNIMO FICA FECHADA (lição da 0129).
revoke execute on function sureya_prioridade_calculada(uuid) from anon, public;
revoke execute on function sureya_prioridade_alcance(uuid)   from anon, public;
grant  execute on function sureya_prioridade_calculada(uuid) to authenticated, service_role;
grant  execute on function sureya_prioridade_alcance(uuid)   to authenticated, service_role;

commit;
