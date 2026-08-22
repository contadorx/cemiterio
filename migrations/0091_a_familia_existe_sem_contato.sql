-- =====================================================================
-- 0091 · A FAMÍLIA EXISTE SEM CONTATO, E O RESPONSÁVEL PODE MUDAR
-- =====================================================================
--
-- O QUE ELE DISSE, 22/08
-- "Tenho o jazigo e tenho família, e família é um contato — o problema é que
-- por vezes eu não tenho o contato. Preciso que a família seja o NOME da
-- família e que tenha contatos abaixo dela, que podem ou não existir. Nos
-- contatos tenho que ter um contato financeiro, que pode mudar ao longo do
-- tempo. Estou nos cadastros e tem jazigo que não consegui vincular a um
-- contato."
--
-- O QUE O BANCO DIZ, MEDIDO
--   · 298 famílias e 298 contatos — **um para um, exato**;
--   · **81 túmulos** sem família e sem dono, de 204 cadastrados;
--   · `clientes.telefone` é NOT NULL com unique (org, telefone).
--
-- O um-para-um não é coincidência: `sureya_familia_para_cliente` (gatilho de
-- 0062) CRIA uma família a cada contato que nasce sem uma, batizada com o
-- sobrenome dele. Ou seja, hoje a família não é uma entidade — é o apelido de
-- um contato. E como contato exige telefone, **não existe caminho para
-- cadastrar uma família de quem não se tem telefone**. Daí os 81 jazigos
-- parados.
--
-- A INVERSÃO
--   antes:  contato → (gatilho cria) família → jazigo aponta para o CONTATO
--   agora:  família → contatos (zero ou muitos) → jazigo aponta para a FAMÍLIA
--
-- `tumulos.cliente_id` não some: vira campo DERIVADO, mantido pelo banco como
-- "o contato financeiro atual desta família". Assim todo o código que já lê
-- `cliente_id` continua funcionando, e ninguém precisa reescrever o sistema
-- para o cadastro destravar hoje.
--
-- O EFEITO INVISÍVEL QUE ISTO OBRIGA A CONSERTAR
-- `sureya_concluir_lavagem` decide lançar o débito com
-- `if v_s.cliente_id is not null`. Com família sem contato, `cliente_id` é
-- nulo — e a limpeza aconteceria, a foto sairia, e **a cobrança não existiria**,
-- calada. Quando o contato aparecesse meses depois, o histórico estaria vazio.
-- A dívida é da FAMÍLIA desde a 0071 (D-01), e `conta_corrente.familia_id` já
-- é NOT NULL enquanto `cliente_id` é anulável: o teste certo sempre foi a
-- família. Corrigido aqui.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1 · O CONTATO FINANCEIRO É DA FAMÍLIA, E TEM DATA
-- ---------------------------------------------------------------------
alter table familias add column if not exists responsavel_id uuid
  references clientes(id) on delete set null;

comment on column familias.responsavel_id is
  'O contato financeiro ATUAL desta familia. Nulo = a familia existe e ainda nao se sabe com quem falar.';

-- O log existe porque "muda ano após ano" é a descrição de um FATO com data, e
-- um campo sozinho só sabe o presente. Quem trocou, quando e por quê é a
-- pergunta que aparece quando a família liga dizendo que a cobrança foi para a
-- pessoa errada.
create table if not exists familia_responsavel_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  familia_id uuid not null references familias(id) on delete cascade,
  -- nulo = a família ficou SEM contato financeiro. É um estado legítimo, e
  -- registrá-lo é o que diferencia "ninguém respondia" de "nunca teve".
  cliente_id uuid references clientes(id) on delete set null,
  desde      timestamptz not null default now(),
  por        uuid,
  motivo     text
);

comment on table familia_responsavel_log is
  'Quem foi o contato financeiro de cada familia, e desde quando. "Muda ano apos ano" e um fato com data; um campo sozinho so sabe o presente.';

create index if not exists idx_familia_resp_log
  on familia_responsavel_log (org_id, familia_id, desde desc);

alter table familia_responsavel_log enable row level security;

