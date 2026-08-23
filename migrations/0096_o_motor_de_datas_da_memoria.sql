-- =====================================================================
-- 0096 — O MOTOR DE DATAS DA MEMORIA
--
-- O PRINCIPIO QUE MANDA EM TUDO AQUI
-- ---------------------------------------------------------------------
-- "Luto recente e zona de silencio. O sistema deve ser INCAPAZ de
-- disparar oferta nesse periodo." Incapaz, e nao "configurado para nao".
-- Por isso as supressoes moram no banco, dentro da mesma funcao que
-- enfileira, e nao numa camada de aplicacao que alguem pode contornar
-- inserindo direto na fila.
--
-- E: "frequencia e risco de marca... os limites sao obrigatorios, nao
-- configuraveis para cima". Os tetos (4 por falecido/ano, 12 no total,
-- 7 dias entre mensagens) sao CONSTANTES no corpo da funcao. Nao ha
-- coluna para afrouxa-los. Afrouxar exige uma migration, que e uma
-- decisao com data e autor.
--
-- DUAS FASES, COMO PEDIDO
-- ---------------------------------------------------------------------
--   1. GERACAO  — `sureya_gerar_eventos_memoria` desenha o calendario dos
--      proximos 12+ meses a partir das datas dos falecidos. Convergente:
--      rodar de novo nao duplica, e corrige o que faltou.
--   2. LEMBRETE — `sureya_lembretes_do_dia` pega os eventos cuja data de
--      disparo e hoje, aplica as supressoes NA ORDEM e enfileira o que
--      sobrou.
--
-- NADA SAI SOZINHO. A fase 2 escreve em `fila_liberacao`, que e a porta
-- unica (0094) e exige o toque da Sureya. Nao ha caminho de envio
-- automatico neste arquivo — de proposito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- OS TIPOS DE EVENTO
--
-- `marco_7d` e `marco_30d` NAO existem aqui: o pedido e explicito em
-- deixa-los fora da automacao ("ficam na fila de contato humano"). Um
-- tipo declarado e um tipo que alguem liga por engano.
--
-- `religiosa` existe porque a escada de prioridade a cita, e uma escada
-- com um degrau que nao existe e uma escada que ninguem consegue
-- conferir. Nada gera eventos desse tipo ainda.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_evento_memoria') then
    create type public.sureya_evento_memoria as enum
      ('marco_1ano', 'falecimento', 'finados', 'nascimento', 'religiosa');
  end if;
  if not exists (select 1 from pg_type where typname = 'sureya_status_evento') then
    create type public.sureya_status_evento as enum
      ('previsto', 'enfileirado', 'suprimido', 'cancelado');
  end if;
end $$;

create table if not exists public.eventos_memoria (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  falecido_id uuid not null references falecidos(id) on delete cascade,
  tumulo_id   uuid not null references tumulos(id) on delete cascade,
  -- A familia e copiada no evento de proposito: e por familia que se
  -- conta frequencia, e um join ate o tumulo na hora de contar faria a
  -- conta mudar quando o jazigo trocasse de familia.
  familia_id  uuid references familias(id) on delete set null,

  tipo  sureya_evento_memoria not null,
  ano   int  not null,
  data_evento  date not null,
  -- O LEMBRETE SO TEM VALOR SE CHEGAR ANTES. No dia a familia ja lembrou
  -- sozinha; o produto existe para dar tempo de agendar.
  data_disparo date not null,
  tem_oferta   boolean not null default false,

  status sureya_status_evento not null default 'previsto',
  motivo_supressao text,
  -- Quando dois falecidos do mesmo tumulo tem data perto, UMA mensagem
  -- cita os dois e os demais apontam para ela.
  agrupado_em uuid references public.eventos_memoria(id) on delete set null,
  fila_id     uuid references fila_liberacao(id) on delete set null,

  criado_em   timestamptz not null default now(),
  decidido_em timestamptz
);

-- UM EVENTO POR FALECIDO, POR TIPO, POR ANO. E o que torna a geracao
-- convergente: rodar tres vezes no mesmo dia nao cria tres aniversarios.
create unique index if not exists eventos_memoria_unico
  on public.eventos_memoria(org_id, falecido_id, tipo, ano);
