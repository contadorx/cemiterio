-- ============================================================================
-- 0138 — O TERMO TEM VERSAO, E QUEM ACEITOU ACEITOU UMA DELAS
-- ============================================================================
--
-- O QUE SE MEDIU EM PRODUCAO, EM 27/08
--
--   339  contatos
--    62  marcados como tendo autorizado o contato
--    59  deles vieram de UMA importacao em planilha, em 18/07
--     3  vieram da tela de cadastro, entre 26/07 e 17/08
--     0  caracteres em `orgs.aviso_privacidade` — NUNCA HOUVE TEXTO
--
-- A ultima linha e a que importa. O sistema afirma que 62 pessoas
-- autorizaram, e nao existe documento nenhum: o consentimento e uma caixinha
-- com o rotulo "A familia autorizou o contato por WhatsApp (LGPD)". Nao da
-- para dizer o que foi dito a elas, porque nada foi escrito.
--
-- E `aviso_privacidade` e um campo de texto livre, unico e editavel. Se
-- alguem escrevesse um texto ali hoje e o mudasse amanha, as 62 pessoas
-- passariam a "ter aceitado" o texto novo, sem nunca o terem visto. Um campo
-- que muda em silencio nao e um termo — e um rascunho.
--
-- POR QUE ISTO NAO PODE ESPERAR
--
-- Quase tudo neste sistema da para consertar depois: um valor errado se
-- recalcula, uma agenda torta se refaz. Este nao. Nao ha como voltar em
-- setembro e descobrir o que foi dito a uma familia em julho. Cada dia de
-- cadastro acrescenta gente a uma lista que ja nasce sem resposta.
--
-- O QUE ESTA MIGRATION FAZ
--
--   termos_privacidade   as versoes. Publicada, uma versao NAO se edita mais —
--                        mudar o texto cria a proxima. E isso que faz dela
--                        uma versao, e nao um campo.
--   consentimentos       o historico. Consentimento e um EVENTO, nao uma
--                        coluna: dado e retirado precisam os dois aparecer.
--
-- O QUE ELA DE PROPOSITO **NAO** FAZ
--
-- Nao carimba as 62 antigas com a versao 1. Elas aceitaram alguma coisa que
-- ninguem escreveu, e inventar que foi o texto de hoje seria fabricar um fato
-- juridico — exatamente o "vazio nao e zero" do projeto, agora sobre uma
-- afirmacao que se faz a respeito de outra pessoa. Elas entram no historico
-- com `termo_id` NULO, que quer dizer o que realmente se sabe: **aceitou
-- antes de existir termo, e nao da para dizer o que**.
--
-- E nao escreve texto de privacidade nenhum. Que politica a casa adota e
-- decisao da Sureya, nao minha. A tela pede o texto; a versao 1 nasce quando
-- ela publicar.
-- ============================================================================

-- ---------------------------------------------------------------- 1
-- AS VERSOES DO TERMO
-- ---------------------------------------------------------------- 
create table if not exists termos_privacidade (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  versao       int  not null,
  titulo       text not null,
  texto        text not null,
  -- RASCUNHO ENQUANTO NAO PUBLICADO. So a publicada pode ser aceita por
  -- alguem: aceitar um rascunho que ainda vai mudar e o defeito original.
  publicado_em timestamptz,
  publicado_por uuid,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  constraint termos_privacidade_versao_unica unique (org_id, versao),
  constraint termos_privacidade_texto_nao_vazio check (btrim(texto) <> ''),
  constraint termos_privacidade_titulo_nao_vazio check (btrim(titulo) <> '')
);

create index if not exists ix_termos_org_versao on termos_privacidade (org_id, versao desc);

alter table termos_privacidade enable row level security;

drop policy if exists termos_sel on termos_privacidade;
drop policy if exists termos_ins on termos_privacidade;
drop policy if exists termos_upd on termos_privacidade;
drop policy if exists termos_del on termos_privacidade;

