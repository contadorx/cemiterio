-- =====================================================================
-- 0095 — UM TUMULO GUARDA VARIAS PESSOAS
--
-- O QUE HAVIA
-- ---------------------------------------------------------------------
-- `tumulos.falecido_nome`: UM texto, UMA pessoa. E `tumulos.datas_gatilho`,
-- um jsonb de {tipo, data} sem dono — a data nao pertencia a ninguem em
-- particular, era "uma data do tumulo".
--
-- Medido em producao em 23/08/2026: 270 jazigos, 65 com nome de falecido,
-- e ZERO com datas_gatilho preenchido. O mecanismo de datas nunca rodou
-- sobre dado nenhum. Isso e uma boa noticia: da para desenhar direito sem
-- migrar nada torto.
--
-- Um jazigo de familia guarda pai, mae, irmao. Com um campo de texto:
--   · so um nome cabe, e os outros ficam de fora do sistema;
--   · uma data nao tem de quem ser — nao da para dizer "aniversario de
--     falecimento DE QUEM";
--   · e o agrupamento (nao mandar tres mensagens no mesmo mes para a
--     mesma familia) e impossivel de calcular, porque nao ha o que
--     agrupar.
--
-- AS DECISOES DE DESENHO
-- ---------------------------------------------------------------------
-- 1. `falecidos` e uma tabela propria, N:1 com tumulos. E o unico jeito
--    de uma data ter dono.
--
-- 2. `tumulos.falecido_nome` NAO SAI — vira DERIVADO. Vinte e um arquivos
--    do sistema leem essa coluna (agenda, campo, plaquetas, briefing,
--    LGPD, contexto da IA). Trocar todos por um join seria uma tarde de
--    trabalho e uma semana de bugs em telas que hoje funcionam. Um
--    gatilho mantem a coluna igual ao nome do falecido PRINCIPAL, e
--    quem lia continua lendo.
--
--    O preco: a coluna passa a ser um espelho, e escrever nela a mao
--    deixa de valer. Esta escrito em PENDENCIAS.
--
-- 3. PRECISAO DA DATA e um campo, nao uma convencao. "Nasceu em marco de
--    1943" e uma informacao verdadeira e util na tela — e uma informacao
--    da qual NAO SE PODE disparar lembrete. Guardar isso como
--    `1943-03-01` e perder a diferenca entre o que se sabe e o que se
--    chutou, e no dia seguinte alguem manda mensagem no dia 1 de marco.
--
-- 4. Nao ha `data_falecimento` obrigatoria. Muita familia nao sabe, e o
--    cadastro nao pode travar por isso. O motor simplesmente nao gera
--    evento do que nao tem data — nunca inventa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A PRECISAO DO QUE SE SABE
--
-- `dia` é o unico valor do qual se dispara. Os outros existem para a
-- tela poder mostrar o que a familia contou sem que isso vire gatilho.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_precisao_data') then
    create type public.sureya_precisao_data as enum ('dia', 'mes_ano', 'ano', 'desconhecida');
  end if;
end $$;

create table if not exists public.falecidos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  tumulo_id  uuid not null references tumulos(id) on delete cascade,

  nome       text not null,
  -- COMO A FAMILIA CHAMA. "Vo Nair", "seu Antonio". E o nome que entra na
  -- mensagem: escrever "ANTONIO CARLOS PEREIRA DA SILVA" numa mensagem de
  -- memoria soa a cartorio, e o assunto aqui nao e cartorio.
  apelido_familiar text,

  data_nascimento    date,
  data_falecimento   date,
  precisao_nascimento  sureya_precisao_data not null default 'desconhecida',
  precisao_falecimento sureya_precisao_data not null default 'desconhecida',

  -- QUEM E O PRINCIPAL. O jazigo tem um nome na lapide e um nome nas
  -- telas antigas; este marca qual. O gatilho abaixo mantem
  -- `tumulos.falecido_nome` igual ao dele.
  principal  boolean not null default false,
  ordem      int not null default 0,

  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists falecidos_tumulo_idx on public.falecidos(tumulo_id);
create index if not exists falecidos_org_idx    on public.falecidos(org_id);
-- O motor varre por dia-e-mes; sem estes indices ele le a tabela inteira
-- todo dia as 06:00.
create index if not exists falecidos_falecimento_idx
  on public.falecidos(org_id, data_falecimento)
  where data_falecimento is not null and precisao_falecimento = 'dia';
create index if not exists falecidos_nascimento_idx
  on public.falecidos(org_id, data_nascimento)
  where data_nascimento is not null and precisao_nascimento = 'dia';

-- UM PRINCIPAL POR TUMULO, no maximo.
create unique index if not exists falecidos_um_principal
  on public.falecidos(tumulo_id) where principal;

comment on table public.falecidos is
  'As pessoas que um tumulo guarda. N:1 com tumulos: um jazigo de familia tem pai, mae e irmao, e cada data precisa ter dono para o motor de memoria poder agrupar em vez de disparar tres vezes.';