drop policy if exists familia_resp_log_org on familia_responsavel_log;
create policy familia_resp_log_org on familia_responsavel_log
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Escrita só de admin, uma policy POR COMANDO — a lição da 0079 é que
-- `with check` não é consultado no DELETE.
drop policy if exists familia_resp_log_admin_insere on familia_responsavel_log;
create policy familia_resp_log_admin_insere on familia_responsavel_log
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);
drop policy if exists familia_resp_log_admin_altera on familia_responsavel_log;
create policy familia_resp_log_admin_altera on familia_responsavel_log
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null)
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null);
drop policy if exists familia_resp_log_admin_apaga on familia_responsavel_log;
create policy familia_resp_log_admin_apaga on familia_responsavel_log
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro or auth.uid() is null);

-- O que já existe: o booleano de hoje vira o ponteiro de agora.
update familias f
   set responsavel_id = c.id
  from clientes c
 where c.familia_id = f.id
   and c.responsavel_financeiro
   and f.responsavel_id is null;

commit;

-- ---------------------------------------------------------------------
-- 2 · A PORTA ÚNICA PARA TROCAR O CONTATO FINANCEIRO
--
-- Três coisas têm de acontecer juntas, ou nenhuma: o ponteiro da família, o
-- booleano dos contatos (que meio sistema ainda lê) e o log. Feito na tela,
-- uma falha no meio deixa duas pessoas marcadas como responsáveis — e o índice
-- único `idx_familia_um_responsavel` recusaria a segunda, deixando a família
-- sem nenhuma.
-- ---------------------------------------------------------------------
-- O MIOLO, SEM GUARDA DE SESSÃO.
--
-- Ele existe separado porque o gatilho do primeiro contato (item 3) roda em
-- situações onde NÃO há sessão de usuário: uma importação pela service role,
-- um seed, um `insert` de manutenção. Chamar a função pública dali fazia o
-- cadastro do contato estourar com `sem_org` — foi assim que esta migration
-- quebrou um teste antigo, e o teste estava certo.
--
-- A organização vem por PARÂMETRO, e não de `current_org_id()`: quem chama já
-- sabe de qual org é a linha que está gravando.
create or replace function public.sureya_definir_responsavel_interno(
  p_org     uuid,
  p_familia uuid,
  p_cliente uuid default null,
  p_motivo  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := p_org;
  v_ja  uuid;
begin
  -- O contato tem de ser DESTA família. Sem esta guarda, um id errado colado no
  -- lugar faria a cobrança de uma família apontar para a pessoa de outra.
  if p_cliente is not null then
    perform 1 from clientes
     where id = p_cliente and org_id = v_org and familia_id = p_familia;
    if not found then
      raise exception 'contato_nao_e_desta_familia' using errcode = '23514';
    end if;
  end if;

  select responsavel_id into v_ja from familias where id = p_familia and org_id = v_org;
  if not found then
    raise exception 'familia_nao_encontrada' using errcode = '42501';
  end if;

  -- Convergente: repor o mesmo contato não gera linha nova no log nem mexe em
  -- nada. Sem isto, salvar a ficha duas vezes escreveria duas trocas.
  if v_ja is not distinct from p_cliente then
    return;
  end if;

  -- A ORDEM IMPORTA. O índice único é `(familia_id) where responsavel_financeiro`:
  -- limpar antes de marcar é o que impede o erro de chave duplicada no instante
  -- entre as duas escritas.
  update clientes set responsavel_financeiro = false
   where familia_id = p_familia and org_id = v_org and responsavel_financeiro;

  if p_cliente is not null then
    update clientes set responsavel_financeiro = true where id = p_cliente;
  end if;

  update familias set responsavel_id = p_cliente, updated_at = now()
   where id = p_familia and org_id = v_org;

  -- O jazigo segue a família. `cliente_id` no túmulo é campo derivado desde
  -- esta migration: quem manda é a família, e o contato é uma consequência.
  update tumulos set cliente_id = p_cliente
   where familia_id = p_familia and org_id = v_org
     and cliente_id is distinct from p_cliente;

  insert into familia_responsavel_log (org_id, familia_id, cliente_id, por, motivo)
  values (v_org, p_familia, p_cliente, auth.uid(), nullif(btrim(coalesce(p_motivo,'')), ''));
end $$;

comment on function public.sureya_definir_responsavel_interno(uuid, uuid, uuid, text) is
  'O miolo da troca de contato financeiro, sem guarda de sessao. Chamado pelo gatilho do primeiro contato, que roda em importacao e seed — onde nao ha sessao.';

revoke execute on function public.sureya_definir_responsavel_interno(uuid, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.sureya_definir_responsavel_interno(uuid, uuid, uuid, text) to service_role;

-- A PORTA PÚBLICA: as guardas, e depois o miolo.
create or replace function public.sureya_definir_responsavel(
  p_familia uuid,
  p_cliente uuid default null,
  p_motivo  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := current_org_id();
begin
  if v_org is null then raise exception 'sem_org' using errcode = '42501'; end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  perform sureya_definir_responsavel_interno(v_org, p_familia, p_cliente, p_motivo);
end $$;

comment on function public.sureya_definir_responsavel(uuid, uuid, text) is
  'Troca o contato financeiro da familia: ponteiro, booleano dos contatos, jazigos e log, tudo numa transacao. p_cliente nulo deixa a familia sem contato, que e estado legitimo.';

revoke execute on function public.sureya_definir_responsavel(uuid, uuid, text) from public, anon;
grant  execute on function public.sureya_definir_responsavel(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3 · O PRIMEIRO CONTATO DE UMA FAMÍLIA ASSUME A CONTA
--
-- Família criada sozinha e depois um contato acrescentado: sem isto ninguém
-- vira responsável, e a família fica com contato e sem cobrança — pior que sem
-- contato nenhum, porque parece resolvida.
-- ---------------------------------------------------------------------
create or replace function public.sureya_primeiro_contato_assume()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tem uuid;
begin
  if new.familia_id is null then return new; end if;
  select responsavel_id into v_tem from familias where id = new.familia_id;
  if v_tem is null then
    -- O MIOLO, e não a porta pública: este gatilho roda em importação e em
    -- seed, onde não há sessão e `current_org_id()` volta nulo. `new.org_id` é
    -- a org certa e está aqui na linha.
    perform sureya_definir_responsavel_interno(new.org_id, new.familia_id, new.id,
                                               'primeiro contato cadastrado nesta familia');
  end if;
  return new;
end $$;

drop trigger if exists trg_primeiro_contato_assume on clientes;
create trigger trg_primeiro_contato_assume
  after insert on clientes
  for each row execute function public.sureya_primeiro_contato_assume();

-- ---------------------------------------------------------------------
-- 4 · O JAZIGO PASSA A SEGUIR A FAMÍLIA (inverte a 0081)
--
-- A 0081 dizia: "jazigo com dono pertence à família do dono". Estava certa
-- enquanto o dono vinha primeiro. Agora a família vem primeiro, e a regra
-- inverte: **jazigo de uma família aponta para o contato financeiro dela** —
-- inclusive quando esse contato não existe.
--
-- A regra antiga continua valendo no sentido que ainda importa: jazigo que
-- chega só com dono (a importação de planilha) deduz a família dele.
-- ---------------------------------------------------------------------
create or replace function public.sureya_jazigo_herda_familia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fam  uuid;
  v_resp uuid;
begin
  -- (a) Chegou família: ela manda. `cliente_id` é derivado dela.
  if new.familia_id is not null then
    select responsavel_id into v_resp from familias where id = new.familia_id;

    -- Só sobrescreve quando o túmulo não traz contato ou traz um que NÃO é
    -- desta família. Um contato desta mesma família, escolhido de propósito,
    -- é respeitado — pode ser o irmão que cuida deste jazigo específico.
    if new.cliente_id is null then
      new.cliente_id := v_resp;
    else
      perform 1 from clientes
       where id = new.cliente_id and familia_id = new.familia_id;
      if not found then
        new.cliente_id := v_resp;
      end if;
    end if;
    return new;
  end if;

  -- (b) Chegou só o dono (importação): a família se deduz dele.
  if new.cliente_id is not null then
    select c.familia_id into v_fam from clientes c where c.id = new.cliente_id;
    new.familia_id := v_fam;
  end if;

  return new;
end $$;

comment on function public.sureya_jazigo_herda_familia is
  'Jazigo segue a FAMILIA: cliente_id e derivado do contato financeiro dela. Quando o jazigo chega so com dono (importacao), a familia se deduz dele.';

-- ---------------------------------------------------------------------
-- 5 · O DÉBITO É DA FAMÍLIA, NÃO DO CONTATO
--
-- `sureya_concluir_lavagem` decide lançar com `if v_s.cliente_id is not null`.
-- Família sem contato -> `cliente_id` nulo -> a limpeza acontece, a foto sai, e
-- a cobrança **não existe**, sem erro nenhum. Meses depois, quando o contato
-- aparecesse, o histórico estaria vazio.
--
-- POR QUE POR SUBSTITUIÇÃO, E NÃO RECOPIANDO A FUNÇÃO
-- Ela tem 274 linhas. Copiá-las para cá cria uma SEGUNDA cópia no repositório,
-- e cópia envelhece em silêncio — é assim que nasce a deriva que este banco já
-- pagou caro. A substituição mantém uma cópia só (a da 0073) e diz exatamente
-- o que mudou. O `if not found` abaixo é a trava: se o texto original não
-- estiver lá — porque outra migration já mexeu —, a migration FALHA em vez de
-- aplicar um remendo em cima do que ela não reconhece.
-- ---------------------------------------------------------------------
do $$
declare
  v_def   text;
  v_velho text := 'if v_s.cliente_id is not null and v_momento <> ''antes'' and v_valor > 0';
  v_novo  text := 'if v_familia is not null and v_momento <> ''antes'' and v_valor > 0';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sureya_concluir_lavagem';

  if v_def is null then
    raise exception '0091: sureya_concluir_lavagem nao existe';
  end if;

  -- Já aplicada? Sai sem fazer nada (convergente).
  if position(v_novo in v_def) > 0 then
    raise notice '0091: o debito ja e da familia — nada a fazer';
    return;
  end if;

  if position(v_velho in v_def) = 0 then
    raise exception '0091: nao achei a condicao que eu esperava em sureya_concluir_lavagem. '
                    'Alguem mudou a funcao: confira antes de continuar.';
  end if;

  execute replace(v_def, v_velho, v_novo);
end $$;

-- ---------------------------------------------------------------------
-- 6 · AS DUAS LISTAS DE TRIAGEM DO CADASTRO
-- ---------------------------------------------------------------------
create or replace view sureya_familias_sem_contato
with (security_invoker = true) as
  select f.id, f.org_id, f.nome, f.contratado, f.created_at,
         (select count(*) from tumulos t where t.familia_id = f.id) as jazigos,
         (select count(*) from clientes c where c.familia_id = f.id) as contatos
    from familias f
   where f.responsavel_id is null;

comment on view sureya_familias_sem_contato is
  'Familias que existem e ainda nao se sabe com quem falar. Estado legitimo — e uma lista de trabalho, nao um erro.';

create or replace view sureya_jazigos_sem_familia
with (security_invoker = true) as
  select t.id, t.org_id, t.identificacao, t.codigo, t.falecido_nome,
         q.codigo as quadra, r.nome as rua, t.ordem_na_rua, t.created_at
    from tumulos t
    left join quadras q on q.id = t.quadra_id
    left join ruas r on r.id = t.rua_id
   where t.familia_id is null;

comment on view sureya_jazigos_sem_familia is
  'Jazigos cadastrados no campo que ainda nao tem familia. Sao 81 em 22/08, de 204 cadastrados.';

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select count(*) from sureya_jazigos_sem_familia;
-- select count(*) from sureya_familias_sem_contato;
-- select f.nome, c.nome as responsavel, l.desde, l.motivo
--   from familias f
--   left join clientes c on c.id = f.responsavel_id
--   left join familia_responsavel_log l on l.familia_id = f.id
--  order by l.desde desc limit 20;