-- UMA POLICY POR COMANDO. O `delete` nunca consulta `with check` — foi a
-- licao da 0079, e uma restritiva sem a de delete deixa a porta de tras
-- aberta justamente no comando que destroi.
create policy termos_sel on termos_privacidade as restrictive
  for select using (org_id = current_org_id());
create policy termos_ins on termos_privacidade as restrictive
  for insert with check (org_id = current_org_id());
create policy termos_upd on termos_privacidade as restrictive
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy termos_del on termos_privacidade as restrictive
  for delete using (org_id = current_org_id());

create policy termos_tudo on termos_privacidade
  for all using (true) with check (true);

-- ---------------------------------------------------------------- 2
-- VERSAO PUBLICADA NAO MUDA MAIS
--
-- Sem esta trava, "versao" e enfeite: bastaria editar o texto da versao 1
-- para que todo mundo passasse a ter aceitado outra coisa. O gatilho deixa
-- despublicar (erro de publicacao acontece) e deixa o texto ser corrigido
-- ENQUANTO e rascunho — mas nao as duas coisas ao mesmo tempo.
-- ---------------------------------------------------------------- 
create or replace function sureya_termo_publicado_nao_muda()
returns trigger
language plpgsql
as $$
begin
  if old.publicado_em is not null
     and new.publicado_em is not null
     and (new.texto is distinct from old.texto
          or new.titulo is distinct from old.titulo
          or new.versao is distinct from old.versao) then
    raise exception 'termo_publicado_nao_muda'
      using hint = 'Publique uma versao nova em vez de reescrever esta.',
            errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists tg_termo_publicado_nao_muda on termos_privacidade;
create trigger tg_termo_publicado_nao_muda
  before update on termos_privacidade
  for each row execute function sureya_termo_publicado_nao_muda();

-- ---------------------------------------------------------------- 3
-- O HISTORICO DE CONSENTIMENTO
--
-- CONSENTIMENTO E UM EVENTO, NAO UMA COLUNA. `clientes.consentimento_em`
-- guarda um instante e nada mais: quem deu, tirou e deu de novo aparece como
-- se nunca tivesse tirado. Aqui cada ato deixa uma linha, e a coluna antiga
-- continua existindo como o estado atual — escrita pela MESMA transacao, para
-- as duas nunca discordarem (o defeito de forma de 0092, 0105, 0106, 0115).
-- ---------------------------------------------------------------- 
create table if not exists consentimentos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  cliente_id    uuid not null references clientes(id) on delete cascade,
  -- NULO QUER DIZER ALGUMA COISA: aceitou antes de existir termo, e nao da
  -- para dizer o que. E o unico registro honesto para as 62 de julho.
  termo_id      uuid references termos_privacidade(id) on delete restrict,
  versao        int,
  acao          text not null default 'aceitou',
  via           text,
  -- RELOGIO DE PAREDE, E NAO `now()`.
  --
  -- ACHADO PELO TESTE. `now()` devolve o instante em que a TRANSACAO comecou e
  -- nao anda dentro dela: dar e retirar a autorizacao na mesma transacao
  -- gravava os dois eventos com o mesmo carimbo, e "qual foi o ultimo" passava
  -- a ser sorteio. Numa tabela cuja unica serventia e dizer o que veio depois
  -- do que, isso e o defeito inteiro.
  em            timestamptz not null default clock_timestamp(),
  registrado_por uuid,
  observacao    text,
  constraint consentimentos_acao_conhecida check (acao in ('aceitou', 'retirou')),
  -- Um termo apontado tem de trazer a versao junto: ler o numero exige um
  -- join a menos, e se o termo for apagado o numero aceito sobrevive.
  constraint consentimentos_versao_acompanha check
    ((termo_id is null and versao is null) or (termo_id is not null and versao is not null))
);

create index if not exists ix_consentimentos_cliente on consentimentos (cliente_id, em desc);
create index if not exists ix_consentimentos_org on consentimentos (org_id, em desc);

alter table consentimentos enable row level security;

