-- ============================================================================
-- A CONFERENCIA CONTA PROBLEMAS, NAO SINTOMAS (0141)
--
-- Medido em producao em 28/08: 363 familias, 293 com pendencia obrigatoria — e
-- a lista de tipos tinha o numero 122 QUATRO VEZES:
--
--   jazigo cadastrado 122 · jazigo com quadra 122 · ritmo 122 · valor 122
--
-- Sao as 122 familias sem jazigo nenhum. Tres desses itens diziam,
-- literalmente, "nenhum jazigo para conferir" — eles nao encontraram problema,
-- eles nao tiveram o que olhar. A soma das pendencias era 838 para 293
-- familias.
--
-- O DEFEITO E MUDO E ENSINA A IGNORAR O NUMERO. Quem varre a lista cadastra o
-- jazigo de UMA familia e ve QUATRO pendencias sumirem sem ter feito mais
-- nada. Depois disso, "293 com pendencia" nao quer dizer coisa nenhuma.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci41(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'CONFERENCIA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into auth.users (id, email)
  values ('41414141-0000-0000-0000-000000000001','conf@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','41414141-0000-0000-0000-000000000001', false);

insert into orgs (id, nome) values ('41414141-4141-4141-4141-414141414141','CI Conferencia')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('41414141-4141-4141-4141-414141414141','41414141-0000-0000-0000-000000000001','admin', true)
  on conflict do nothing;

do $$
declare
  v_org uuid := '41414141-4141-4141-4141-414141414141';
  v_cem uuid := '41414141-0000-0000-0000-0000000000ce';
  v_qua uuid := '41414141-0000-0000-0000-0000000000da';
  -- A FAMILIA SEM JAZIGO: o caso das 122.
  f_vazia uuid := '41414141-0000-0000-0000-0000000000f1';
  c_vazia uuid := '41414141-0000-0000-0000-0000000000c1';
  -- A FAMILIA COM JAZIGO e o cadastro pela metade: as pendencias dela sao
  -- de verdade, e tem de continuar aparecendo.
  f_meia  uuid := '41414141-0000-0000-0000-0000000000f2';
  c_meia  uuid := '41414141-0000-0000-0000-0000000000c2';
  t_meia  uuid := '41414141-0000-0000-0000-0000000000a2';
  v_n int; v_sit text;
begin
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;

  -- ---------------------------------------------------------------- a vazia
  insert into familias (id, org_id, nome) values (f_vazia, v_org, 'Sem Jazigo')
    on conflict (id) do nothing;
  insert into clientes (id, org_id, familia_id, nome, telefone)
    values (c_vazia, v_org, f_vazia, 'Dona Alzira', '11988887777') on conflict (id) do nothing;
  update familias set responsavel_id = c_vazia where id = f_vazia;

  -- =========================================================================
  -- SEM JAZIGO, A PENDENCIA E UMA SO
  --
  -- Este e o teste inteiro. Se algum dia os derivados voltarem a 'pendente',
  -- este numero vira 4 e a contagem volta a mentir — sem erro, sem log, sem
  -- nenhuma tela mudar de cor.
  -- =========================================================================
  select count(*) into v_n from sureya_conferencia_cadastro(f_vazia)
   where situacao = 'pendente' and obrigatorio;
  perform ci41('familia sem jazigo tem UMA pendencia, nao quatro', v_n = 2,
               'devolveu ' || v_n || ' — esperava 2 (o jazigo e o regime)');

  perform ci41('e a pendencia que sobra e o jazigo',
               exists (select 1 from sureya_conferencia_cadastro(f_vazia)
                        where item = 'jazigo cadastrado' and situacao = 'pendente'),
               'a causa de verdade deixou de ser apontada');

  -- OS TRES DERIVADOS. "Nao ter o que olhar" nao e "ter achado um problema" —
  -- e a mesma regra que `ritmo` ja usava para o avulso.
  for v_sit in
    select situacao from sureya_conferencia_cadastro(f_vazia)
     where item in ('jazigo com quadra e identificacao', 'ritmo da limpeza', 'valor combinado')
  loop
    perform ci41('o item que depende do jazigo diz "nao se aplica"',
                 v_sit = 'nao se aplica',
                 'devolveu ' || v_sit || ' — sintoma contado como problema');
  end loop;

  perform ci41('e ele explica que depende do jazigo, em vez de dizer que falta',
               exists (select 1 from sureya_conferencia_cadastro(f_vazia)
                        where item = 'ritmo da limpeza'
                          and detalhe = 'depende do jazigo, que ainda nao existe'),
               'o detalhe nao diz por que nao se aplica');

  -- ---------------------------------------------------------------- a meia
  --
  -- ESTE E O OUTRO LADO: com jazigo, os mesmos itens VOLTAM a ser cobrados.
  -- Um conserto que calasse os tres sempre seria pior que a contagem inflada.
  insert into familias (id, org_id, nome, regime, contratado)
    values (f_meia, v_org, 'Com Jazigo', 'contrato', true) on conflict (id) do nothing;
  insert into clientes (id, org_id, familia_id, nome, telefone)
    values (c_meia, v_org, f_meia, 'Sr. Benedito', '11977776666') on conflict (id) do nothing;
  update familias set responsavel_id = c_meia where id = f_meia;
  -- Jazigo SEM identificacao, SEM ritmo e SEM valor: as tres pendencias de
  -- verdade. (A quadra vai preenchida porque `quadra_id` e NOT NULL — o item
  -- cobra "quadra E identificacao", e a identificacao vazia ja o derruba.)
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao)
    values (t_meia, v_org, v_qua, f_meia, '') on conflict (id) do nothing;

  select count(*) into v_n from sureya_conferencia_cadastro(f_meia)
   where situacao = 'pendente' and obrigatorio;
  perform ci41('com jazigo, os tres itens voltam a ser cobrados', v_n = 3,
               'devolveu ' || v_n || ' — esperava 3 (quadra, ritmo e valor)');

  perform ci41('e nenhum deles diz "nao se aplica"',
               not exists (select 1 from sureya_conferencia_cadastro(f_meia)
                            where item in ('jazigo com quadra e identificacao',
                                           'ritmo da limpeza', 'valor combinado')
                              and situacao = 'nao se aplica'),
               'o conserto calou item que tinha o que conferir');

  -- ------------------------------------------------------- a conta da tela
  --
  -- A view e o que a tela le. Se ela discordar da funcao, sao duas contas
  -- sobre o mesmo fato — o defeito que este projeto mais repete.
  select pendencias into v_n from sureya_candidatas_ao_piloto where familia_id = f_vazia;
  perform ci41('a lista conta o mesmo que o checklist', v_n = 2,
               'a view diz ' || v_n || ' e o checklist diz 2');

  perform ci41('e o "o que falta" nao repete o mesmo buraco',
               (select array_length(string_to_array(o_que_falta, '; '), 1)
                  from sureya_candidatas_ao_piloto where familia_id = f_vazia) = 2,
               'o texto do que falta continua listando os derivados');

  raise notice '  ---';
end $$;

do $$
begin
  perform ci41('anon nao le a conferencia de ninguem',
    not has_function_privilege('anon','sureya_conferencia_cadastro(uuid)','execute'),
    'a conferencia devolve nome, telefone e valores de familia');
end $$;

drop function ci41(text, boolean, text);
