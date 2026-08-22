-- ============================================================================
-- SUREYA — 0074 · O RAZÃO ANTIGO VIRA HISTÓRIA
--
-- `movimentos` passa a ser SOMENTE LEITURA. Fim do Build 4.
--
-- POR QUE CONGELAR E NÃO APAGAR
-- ---------------------------------------------------------------------------
-- As duas linhas que restam são history de verdade — a primeira limpeza
-- cobrada e o primeiro Pix recebido do sistema. Apagar economizaria nada e
-- perderia a única prova de como a operação começou. Congelado, o histórico
-- continua legível e deixa de poder mudar.
--
-- O QUE JÁ ESTAVA PRONTO
-- ---------------------------------------------------------------------------
--   0071  o razão da família recebe o que faltava, e um espelho o alimenta
--   0072  o espelho também desfaz (`on delete cascade`)
--   0073  as treze funções passam a escrever no razão da família
--   ----  as 11 leituras já tinham migrado antes
--
-- Sobram duas funções tocando `movimentos`, e as duas só para manter os dois
-- lados iguais enquanto ele ainda podia mudar. Congelado, elas não precisam
-- mais — e é isso que esta migration remove.
--
-- CONFERIDO EM PRODUÇÃO ANTES DE ESCREVER
-- ---------------------------------------------------------------------------
--   2 linhas, as duas `confirmado`, as duas com espelho no razão da família.
--   Nada pendente de conferência. Congelar não deixa ninguém preso.
--
-- ============================================================================
-- A ARMADILHA QUE O CONGELAMENTO CRIA — E QUE VEM DA 0072
-- ============================================================================
-- A 0072 pôs `conta_corrente.movimento_id` em `ON DELETE CASCADE`, e estava
-- certa: enquanto o espelho vivia, linha espelhada não tinha vida própria, e
-- apagar o movimento tinha de apagar o reflexo — senão sobrava dívida fantasma.
--
-- Congelado o razão antigo, a mesma chave inverte de sinal. `movimento_id` para
-- de ser "o original deste reflexo" e passa a ser só PROCEDÊNCIA: de onde esta
-- linha veio, lá atrás. E aí o cascade vira uma bomba — quem apagar uma linha
-- de `movimentos` leva junto uma linha VIVA do razão da família.
--
-- A policy abaixo impede o delete, mas policy não alcança o service role, que é
-- justamente quem roda script de manutenção. Duas das seis linhas de
-- `conta_corrente` sumiriam sem aviso.
--
-- Por isso a chave sai. A coluna fica, como procedência.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) As duas funções param de tocar no razão antigo
-- ----------------------------------------------------------------------------

-- Só atualizava `movimentos` para acompanhar comprovante antigo. Agora o
-- comprovante nasce direto no razão da família (0073, via src/lib/conciliacao),
-- e as linhas velhas estão congeladas — não há mais o que sincronizar.
create or replace function public.sureya_conciliar_comprovante(
  p_comprovante uuid, p_aprovar boolean
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_status sureya_status_conc;
  v_org    uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_status := case when p_aprovar then 'confirmado' else 'rejeitado' end;

  update comprovantes set status = v_status
   where id = p_comprovante and org_id = current_org_id()
  returning org_id into v_org;

  if v_org is null then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  update conta_corrente set status_conc = v_status
   where comprovante_id = p_comprovante and org_id = current_org_id();
end
$function$;

-- O `delete from movimentos` era uma garantia ("não deveria haver, mas
-- garante"). Congelado, ele passaria a DERRUBAR a exclusão de serviço inteira
-- com `permission denied` — a garantia viraria o defeito.
create or replace function public.sureya_excluir_servico(p_servico uuid)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_status text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then return false; end if;

  select status::text into v_status from servicos where id = p_servico and org_id = v_org;
  if v_status is null then return false; end if;
  if v_status = 'executado' then
    raise exception 'servico_ja_executado';   -- executado vira histórico, não se apaga
  end if;

  delete from ocorrencias    where servico_id = p_servico;
  delete from avaliacoes     where servico_id = p_servico;
  delete from conta_corrente where servico_id = p_servico and org_id = v_org;
  delete from servicos       where id = p_servico and org_id = v_org;
  return true;
end
$function$;


-- ----------------------------------------------------------------------------
-- 2) O espelho é aposentado
--
-- Ele existia para manter os dois razões iguais enquanto os dois recebiam
-- escrita. Com `movimentos` congelado, não há mais o que espelhar — e um
-- gatilho que nunca dispara é pior que nenhum: quem ler o esquema daqui a um
-- ano vai achar que os dois razões ainda conversam.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_espelha_movimento_na_conta on movimentos;
drop trigger if exists trg_espelha_status_movimento   on movimentos;
drop function if exists public.sureya_espelha_movimento_na_conta();
drop function if exists public.sureya_espelha_status_movimento();


-- ----------------------------------------------------------------------------
-- 3) A chave vira procedência (ver o cabeçalho)
-- ----------------------------------------------------------------------------
alter table conta_corrente drop constraint if exists conta_corrente_movimento_id_fkey;