comment on column public.falecidos.precisao_nascimento is
  'So se dispara lembrete de precisao = dia. mes_ano e uma informacao verdadeira para a tela e um chute para o calendario.';

-- ---------------------------------------------------------------------
-- RLS — uma policy POR COMANDO (a licao da 0079: `with check` nao e
-- consultado no DELETE)
-- ---------------------------------------------------------------------
alter table public.falecidos enable row level security;

drop policy if exists falecidos_org on public.falecidos;
create policy falecidos_org on public.falecidos
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- O campo CADASTRA falecido: e ela que esta na frente da lapide lendo os
-- nomes. Por isso a escrita nao e so de admin — mas apagar, sim.
drop policy if exists falecidos_apaga_admin on public.falecidos;
create policy falecidos_apaga_admin on public.falecidos
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- ---------------------------------------------------------------------
-- `tumulos.falecido_nome` VIRA ESPELHO
--
-- Vinte e um arquivos leem essa coluna. O gatilho a mantem igual ao nome
-- do falecido principal — ou, sem principal marcado, o de menor `ordem`.
-- Assim nada do que existe hoje precisa saber que a tabela nasceu.
-- ---------------------------------------------------------------------
create or replace function public.sureya_espelhar_falecido_principal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tumulo uuid;
  v_nome   text;
begin
  v_tumulo := coalesce(new.tumulo_id, old.tumulo_id);
  if v_tumulo is null then return coalesce(new, old); end if;

  select coalesce(f.apelido_familiar, f.nome) into v_nome
    from falecidos f
   where f.tumulo_id = v_tumulo
   order by f.principal desc, f.ordem, f.created_at
   limit 1;

  -- Sem nenhum falecido cadastrado a coluna fica NULA, e nao com o ultimo
  -- nome que passou por ali: um jazigo sem ninguem cadastrado tem de
  -- aparecer vazio, que e o convite para completar o cadastro.
  update tumulos set falecido_nome = v_nome where id = v_tumulo;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_falecido_espelha on public.falecidos;
create trigger trg_falecido_espelha
  after insert or update or delete on public.falecidos
  for each row execute function public.sureya_espelhar_falecido_principal();

comment on function public.sureya_espelhar_falecido_principal() is
  'Mantem tumulos.falecido_nome igual ao nome do falecido principal. A coluna virou espelho na 0095 porque 21 arquivos a leem; escrever nela a mao deixou de valer.';

-- ---------------------------------------------------------------------
-- O QUE JA EXISTE VIRA O PRIMEIRO FALECIDO
--
-- Convergente: rodar de novo nao cria segundo registro. A chave e o par
-- (tumulo, nome) — nao ha id externo para usar, e o nome e o que existe.
-- ---------------------------------------------------------------------
insert into public.falecidos (org_id, tumulo_id, nome, principal, ordem)
select t.org_id, t.id, btrim(t.falecido_nome), true, 0
  from tumulos t
 where coalesce(btrim(t.falecido_nome), '') <> ''
   and not exists (
     select 1 from falecidos f
      where f.tumulo_id = t.id
        and lower(btrim(f.nome)) = lower(btrim(t.falecido_nome))
   );

-- ---------------------------------------------------------------------
-- A FICHA DO TUMULO, com todo mundo que ele guarda
-- ---------------------------------------------------------------------
create or replace view public.sureya_falecidos_do_tumulo
with (security_invoker = true) as
select
  f.id, f.org_id, f.tumulo_id, f.nome, f.apelido_familiar,
  f.data_nascimento, f.data_falecimento,
  f.precisao_nascimento, f.precisao_falecimento,
  f.principal, f.ordem, f.observacoes,
  t.identificacao as jazigo,
  t.familia_id,
  q.codigo        as quadra,
  -- Idade no falecimento, so quando as DUAS datas sao de dia certo. Com
  -- uma delas aproximada o numero seria um chute com cara de fato.
  case when f.data_nascimento is not null and f.data_falecimento is not null
        and f.precisao_nascimento = 'dia' and f.precisao_falecimento = 'dia'
       then extract(year from age(f.data_falecimento, f.data_nascimento))::int
  end as idade,
  -- Quantos anos a data de falecimento completa NESTE ano.
  case when f.data_falecimento is not null and f.precisao_falecimento = 'dia'
       then extract(year from current_date)::int - extract(year from f.data_falecimento)::int
  end as anos_de_despedida
from falecidos f
join tumulos t on t.id = f.tumulo_id
left join quadras q on q.id = t.quadra_id
order by f.tumulo_id, f.principal desc, f.ordem, f.nome;

comment on view public.sureya_falecidos_do_tumulo is
  'Os falecidos de cada tumulo com o que a tela precisa. Idade so aparece quando as duas datas sao de dia certo.';

revoke all    on public.sureya_falecidos_do_tumulo from public, anon;
grant  select on public.sureya_falecidos_do_tumulo to authenticated, service_role;