create index if not exists eventos_memoria_disparo_idx
  on public.eventos_memoria(org_id, data_disparo) where status = 'previsto';
create index if not exists eventos_memoria_familia_idx
  on public.eventos_memoria(org_id, familia_id, ano);

comment on table public.eventos_memoria is
  'O calendario de memoria: uma linha por falecido, tipo e ano. Guarda tambem o que NAO foi enviado e por que (motivo_supressao) — sem isso nao ha como responder "por que a familia X nao recebeu nada".';

alter table public.eventos_memoria enable row level security;

drop policy if exists eventos_memoria_org on public.eventos_memoria;
create policy eventos_memoria_org on public.eventos_memoria
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Uma policy POR COMANDO (licao da 0079: `with check` nao vale no DELETE).
drop policy if exists eventos_memoria_admin_insere on public.eventos_memoria;
create policy eventos_memoria_admin_insere on public.eventos_memoria
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);
drop policy if exists eventos_memoria_admin_altera on public.eventos_memoria;
create policy eventos_memoria_admin_altera on public.eventos_memoria
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null)
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null);
drop policy if exists eventos_memoria_admin_apaga on public.eventos_memoria;
create policy eventos_memoria_admin_apaga on public.eventos_memoria
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null);

-- ---------------------------------------------------------------------
-- AS CHAVES (principio 7: ligar e desligar, geral e por familia)
--
-- A chave da casa nasce DESLIGADA. Um deploy que comeca a preparar
-- mensagens de luto sozinho, sem ninguem ter pedido, e exatamente o que
-- este produto nao pode fazer.
-- ---------------------------------------------------------------------
alter table public.orgs
  add column if not exists lembretes_memoria boolean not null default false;

alter table public.familias
  -- Tres estados, como a chave de fotos: nulo = segue a casa.
  add column if not exists lembretes_memoria boolean,
  -- "pausar por 3/6/12 meses" — uma data, e nao um booleano, porque a
  -- pausa que nao tem fim vira desligamento silencioso.
  add column if not exists lembretes_pausados_ate date,
  -- "desativar por tipo de data"
  add column if not exists lembretes_desativados text[] not null default '{}',
  add column if not exists horario_preferido time;

comment on column public.orgs.lembretes_memoria is
  'A chave geral dos lembretes de memoria. Nasce DESLIGADA: nada comeca a ser preparado sem alguem pedir.';
comment on column public.familias.lembretes_memoria is
  'Tres estados: true = recebe, false = nao recebe, nulo = segue a casa.';

