-- ============================================================================
-- O ESPELHO `movimentos` -> `conta_corrente`, PROVADO A CADA COMMIT
--
-- Roda dentro de `migrar-limpo.sh`, num banco reconstruido do zero. Cada bloco
-- e uma das formas de o espelho mentir; se qualquer uma voltar, o CI para.
--
-- Nao ha como testar isto no `simular.ts`: o fake-supabase nao executa gatilho.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;   -- as linhas "ok" do CI saem daqui

insert into orgs (id, nome) values ('11111111-1111-1111-1111-111111111111','CI') on conflict do nothing;
insert into familias (id, org_id, nome)
  values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Familia CI')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111',
          'Responsavel CI','5511900000000','22222222-2222-2222-2222-222222222222', true)
  on conflict (id) do nothing;

create or replace function ci_exige(nome text, real_ numeric, esperado numeric) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'ESPELHO FALHOU — %: veio %, esperado %', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- MESMA REGRA DE `calcularSaldo()` em src/lib/financeiro.ts:
--   `rejeitado` sai fora; `a_conferir` nao e saldo — e comprovante informado e
--   ainda nao batido com o extrato, que e o que a conferencia existe para
--   segurar. Se esta funcao e a de la divergirem, o SQL e o TypeScript passam a
--   contar dinheiro de jeitos diferentes.
create or replace function ci_saldo() returns numeric language sql as $$
  select coalesce(sum(case when tipo::text='credito' then valor else -valor end),0)
    from conta_corrente
   where status_conc::text not in ('rejeitado','a_conferir') $$;

create or replace function ci_movimento(v numeric, desc_ text, id_ uuid default gen_random_uuid())
returns uuid language sql as $$
  insert into movimentos (id, org_id, cliente_id, tipo, valor, origem, status_conc, data, descricao)
  values (id_, '11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
          'debito', v, 'ajuste', 'confirmado', '2026-08-01', desc_)
  returning id $$;

-- ---------------------------------------------------------------- 1. insere
delete from movimentos; delete from conta_corrente;
select ci_movimento(100, 'debito espelhado');
select ci_exige('insert espelha no razao da familia', ci_saldo(), -100);

-- ---------------------------------------------------------------- 2. apaga
-- Tres funcoes de producao apagam movimento (sureya_excluir_servico,
-- sureya_desidentificar_entrada, sureya_saldo_abertura). Antes da 0072 o
-- espelho sobrevivia e a familia continuava devendo por um lancamento que
-- nao existe mais.
delete from movimentos;
select ci_exige('delete leva o espelho junto', (select count(*) from conta_corrente), 0);

-- ---------------------------------------------------------------- 3. corrige
-- `sureya_saldo_abertura` apaga a abertura anterior e insere a nova. Antes da
-- 0072 as duas somavam: 500 corrigido para 300 virava 800 na ficha.
delete from movimentos; delete from conta_corrente;
select ci_movimento(500, 'Saldo de abertura (migracao)');
delete from movimentos where descricao like 'Saldo de abertura%';
select ci_movimento(300, 'Saldo de abertura (migracao)');
select ci_exige('abertura corrigida nao soma com a anterior', ci_saldo(), -300);

-- ---------------------------------------------------------------- 4. valor
delete from movimentos; delete from conta_corrente;
select ci_movimento(70, 'valor a corrigir', '44444444-4444-4444-4444-444444444444');
update movimentos set valor = 55 where id = '44444444-4444-4444-4444-444444444444';
select ci_exige('correcao de valor chega no espelho', ci_saldo(), -55);

-- ---------------------------------------------------------------- 5. status
delete from movimentos; delete from conta_corrente;
insert into movimentos (id, org_id, cliente_id, tipo, valor, origem, status_conc, data, descricao)
  values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',
          '33333333-3333-3333-3333-333333333333','credito', 90, 'pix_comprovante',
          'a_conferir','2026-08-02','Comprovante');
select ci_exige('comprovante a conferir NAO vira saldo', ci_saldo(), 0);
update movimentos set status_conc = 'confirmado' where id = '55555555-5555-5555-5555-555555555555';
select ci_exige('conferido vira saldo', ci_saldo(), 90);

-- ---------------------------------------------------------------- 6. nativo
-- Lancamento nascido direto em conta_corrente tem movimento_id nulo e nao pode
-- ser levado pelo cascade de ninguem.
delete from movimentos; delete from conta_corrente;
insert into conta_corrente (org_id, familia_id, tipo, origem, valor, data, status_conc, descricao)
  values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
          'debito','abertura', 240, '2026-08-17','confirmado','Situacao inicial');
select ci_movimento(10, 'so para apagar depois');
delete from movimentos;
select ci_exige('lancamento nativo sobrevive', ci_saldo(), -240);

-- ---------------------------------------------------------------- 7. duas vezes
-- Convergencia: reaplicar o mesmo movimento nao pode duplicar o espelho.
delete from movimentos; delete from conta_corrente;
select ci_movimento(33, 'unico', '66666666-6666-6666-6666-666666666666');
select ci_exige('um movimento, uma linha espelhada', (select count(*) from conta_corrente), 1);

delete from movimentos; delete from conta_corrente;
delete from clientes  where id = '33333333-3333-3333-3333-333333333333';
delete from familias  where id = '22222222-2222-2222-2222-222222222222';
drop function ci_exige(text, numeric, numeric);
drop function ci_saldo();
drop function ci_movimento(numeric, text, uuid);
