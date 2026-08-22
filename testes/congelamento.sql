-- ============================================================================
-- O RAZÃO ANTIGO ESTÁ CONGELADO, PROVADO A CADA COMMIT
--
-- Substitui `testes/espelho.sql`. O espelho `movimentos` -> `conta_corrente`
-- existiu entre a 0071 e a 0074, para os dois razões não divergirem enquanto os
-- dois recebiam escrita. A 0074 aposentou os dois gatilhos: não há mais o que
-- espelhar, porque não há mais escrita do outro lado.
--
-- O que precisa ser provado mudou junto. Não é mais "o reflexo acompanha" — é
-- "o razão antigo não muda mais, e o novo não depende dele".
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- Sessao de admin: `sureya_lancar` (item 5) chama `current_org_id()`, que le
-- `membros` por auth.uid() e exige membro ATIVO desde a 0055.
insert into auth.users (id, email)
  values ('c0c0c0c0-0000-0000-0000-00000000000a','congelado@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','c0c0c0c0-0000-0000-0000-00000000000a', false);

insert into orgs (id, nome) values ('c0c0c0c0-0000-0000-0000-000000000001','CI Congelado')
  on conflict do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('c0c0c0c0-0000-0000-0000-000000000001','c0c0c0c0-0000-0000-0000-00000000000a','admin', true)
  on conflict do nothing;
insert into familias (id, org_id, nome)
  values ('c0c0c0c0-0000-0000-0000-000000000002','c0c0c0c0-0000-0000-0000-000000000001','Fam Congelada')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('c0c0c0c0-0000-0000-0000-000000000003','c0c0c0c0-0000-0000-0000-000000000001',
          'Resp','5511900000009','c0c0c0c0-0000-0000-0000-000000000002', true)
  on conflict (id) do nothing;

create or replace function ci3(nome text, ok boolean, detalhe text default '') returns void
language plpgsql as $$
begin
  if not ok then
    raise exception 'CONGELAMENTO FALHOU — % %', nome, detalhe;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- ---------------------------------------------------------------- 1. escrita
-- A PROVA CENTRAL — e ela tem de rodar nos PAPEIS REAIS.
--
-- A primeira versao deste teste rodava como `postgres` e passava o insert. Nao
-- era o congelamento falhando: superusuario ignora RLS **e** privilegio de
-- tabela, entao testar por ali nao prova nada. O que vale sao os tres papeis
-- que o Supabase realmente usa.
--
-- `service_role` e o que mais importa: ele ignora RLS, entao policy nao o
-- alcanca. So o `revoke` de privilegio o segura — e e por isso que a 0074 usa
-- as duas camadas.
do $$
declare papel text; passou text := '';
begin
  foreach papel in array array['service_role','authenticated','anon'] loop
    begin
      execute format('set local role %I', papel);
      begin
        insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, data, descricao)
        values ('c0c0c0c0-0000-0000-0000-000000000001','c0c0c0c0-0000-0000-0000-000000000003',
                'debito', 10, 'ajuste', 'confirmado', current_date, 'nao deveria entrar');
        passou := passou || papel || ' ';
      exception when others then
        null;   -- recusado, que e o esperado
      end;
      reset role;
    end;
  end loop;

  if passou <> '' then
    raise exception 'CONGELAMENTO FALHOU — estes papeis conseguiram escrever: %', passou;
  end if;
  perform ci3('insert em `movimentos` e recusado para service_role, authenticated e anon', true);
end $$;

-- ---------------------------------------------------------------- 2. leitura
select ci3('ler `movimentos` continua permitido',
           (select count(*) from movimentos) >= 0);
select ci3('a view de historico existe e responde',
           (select count(*) from sureya_historico_razao_antigo) >= 0);

-- ---------------------------------------------------------------- 3. gatilhos
select ci3('os gatilhos de espelho foram aposentados',
           (select count(*) from pg_trigger
             where tgname in ('trg_espelha_movimento_na_conta','trg_espelha_status_movimento')) = 0);

-- ---------------------------------------------------------------- 4. a chave
-- A ARMADILHA QUE A 0072 CRIOU E A 0074 DESARMOU.
--
-- Enquanto o espelho vivia, `conta_corrente.movimento_id` em ON DELETE CASCADE
-- estava certo: linha espelhada nao tinha vida propria. Congelado o razao
-- antigo, a mesma chave passaria a poder levar uma linha VIVA do razao da
-- familia junto com uma linha de historico apagada por engano.
select ci3('a chave para o razao antigo nao apaga mais nada em cascata',
           (select count(*) from pg_constraint
             where conname = 'conta_corrente_movimento_id_fkey') = 0);

-- ---------------------------------------------------------------- 5. o novo
-- O razao da familia continua aceitando escrita normalmente — congelar um nao
-- pode ter fechado o outro.
select sureya_lancar('c0c0c0c0-0000-0000-0000-000000000003','debito',30,'lavagem','Limpeza','2026-08-20');
select ci3('o razao da FAMILIA continua aberto para escrita',
           (select count(*) from conta_corrente
             where familia_id='c0c0c0c0-0000-0000-0000-000000000002') = 1);

-- ---------------------------------------------------------------- limpeza
delete from conta_corrente where org_id='c0c0c0c0-0000-0000-0000-000000000001';
delete from clientes        where org_id='c0c0c0c0-0000-0000-0000-000000000001';
delete from familias        where org_id='c0c0c0c0-0000-0000-0000-000000000001';
delete from membros         where org_id='c0c0c0c0-0000-0000-0000-000000000001';
delete from orgs            where id='c0c0c0c0-0000-0000-0000-000000000001';
delete from auth.users      where id='c0c0c0c0-0000-0000-0000-00000000000a';
drop function ci3(text, boolean, text);