comment on column conta_corrente.movimento_id is
  'PROCEDENCIA, nao vinculo vivo. De qual linha do razao antigo esta veio, no '
  'tempo em que os dois conviviam. A chave estrangeira saiu na 0074: com '
  '`movimentos` congelado, o ON DELETE CASCADE da 0072 deixaria de proteger e '
  'passaria a poder levar uma linha VIVA do razao da familia junto.';


-- ----------------------------------------------------------------------------
-- 4) O congelamento, em duas camadas
--
-- Policy RESTRICTIVE entra com E: some com a permissão de escrita para quem
-- passa por RLS, não importa quantas policies permissivas existam.
--
-- Mas o service role IGNORA RLS — e é ele quem roda script de manutenção, que é
-- exatamente a mão que apagaria uma linha por engano. Contra ele o que vale é
-- privilégio de tabela, que o Postgres confere antes e para todo mundo.
--
-- Uma camada só seria teatro.
-- ----------------------------------------------------------------------------
alter table movimentos enable row level security;

drop policy if exists movimentos_congelado on movimentos;
create policy movimentos_congelado on movimentos
  as restrictive
  for all
  using (true)          -- ler continua permitido
  with check (false);   -- escrever, nunca

comment on policy movimentos_congelado on movimentos is
  'Build 4 (0074): o razao antigo e historia. Leitura livre, escrita fechada. '
  'RESTRICTIVE entra com E — nenhuma policy permissiva reabre isto.';

revoke insert, update, delete, truncate on movimentos
  from anon, authenticated, service_role;

comment on table movimentos is
  'CONGELADO em 22/08/2026 (migration 0074). Razao antigo, por PESSOA. A fonte '
  'da verdade financeira e `conta_corrente`, por FAMILIA — ver DECISOES.md D-01 '
  'e BUILD_4.md. Esta tabela existe para o historico continuar legivel; nada '
  'escreve nela.';


-- ----------------------------------------------------------------------------
-- 5) O histórico, com nome de histórico
--
-- Quem for procurar dinheiro antigo vai procurar por `movimentos`. A view diz,
-- no nome, o que a tabela é — e junta a família, que a tabela nunca teve.
-- ----------------------------------------------------------------------------
create or replace view sureya_historico_razao_antigo as
select m.id,
       m.data,
       m.tipo::text   as tipo,
       m.valor,
       m.origem::text as origem,
       m.status_conc::text as status,
       m.descricao,
       m.cliente_id,
       c.nome         as pessoa,
       c.familia_id,
       f.nome         as familia,
       m.servico_id,
       exists (select 1 from conta_corrente l where l.movimento_id = m.id) as tem_par_no_razao_novo
  from movimentos m
  left join clientes c on c.id = m.cliente_id
  left join familias f on f.id = c.familia_id
 where m.org_id = current_org_id()
 order by m.data;

comment on view sureya_historico_razao_antigo is
  'O razao antigo, congelado na 0074, com a familia ao lado — que `movimentos` '
  'nunca teve. Para consulta de historico; o saldo vem de `conta_corrente`.';

commit;


-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
--   -- escrever tem de falhar (rode como service role tambem)
--   insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, data)
--   values (current_org_id(), null, 'debito', 1, 'ajuste', 'confirmado', current_date);
--   -- esperado: permission denied for table movimentos
--
--   -- ler continua funcionando
--   select * from sureya_historico_razao_antigo;   -- 2 linhas
--
--   -- o saldo nao mudou
--   select sum(case when tipo::text='credito' then valor else -valor end)
--     from conta_corrente where status_conc::text='confirmado';   -- -170,00
--
-- ROLLBACK
--   `grant insert, update, delete on movimentos to service_role;` e
--   `drop policy movimentos_congelado on movimentos;` devolvem a escrita. Os
--   gatilhos de espelho estao na 0071 e na 0072 se precisarem voltar — mas so
--   precisam se alguma escrita voltar para o razao antigo, o que nao deve
--   acontecer.
-- ============================================================================