create or replace function public.sureya_recebe_lembrete(
  p_familia uuid, p_tipo text
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    -- a casa manda quando a familia nao opinou
    coalesce(f.lembretes_memoria, o.lembretes_memoria, false)
    -- a pausa vale por cima de tudo, inclusive de um "true" da familia:
    -- quem pediu para parar tres meses pediu para parar.
    and (f.lembretes_pausados_ate is null or f.lembretes_pausados_ate < current_date)
    and not (p_tipo = any(coalesce(f.lembretes_desativados, '{}')))
  from familias f
  join orgs o on o.id = f.org_id
  where f.id = p_familia;
$$;

comment on function public.sureya_recebe_lembrete(uuid, text) is
  'A chave geral, a da familia, a pausa e o desligamento por tipo, numa resposta so. Devolve NULO quando a familia nao existe — e quem chama trata isso como nao.';

revoke execute on function public.sureya_recebe_lembrete(uuid, text) from public, anon;
grant  execute on function public.sureya_recebe_lembrete(uuid, text) to authenticated, service_role;

-- =====================================================================
-- FASE 1 — GERACAO
--
-- Desenha o calendario. Nao decide nada sobre enviar: so diz que a data
-- existe e quando o lembrete dela seria devido.
--
-- AS ANTECEDENCIAS sao as do pedido, e estao aqui como constantes:
--   marco de 1 ano ...... D-20   (a familia se reune; precisa de prazo)
--   falecimento ......... D-10   (com oferta)
--   Finados ............. D-15   (a agenda do cemiterio lota antes)
--   nascimento .......... D-3    (nunca com oferta)
--
-- REGRAS DE DATA, todas do pedido:
--   · 29/02 sem correspondente no ano -> 28/02;
--   · data nula -> nao gera. Nunca inventar;
--   · precisao <> 'dia' -> nao gera. "Marco de 1943" e verdade na tela e
--     chute no calendario;
--   · marcos de 7 e 30 dias -> nao automatizar (nao existem no enum).
-- =====================================================================
create or replace function public.sureya_data_no_ano(p_data date, p_ano int)
returns date
language sql
immutable
as $$
  -- 29/02 num ano comum vira 28/02. `make_date` estouraria; esta forma
  -- devolve a ultima data valida do mes, que e 28 em fevereiro comum.
  select least(
    make_date(p_ano, extract(month from p_data)::int, 1)
      + (extract(day from p_data)::int - 1),
    (make_date(p_ano, extract(month from p_data)::int, 1) + interval '1 month - 1 day')::date
  );
$$;

comment on function public.sureya_data_no_ano(date, int) is
  'A mesma data, noutro ano. 29/02 em ano comum vira 28/02 — em vez de estourar ou pular o ano.';

create or replace function public.sureya_gerar_eventos_memoria(
  p_dias_a_frente int default 400
)
returns table(criados int, ja_existiam int, sem_data int)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_criados int := 0;
  v_ja int := 0;
  v_sem int := 0;
  v_fim date;
  r record;
  v_data date;
  v_disp date;
  v_ano  int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  v_fim := current_date + p_dias_a_frente;

  -- quantos falecidos tem data de falecimento que nao serve de gatilho
  select count(*) into v_sem
    from falecidos f
   where f.org_id = v_org
     and (f.data_falecimento is null or f.precisao_falecimento <> 'dia');

  for r in
    select f.id, f.tumulo_id, t.familia_id,
           f.data_nascimento, f.data_falecimento,
           f.precisao_nascimento, f.precisao_falecimento
      from falecidos f
      join tumulos t on t.id = f.tumulo_id
     where f.org_id = v_org
  loop
    -- ---------------- ANIVERSARIO DE FALECIMENTO, e o marco de 1 ano
    if r.data_falecimento is not null and r.precisao_falecimento = 'dia' then
      for v_ano in extract(year from current_date)::int
                .. extract(year from v_fim)::int loop
        v_data := sureya_data_no_ano(r.data_falecimento, v_ano);
        -- o ano do proprio falecimento nao e "aniversario de" coisa nenhuma
        if v_data > r.data_falecimento and v_data between current_date and v_fim then

          -- O MARCO DE 1 ANO tem tipo proprio: antecedencia maior, texto
          -- proprio, e prioridade no topo da escada. Tratar como um
          -- aniversario qualquer perderia a data que mais importa.
          if v_ano = extract(year from r.data_falecimento)::int + 1 then
            v_disp := v_data - 20;
            insert into eventos_memoria
              (org_id, falecido_id, tumulo_id, familia_id, tipo, ano,
               data_evento, data_disparo, tem_oferta)
            values (v_org, r.id, r.tumulo_id, r.familia_id, 'marco_1ano', v_ano,
                    v_data, v_disp, true)
            on conflict (org_id, falecido_id, tipo, ano) do nothing;
          else
            v_disp := v_data - 10;
            insert into eventos_memoria
              (org_id, falecido_id, tumulo_id, familia_id, tipo, ano,
               data_evento, data_disparo, tem_oferta)
            values (v_org, r.id, r.tumulo_id, r.familia_id, 'falecimento', v_ano,
                    v_data, v_disp, true)
            on conflict (org_id, falecido_id, tipo, ano) do nothing;
          end if;

          if found then v_criados := v_criados + 1; else v_ja := v_ja + 1; end if;
        end if;
      end loop;

      -- ---------------- FINADOS, 02/11 — um por falecido, agrupado depois
      for v_ano in extract(year from current_date)::int
                .. extract(year from v_fim)::int loop
        v_data := make_date(v_ano, 11, 2);
        if v_data > r.data_falecimento and v_data between current_date and v_fim then
          insert into eventos_memoria
            (org_id, falecido_id, tumulo_id, familia_id, tipo, ano,
             data_evento, data_disparo, tem_oferta)
          values (v_org, r.id, r.tumulo_id, r.familia_id, 'finados', v_ano,
                  v_data, v_data - 15, true)
          on conflict (org_id, falecido_id, tipo, ano) do nothing;
          if found then v_criados := v_criados + 1; else v_ja := v_ja + 1; end if;
        end if;
      end loop;
    end if;

    -- ---------------- ANIVERSARIO DE NASCIMENTO — NUNCA com oferta
    --
    -- "A data de nascimento e a data afetiva... e nela nunca se vende
    -- nada." `tem_oferta = false` esta escrito aqui e conferido de novo
    -- na fase 2: e a unica regra deste arquivo que aparece duas vezes,
    -- porque e a que mais custa se falhar.
    if r.data_nascimento is not null and r.precisao_nascimento = 'dia' then
      for v_ano in extract(year from current_date)::int
                .. extract(year from v_fim)::int loop
        v_data := sureya_data_no_ano(r.data_nascimento, v_ano);
        if v_data between current_date and v_fim then
          insert into eventos_memoria
            (org_id, falecido_id, tumulo_id, familia_id, tipo, ano,
             data_evento, data_disparo, tem_oferta)
          values (v_org, r.id, r.tumulo_id, r.familia_id, 'nascimento', v_ano,
                  v_data, v_data - 3, false)
          on conflict (org_id, falecido_id, tipo, ano) do nothing;
          if found then v_criados := v_criados + 1; else v_ja := v_ja + 1; end if;
        end if;
      end loop;
    end if;
  end loop;

  return query select v_criados, v_ja, v_sem;
end
$function$;

comment on function public.sureya_gerar_eventos_memoria(int) is
  'Fase 1 do motor: desenha o calendario de memoria a partir das datas dos falecidos. Convergente. Nao decide envio — quem decide e a fase 2.';

revoke execute on function public.sureya_gerar_eventos_memoria(int) from public, anon;
grant  execute on function public.sureya_gerar_eventos_memoria(int) to authenticated, service_role;

-- =====================================================================
-- A BIBLIOTECA DE MENSAGENS
--
-- O TOM, que e regra e nao gosto: primeira pessoa do plural, frases
-- curtas, sem eufemismo religioso. NUNCA "perda", "sinto muito pela sua
-- perda", "partiu para um lugar melhor". Fala-se do CUIDADO CONCRETO, e
-- nao do sentimento alheio — ninguem aqui tem o direito de nomear o que
-- a outra pessoa sente.
--
-- OS TEXTOS SAO DA CASA, editaveis em Config › Textos das mensagens,
-- como todos os outros desde a 0085. Os de baixo sao a semente. Deixa-los
-- so no codigo obrigaria uma migration para trocar uma virgula.
--
-- A LINHA DE SAIDA vai em TODAS, inclusive nas de afeto. Uma mensagem
-- que nao se pode recusar nao e afeto, e insistencia — e o opt-out tem
-- de estar a um toque, nao escondido numa tela de preferencias.
-- =====================================================================
alter type public.sureya_tipo_mensagem add value if not exists 'memoria_falecimento';
alter type public.sureya_tipo_mensagem add value if not exists 'memoria_marco';
alter type public.sureya_tipo_mensagem add value if not exists 'memoria_nascimento';
alter type public.sureya_tipo_mensagem add value if not exists 'memoria_agrupado';
alter type public.sureya_tipo_mensagem add value if not exists 'memoria_sem_oferta';

-- A SEMENTE, por organizacao. Convergente: so insere o que falta.
create or replace function public.sureya_semear_textos_memoria(p_org uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int := 0;
begin
  insert into modelos_mensagem (org_id, tipo, texto, ativo, ordem)
  select p_org, x.tipo::sureya_tipo_mensagem, x.texto, true, x.ordem
    from (values
      ('memoria_falecimento', 1,
       'Olá, {{nome_familiar}}.' || chr(10) || chr(10) ||
       'No dia {{data_evento}} completam-se {{anos}} anos da despedida de {{nome_falecido}}.' || chr(10) || chr(10) ||
       'Se você pretende visitar, podemos deixar o túmulo limpo e preparado antes da data — assim você encontra tudo em ordem quando chegar.' || chr(10) || chr(10) ||
       'Quer que a gente cuide disso?'),
      ('memoria_marco', 1,
       '{{nome_familiar}}, no dia {{data_evento}} completa-se um ano.' || chr(10) || chr(10) ||
       'É uma data em que muitas famílias se reúnem no cemitério. Se for o caso de vocês, podemos preparar o túmulo de {{nome_falecido}} com antecedência — lavagem completa e, se quiserem, flores no dia.' || chr(10) || chr(10) ||
       'Sem compromisso: é só responder que a gente organiza.'),
      ('memoria_nascimento', 1,
       '{{nome_familiar}}, dia {{data_evento}} é o aniversário de {{nome_falecido}}.' || chr(10) || chr(10) ||
       'Uma data para lembrar da vida dele, não da despedida. Um abraço da nossa parte.'),
      ('memoria_agrupado', 1,
       '{{nome_familiar}}, este mês tem duas datas: {{nome_falecido}} em {{data_evento}} e {{nome_falecido_2}} em {{data_2}}.' || chr(10) || chr(10) ||
       'Como estão no mesmo túmulo, podemos preparar tudo de uma vez antes da primeira data.'),
      ('memoria_sem_oferta', 1,
       '{{nome_familiar}}, no dia {{data_evento}} lembramos de {{nome_falecido}}.' || chr(10) || chr(10) ||
       'Passamos para deixar um abraço da nossa parte.')
    ) as x(tipo, ordem, texto)
   where not exists (
     select 1 from modelos_mensagem m
      where m.org_id = p_org and m.tipo = x.tipo::sureya_tipo_mensagem
   );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.sureya_semear_textos_memoria(uuid) is
  'Poe os textos de memoria da casa numa organizacao que ainda nao os tem. Convergente.';

revoke execute on function public.sureya_semear_textos_memoria(uuid) from public, anon;
grant  execute on function public.sureya_semear_textos_memoria(uuid) to service_role;

select public.sureya_semear_textos_memoria(o.id) from orgs o;

-- ---------------------------------------------------------------------
-- O TEXTO PRONTO, com as variaveis trocadas
--
-- `{{anos}}` sai da conta e nao do cadastro: escrever "23 anos" numa
-- mensagem e o tipo de numero que, errado, ofende.
-- ---------------------------------------------------------------------
create or replace function public.sureya_texto_memoria(
  p_org uuid,
  p_tipo text,
  p_tem_oferta boolean,
  p_familia text,
  p_falecido text,
  p_data_evento date,
  p_companheiro text default null,
  p_data_companheiro date default null,
  p_tem_foto boolean default false
) returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_modelo text;
  v_tipo   text;
  v_anos   int;
  v_saida  constant text := chr(10) || chr(10) ||
    'Para não receber estes lembretes, responda SAIR.';
begin
  -- QUAL TEXTO. O agrupado manda por cima de tudo: duas datas no mesmo
  -- tumulo viram UMA mensagem, e essa e a regra que impede a enxurrada.
  v_tipo := case
    when p_companheiro is not null then 'memoria_agrupado'
    when p_tipo = 'marco_1ano'     then 'memoria_marco'
    when p_tipo = 'nascimento'     then 'memoria_nascimento'
    when p_tem_oferta              then 'memoria_falecimento'
    else 'memoria_sem_oferta'
  end;

  select m.texto into v_modelo
    from modelos_mensagem m
   where m.org_id = p_org and m.tipo = v_tipo::sureya_tipo_mensagem and m.ativo
   order by m.ordem, m.created_at
   limit 1;

  -- Sem modelo cadastrado, um texto de reserva sobrio. Nunca uma
  -- mensagem vazia e nunca um placeholder visivel.
  if v_modelo is null then
    v_modelo := '{{nome_familiar}}, no dia {{data_evento}} lembramos de {{nome_falecido}}.';
  end if;

  select extract(year from age(p_data_evento, f.data_falecimento))::int into v_anos
    from falecidos f
   where f.org_id = p_org and coalesce(f.apelido_familiar, f.nome) = p_falecido
   limit 1;

  v_modelo := replace(v_modelo, '{{nome_familiar}}',  coalesce(nullif(btrim(p_familia), ''), 'Olá'));
  v_modelo := replace(v_modelo, '{{nome_falecido}}',  coalesce(p_falecido, ''));
  v_modelo := replace(v_modelo, '{{data_evento}}',    to_char(p_data_evento, 'DD/MM'));
  v_modelo := replace(v_modelo, '{{anos}}',           coalesce(v_anos::text, ''));
  v_modelo := replace(v_modelo, '{{nome_falecido_2}}', coalesce(p_companheiro, ''));
  v_modelo := replace(v_modelo, '{{data_2}}',
                      coalesce(to_char(p_data_companheiro, 'DD/MM'), ''));

  return v_modelo || v_saida;
end $$;

comment on function public.sureya_texto_memoria(uuid, text, boolean, text, text, date, text, date, boolean) is
  'Monta o texto do lembrete de memoria a partir dos modelos da casa. A linha de saida (responda SAIR) vai em TODAS, inclusive nas de afeto: mensagem que nao se pode recusar nao e afeto.';

revoke execute on function public.sureya_texto_memoria(uuid, text, boolean, text, text, date, text, date, boolean) from public, anon;
grant  execute on function public.sureya_texto_memoria(uuid, text, boolean, text, text, date, text, date, boolean) to authenticated, service_role;

-- =====================================================================
-- FASE 2 — LEMBRETE
--
-- Pega os eventos cuja data de disparo e hoje e aplica as supressoes NA
-- ORDEM DO PEDIDO. A primeira que bater grava o motivo e cancela — e o
-- motivo fica gravado justamente para a pergunta "por que a familia X
-- nao recebeu nada" ter resposta.
--
--   1. luto recente     — a zona de silencio
--   2. frequencia       — o teto por familia
--   3. agrupamento      — uma mensagem por tumulo, nao tres
--   4. sem foto         — cai no texto sem foto, NUNCA com placeholder
--
-- O QUE ESTA FUNCAO NAO FAZ: enviar. Ela escreve em `fila_liberacao`,
-- que exige o toque da Sureya (0094). Nao ha caminho automatico daqui
-- ate o WhatsApp, e isso e desenho, nao esquecimento.
-- =====================================================================
create or replace function public.sureya_lembretes_do_dia(
  p_dia date default null
)
returns table(
  enfileirados int, suprimidos int, agrupados int,
  por_luto int, por_frequencia int, sem_chave int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- OS TETOS. Constantes, e nao colunas: "os limites sao obrigatorios,
  -- nao configuraveis para cima". Afrouxar exige uma migration — uma
  -- decisao com data e autor, e nao um campo que alguem mexe as pressas.
  c_max_por_falecido constant int := 4;    -- por ano-calendario
  c_max_por_familia  constant int := 12;   -- por ano, somando todos
  c_dias_entre       constant int := 7;    -- nunca dois em menos de 7 dias
  c_luto_sem_oferta  constant int := 180;  -- 6 meses: nada com oferta
  c_luto_silencio    constant int := 90;   -- 3 meses: nada, com ou sem
  c_cliente_ativa    constant int := 60;   -- servico recente = relacionamento
  c_janela_grupo     constant int := 15;   -- agrupar eventos a ate 15 dias

  v_org uuid;
  v_dia date;
  r record;
  v_enf int := 0; v_sup int := 0; v_agr int := 0;
  v_luto int := 0; v_freq int := 0; v_chave int := 0;
  v_no_ano int; v_da_familia int; v_ultimo date;
  v_ativa boolean;
  v_fila uuid;
  v_texto text;
  v_foto text;
  v_companheiro record;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  v_dia := coalesce(p_dia, current_date);

  for r in
    select e.*,
           f.nome as falecido_nome, f.apelido_familiar,
           fam.nome as familia_nome
      from eventos_memoria e
      join falecidos f on f.id = e.falecido_id
      left join familias fam on fam.id = e.familia_id
     where e.org_id = v_org
       and e.status = 'previsto'
       and e.data_disparo <= v_dia
       -- Evento cuja data JA PASSOU nao vira lembrete atrasado: o produto
       -- existe para chegar antes, e um "faltam -3 dias" e pior que nada.
       and e.data_evento >= v_dia
     -- A ESCADA DE PRIORIDADE do pedido, aplicada ja na ordem de leitura:
     -- quando o teto estoura, o que sobra e o que importa mais.
     order by
       case e.tipo
         when 'marco_1ano'  then 1
         when 'falecimento' then 2
         when 'finados'     then 3
         when 'nascimento'  then 4
         else 5
       end,
       e.data_evento
  loop
    -- =================================================== 0 · AS CHAVES
    -- Antes de qualquer supressao: a familia (ou a casa) pode ter dito
    -- que nao quer. Isso nao e "supressao", e vontade declarada.
    if r.familia_id is null
       or coalesce(sureya_recebe_lembrete(r.familia_id, r.tipo::text), false) = false then
      update eventos_memoria
         set status = 'suprimido', decidido_em = now(),
             motivo_supressao = case when r.familia_id is null
                                     then 'jazigo sem familia'
                                     else 'lembretes desligados para esta familia' end
       where id = r.id;
      v_sup := v_sup + 1; v_chave := v_chave + 1;
      continue;
    end if;

    -- =============================================== 1 · LUTO RECENTE
    --
    -- A familia ja contratou nos ultimos 60 dias? Entao ela e cliente
    -- ativa e a comunicacao e de relacionamento, nao de abordagem — e a
    -- excecao do pedido vale.
    select exists (
      select 1 from servicos s
       join tumulos t on t.id = s.tumulo_id
       where s.org_id = v_org and t.familia_id = r.familia_id
         and s.status = 'executado' and s.estornado_em is null
         and s.data_executada >= (v_dia - c_cliente_ativa)
    ) into v_ativa;

    if not v_ativa then
      declare v_dias_de_luto int;
      begin
        select (r.data_evento - f.data_falecimento) into v_dias_de_luto
          from falecidos f where f.id = r.falecido_id;

        if v_dias_de_luto is not null then
          -- Os primeiros 90 dias sao silencio COMPLETO: nem com oferta,
          -- nem sem. Nao ha mensagem boa para mandar a quem enterrou
          -- alguem ha dois meses.
          if v_dias_de_luto < c_luto_silencio then
            update eventos_memoria
               set status='suprimido', decidido_em=now(),
                   motivo_supressao='luto recente: menos de 90 dias'
             where id = r.id;
            v_sup := v_sup + 1; v_luto := v_luto + 1;
            continue;
          end if;
          -- Ate 6 meses, nada que VENDA.
          if v_dias_de_luto < c_luto_sem_oferta and r.tem_oferta then
            update eventos_memoria
               set status='suprimido', decidido_em=now(),
                   motivo_supressao='luto recente: oferta bloqueada ate 6 meses'
             where id = r.id;
            v_sup := v_sup + 1; v_luto := v_luto + 1;
            continue;
          end if;
        end if;
      end;
    end if;

    -- ============================================== 2 · FREQUENCIA
    select count(*) into v_no_ano
      from eventos_memoria e2
     where e2.org_id = v_org and e2.falecido_id = r.falecido_id
       and e2.ano = r.ano and e2.status = 'enfileirado';

    select count(*), max(e3.data_disparo) into v_da_familia, v_ultimo
      from eventos_memoria e3
     where e3.org_id = v_org and e3.familia_id = r.familia_id
       and e3.ano = r.ano and e3.status = 'enfileirado';

    if v_no_ano >= c_max_por_falecido then
      update eventos_memoria set status='suprimido', decidido_em=now(),
             motivo_supressao='teto de 4 lembretes por falecido no ano'
       where id = r.id;
      v_sup := v_sup + 1; v_freq := v_freq + 1;
      continue;
    end if;

    if v_da_familia >= c_max_por_familia then
      update eventos_memoria set status='suprimido', decidido_em=now(),
             motivo_supressao='teto de 12 lembretes para esta familia no ano'
       where id = r.id;
      v_sup := v_sup + 1; v_freq := v_freq + 1;
      continue;
    end if;

    -- NUNCA DOIS EM MENOS DE 7 DIAS. Vale para a familia inteira, e nao
    -- por falecido: quem recebe as duas e a mesma pessoa.
    if v_ultimo is not null and (v_dia - v_ultimo) < c_dias_entre then
      update eventos_memoria set status='suprimido', decidido_em=now(),
             motivo_supressao='outro lembrete ha menos de 7 dias'
       where id = r.id;
      v_sup := v_sup + 1; v_freq := v_freq + 1;
      continue;
    end if;

    -- ========================================= 3 · AGRUPAMENTO POR TUMULO
    --
    -- "Datas de irmaos, pais e avos no mesmo jazigo geram uma enxurrada
    -- se cada falecido for tratado isoladamente." Procura um companheiro
    -- de tumulo com evento dentro de 15 dias que ainda nao foi decidido.
    -- Ele NAO vira mensagem: aponta para esta.
    select e4.id, f4.nome, coalesce(f4.apelido_familiar, f4.nome) as trato,
           e4.data_evento
      into v_companheiro
      from eventos_memoria e4
      join falecidos f4 on f4.id = e4.falecido_id
     where e4.org_id = v_org
       and e4.tumulo_id = r.tumulo_id
       and e4.id <> r.id
       and e4.status = 'previsto'
       and abs(e4.data_evento - r.data_evento) <= c_janela_grupo
     order by e4.data_evento
     limit 1;

    if found then
      update eventos_memoria
         set status='suprimido', decidido_em=now(), agrupado_em = r.id,
             motivo_supressao='agrupado na mensagem de outro falecido do mesmo tumulo'
       where id = v_companheiro.id;
      v_agr := v_agr + 1;
    end if;

    -- ============================================ 4 · O TEXTO E A FOTO
    --
    -- A foto e o argumento. Mas NUNCA com placeholder: sem foto, cai no
    -- texto sem foto — que existe e e bom.
    select v.foto_depois_url into v_foto
      from sureya_ultima_lavagem_jazigo v
     where v.tumulo_id = r.tumulo_id;

    v_texto := sureya_texto_memoria(
      v_org, r.tipo::text, r.tem_oferta,
      coalesce(r.familia_nome, ''),
      coalesce(r.apelido_familiar, r.falecido_nome),
      r.data_evento,
      case when v_companheiro.id is not null then v_companheiro.trato end,
      case when v_companheiro.id is not null then v_companheiro.data_evento end,
      (v_foto is not null)
    );

    -- A mensagem entra na FILA, como qualquer outra (0094). O gatilho da
    -- porta ainda vale: familia que silenciou 'comemorativa' nao recebe,
    -- e a linha nem chega a existir.
    insert into fila_liberacao
      (org_id, familia_id, tumulo_id, tipo, texto, status, fotos)
    values
      (v_org, r.familia_id, r.tumulo_id, 'comemorativa', v_texto, 'aguardando',
       case when v_foto is not null and r.tem_oferta
            then jsonb_build_array(v_foto) else '[]'::jsonb end)
    returning id into v_fila;

    if v_fila is null then
      -- A porta barrou (familia silenciou o tipo). Nao e erro: e a
      -- vontade dela, e fica registrada como tal.
      update eventos_memoria set status='suprimido', decidido_em=now(),
             motivo_supressao='familia silenciou mensagens deste tipo'
       where id = r.id;
      v_sup := v_sup + 1; v_chave := v_chave + 1;
    else
      update eventos_memoria set status='enfileirado', decidido_em=now(), fila_id=v_fila
       where id = r.id;
      v_enf := v_enf + 1;
    end if;
  end loop;

  return query select v_enf, v_sup, v_agr, v_luto, v_freq, v_chave;
end
$function$;

comment on function public.sureya_lembretes_do_dia(date) is
  'Fase 2 do motor: aplica luto recente, teto de frequencia, agrupamento por tumulo e a regra da foto, e enfileira o que sobrou. Nao envia — quem envia e a Sureya, na fila de liberacao.';

revoke execute on function public.sureya_lembretes_do_dia(date) from public, anon;
grant  execute on function public.sureya_lembretes_do_dia(date) to authenticated, service_role;