drop policy if exists consentimentos_sel on consentimentos;
drop policy if exists consentimentos_ins on consentimentos;
drop policy if exists consentimentos_upd on consentimentos;
drop policy if exists consentimentos_del on consentimentos;

create policy consentimentos_sel on consentimentos as restrictive
  for select using (org_id = current_org_id());
create policy consentimentos_ins on consentimentos as restrictive
  for insert with check (org_id = current_org_id());
create policy consentimentos_upd on consentimentos as restrictive
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy consentimentos_del on consentimentos as restrictive
  for delete using (org_id = current_org_id());

create policy consentimentos_tudo on consentimentos
  for all using (true) with check (true);

-- ---------------------------------------------------------------- 4
-- QUAL TERMO VALE AGORA
--
-- p_org EXPLICITO: `current_org_id()` e nulo fora de uma sessao de usuario
-- (licao da 0103), e esta funcao serve tambem a rotina que roda sem sessao.
-- ---------------------------------------------------------------- 
create or replace function sureya_termo_vigente(p_org uuid)
returns termos_privacidade
language sql
stable
security definer
set search_path = public
as $$
  select t.* from termos_privacidade t
   where t.org_id = p_org and t.publicado_em is not null
   order by t.versao desc
   limit 1;
$$;

-- ---------------------------------------------------------------- 5
-- REGISTRAR O CONSENTIMENTO — a MESMA porta de antes
--
-- A assinatura de dois argumentos e a da 0010 e continua valendo: as tres
-- chamadas que existem no codigo nao mudam. O que mudou e o que ela FAZ —
-- alem de carimbar a coluna, ela grava o evento com a versao vigente NAQUELE
-- INSTANTE. Uma so implementacao, uma so transacao.
--
-- SEM TERMO PUBLICADO ELA RECUSA. Antes daqui, marcar a caixinha registrava
-- um consentimento a um texto que nao existe — e e assim que se chega a 62
-- autorizacoes sem documento. Recusar e o unico jeito de a lista parar de
-- crescer. A tela explica o que fazer.
-- ---------------------------------------------------------------- 
create or replace function sureya_registrar_consentimento(p_cliente uuid, p_via text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_t   termos_privacidade;
begin
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;

  select * into v_t from sureya_termo_vigente(v_org);
  if v_t.id is null then
    raise exception 'sem_termo_publicado'
      using hint = 'Publique o aviso de privacidade em Configuracoes antes de registrar autorizacoes.',
            errcode = '23514';
  end if;

  update clientes
     set consentimento_em  = now(),
         consentimento_via = coalesce(p_via, 'whatsapp')
   where id = p_cliente and org_id = v_org;

  if not found then
    raise exception 'cliente_nao_encontrado' using errcode = '42501';
  end if;

  insert into consentimentos (org_id, cliente_id, termo_id, versao, acao, via, registrado_por)
  values (v_org, p_cliente, v_t.id, v_t.versao, 'aceitou', coalesce(p_via, 'whatsapp'), auth.uid());
end $$;

-- ---------------------------------------------------------------- 6
-- RETIRAR O CONSENTIMENTO
--
-- Existia so o caminho de dar. Retirar era `consentimento_em = null` numa
-- rota de contatos — some o instante e nao sobra rastro de que houve pedido.
-- Sob a LGPD o que importa e justamente poder mostrar que foi atendido.
-- ---------------------------------------------------------------- 
create or replace function sureya_retirar_consentimento(p_cliente uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid := current_org_id();
begin
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;

  update clientes set consentimento_em = null, consentimento_via = null
   where id = p_cliente and org_id = v_org;

  if not found then
    raise exception 'cliente_nao_encontrado' using errcode = '42501';
  end if;

  insert into consentimentos (org_id, cliente_id, acao, via, registrado_por, observacao)
  values (v_org, p_cliente, 'retirou', null, auth.uid(), nullif(btrim(coalesce(p_motivo,'')), ''));
end $$;

-- ---------------------------------------------------------------- 7
-- O QUE CADA PESSOA ACEITOU, E QUANTAS NAO SE SABE
--
-- A conta que a tela mostra. Ela NAO reconta por outro caminho: o "estado
-- atual" e a coluna `consentimento_em`, que e a mesma que todas as outras
-- telas leem, e a versao vem do ultimo evento de aceite.
-- ---------------------------------------------------------------- 
create or replace function sureya_consentimentos_por_versao(p_org uuid)
returns table (
  versao      int,
  titulo      text,
  quantos     int,
  desconhecida boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with atual as (
    select c.id as cliente_id,
           (select k.termo_id from consentimentos k
             where k.cliente_id = c.id and k.acao = 'aceitou'
             order by k.em desc limit 1) as termo_id,
           (select k.versao from consentimentos k
             where k.cliente_id = c.id and k.acao = 'aceitou'
             order by k.em desc limit 1) as versao
      from clientes c
     where c.org_id = p_org and c.consentimento_em is not null
  )
  select a.versao,
         t.titulo,
         count(*)::int,
         a.versao is null
    from atual a
    left join termos_privacidade t on t.id = a.termo_id
   group by a.versao, t.titulo
   order by a.versao nulls first;
$$;

-- ---------------------------------------------------------------- 8
-- AS QUE JA ESTAVAM LA — sem inventar o que foi dito a elas
--
-- ACHADO PELO TESTE. Isto era um `insert ... select` solto, rodado uma vez na
-- migration. Funcionava para as 62 de producao e nao era uma REGRA: qualquer
-- contato que chegasse depois com `consentimento_em` preenchido por fora — uma
-- importacao, uma correcao a mao no banco — ficaria de fora do historico para
-- sempre, e a conta por versao simplesmente nao o veria. Regra que so existe
-- como instrucao de uma vez nao e regra; foi a mesma licao do gatilho da 0136.
--
-- Convergente: `not exists` faz com que rodar de novo nunca duplique nem
-- desfaca. E `termo_id` nulo de proposito — ver o cabecalho.
-- ---------------------------------------------------------------- 
create or replace function sureya_semear_consentimentos_antigos(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  insert into consentimentos (org_id, cliente_id, termo_id, versao, acao, via, em, observacao)
  select c.org_id, c.id, null, null, 'aceitou', c.consentimento_via, c.consentimento_em,
         'registrado antes de o termo ter versao — nao ha como saber que texto foi apresentado'
    from clientes c
   where c.org_id = p_org
     and c.consentimento_em is not null
     and not exists (select 1 from consentimentos k where k.cliente_id = c.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

select sureya_semear_consentimentos_antigos(o.id) from orgs o;

-- ---------------------------------------------------------------- 9
-- QUEM PODE CHAMAR
--
-- SECURITY DEFINER IGNORA RLS: so o GRANT protege, e o Supabase concede
-- EXECUTE a `anon` POR PADRAO em `public` (licao da 0129). Estas devolvem e
-- escrevem consentimento de pessoa fisica — o dado mais sensivel do sistema.
-- ---------------------------------------------------------------- 
revoke execute on function sureya_termo_vigente(uuid)                  from public, anon;
revoke execute on function sureya_registrar_consentimento(uuid, text)  from public, anon;
revoke execute on function sureya_retirar_consentimento(uuid, text)    from public, anon;
revoke execute on function sureya_consentimentos_por_versao(uuid)      from public, anon;
revoke execute on function sureya_semear_consentimentos_antigos(uuid)  from public, anon;

grant execute on function sureya_termo_vigente(uuid)                  to authenticated, service_role;
grant execute on function sureya_registrar_consentimento(uuid, text)  to authenticated, service_role;
grant execute on function sureya_retirar_consentimento(uuid, text)    to authenticated, service_role;
grant execute on function sureya_consentimentos_por_versao(uuid)      to authenticated, service_role;
grant execute on function sureya_semear_consentimentos_antigos(uuid)  to authenticated, service_role;
