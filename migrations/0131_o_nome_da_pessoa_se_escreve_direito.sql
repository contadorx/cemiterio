-- ============================================================================
-- 0131 — O NOME DA PESSOA SE ESCREVE DIREITO
-- ============================================================================
--
-- MEDIDO EM 24/08: 110 dos 339 contatos estao em CAIXA ALTA — um terco. E 66
-- das 363 familias. Como o nome entra nas mensagens, um terco das familias
-- recebia "Ola, JOSEANE". Isso nao e um detalhe de tela: e a casa gritando com
-- quem esta de luto.
--
-- O QUE ESTES NOMES SAO, DE VERDADE
--
-- Antes de mexer, li o que esta la:
--
--   "JOSE ANTONIO (DONA DOMINGAS)"     "Paulo Primo Da Maria Japonesa"
--   "CLAUDIA FILHA GISELDA"            "Jose Do Lado Do Delabeta"
--   "CELIA FRENTE ABIGAIL"             "Idalina Na Frente Do Bozato"
--
-- O campo NAO guarda so um nome: guarda A REFERENCIA QUE ACHA A PESSOA no
-- cemiterio. "Celia, a da frente da Abigail." Isso e conhecimento de campo, e
-- apagar seria destruir o unico jeito de saber de quem se trata.
--
-- Por isso a normalizacao SO MEXE EM MAIUSCULA E ESPACO. Nenhuma palavra sai,
-- nenhuma entra, a ordem nao muda.
--
-- E por isso tambem a segunda metade do pedido esta certa: na mensagem vai
-- SO O PRIMEIRO NOME. "Ola, Paulo" — nunca "Ola, Paulo Primo Da Maria
-- Japonesa", que seria constrangedor.
--
-- POR QUE GATILHO, E NAO CONSERTO NA ROTA
--
-- Ha pelo menos cinco portas que escrevem nome: a ficha da familia, o contato
-- do site virando familia (de hoje), a importacao de planilha, o espelho do
-- WhatsApp e o cadastro pelo campo. Consertar numa e deixar quatro escrevendo
-- torto e o defeito de forma de sempre. O gatilho pega todas, inclusive as que
-- ainda nao existem.
-- ============================================================================

-- ============================================================================
-- 1. A REGRA
-- ============================================================================
create or replace function sureya_nome_proprio(p_nome text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p_nome, '')) = '' then p_nome
    else
      -- 3. a primeira letra do nome nunca fica minuscula, nem sendo particula:
      --    "DA SILVA JUNIOR" e sobrenome no comeco, nao preposicao solta
      overlay(p placing upper(substr(p, 1, 1)) from 1 for 1)
  end
  from (
    select
      -- 2. a letra depois do apostrofo volta a subir: D'Avila, nao D'avila
      regexp_replace(
        -- 1. particula em minuscula, com fronteira de palavra (\m..\M) para
        --    nao consumir o espaco e deixar passar "do Lado do Delabeta"
        regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        regexp_replace(regexp_replace(regexp_replace(
          -- 0. `initcap` ja resolve acento, hifen e parentese:
          --    "JOSE ANTONIO (DONA DOMINGAS)" -> "Jose Antonio (Dona Domingas)"
          initcap(lower(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')))),
        '\mDe\M', 'de', 'g'), '\mDa\M', 'da', 'g'), '\mDo\M', 'do', 'g'),
        '\mDas\M', 'das', 'g'), '\mDos\M', 'dos', 'g'), '\mE\M', 'e', 'g'),
        '\mDi\M', 'di', 'g'),
      '(\m[A-Za-zÀ-ú])''([a-zà-ú])', '\1''\2', 'g') as p
  ) q;
$$;

comment on function sureya_nome_proprio(text) is
  'Arruma MAIUSCULA e ESPACO de um nome, sem tirar nem trocar palavra: o campo '
  'guarda a referencia que acha a pessoa no cemiterio ("Celia Frente Abigail") '
  'e isso e conhecimento de campo, nao ruido.';

-- ============================================================================
-- 2. O GATILHO — em toda porta, inclusive nas que ainda nao existem
-- ============================================================================
create or replace function sureya_arruma_nome()
returns trigger
language plpgsql
as $$
begin
  new.nome := sureya_nome_proprio(new.nome);
  return new;
end;
$$;

drop trigger if exists tg_nome_proprio_cliente on clientes;
create trigger tg_nome_proprio_cliente
  before insert or update of nome on clientes
  for each row execute function sureya_arruma_nome();

drop trigger if exists tg_nome_proprio_familia on familias;
create trigger tg_nome_proprio_familia
  before insert or update of nome on familias
  for each row execute function sureya_arruma_nome();

-- ============================================================================
-- 3. O QUE JA ESTAVA GRAVADO
-- ============================================================================
-- CONVERGENTE: `where nome is distinct from sureya_nome_proprio(nome)` so toca
-- quem esta diferente. Rodar de novo nao escreve linha nenhuma — e nao levanta
-- o `updated_at` de 339 contatos de graca.
update clientes set nome = sureya_nome_proprio(nome)
 where nome is distinct from sureya_nome_proprio(nome);

update familias set nome = sureya_nome_proprio(nome)
 where nome is distinct from sureya_nome_proprio(nome);

-- ============================================================================
-- 4. O TRATAMENTO SEM PONTO TAMBEM E TRATAMENTO
-- ============================================================================
--
-- `sureya_primeiro_nome` conhecia 'sr.', 'sra.', 'dona', 'dr.', 'dra.', 'seu'
-- — com ponto. Em producao ha quatro contatos comecando por tratamento, e as
-- formas escritas sao "Dona", "Dra", "Sr", "Sr." — duas delas SEM ponto.
--
-- Ou seja: "Sr Joao" virava "Ola, Sr" e "Dra Marta" virava "Ola, Dra". A regra
-- existia para evitar exatamente isso e nao pegava metade dos casos.
create or replace function sureya_primeiro_nome(p_completo text)
returns text
language sql
immutable
as $$
  select case
           when array_length(v.partes, 1) >= 2
                and rtrim(lower(v.partes[1]), '.') in
                    ('sr','sra','dona','dr','dra','seu','pe','padre','irma','irmao')
             then v.partes[1] || ' ' || v.partes[2]
           else coalesce(nullif(v.partes[1], ''), btrim(coalesce(p_completo,'')))
         end
    from (select regexp_split_to_array(btrim(coalesce(p_completo,'')), '\s+') as partes) v;
$$;

comment on function sureya_primeiro_nome(text) is
  'O nome que vai na mensagem: SO O PRIMEIRO. Excecao unica, o tratamento — '
  '"Sr. Joao" inteiro, porque "Ola, Sr." nao e saudacao. Com ou sem ponto.';

-- ============================================================================
-- 5. A REGUA PASSA A USAR A MESMA REGRA
-- ============================================================================
--
-- Ela montava a saudacao com `split_part(..., ' ', 1)` — uma SEGUNDA regra de
-- primeiro nome, que nao conhecia tratamento nenhum. Duas regras para a mesma
-- coisa comecam iguais e terminam discordando: aqui ja discordavam, e quem
-- pagava era o "Sr Joao" recebendo "Ola, Sr".
--
-- Emenda por substituicao de texto sobre a definicao viva, com o alvo
-- verificado — a funcao carrega oito guardas ganhas uma a uma (0111, 0116,
-- 0124, 0130) e redigitar seria a forma mais provavel de perder uma.
do $$
declare
  v_def text;
  alvo  text := '    v_nome := split_part(btrim(coalesce(r.quem, r.familia_nome, '''')), '' '', 1);';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'sureya_regua_do_dia'
     and pg_get_function_identity_arguments(p.oid) = 'p_dia date, p_org uuid';

  if v_def is null then
    raise exception '0131: sureya_regua_do_dia(date, uuid) nao existe';
  end if;
  if position(alvo in v_def) = 0 then
    raise exception '0131: nao achei a montagem do primeiro nome na regua';
  end if;

  execute replace(v_def, alvo,
    '    v_nome := sureya_primeiro_nome(coalesce(r.quem, r.familia_nome, ''''));');
end $$;

revoke all on function sureya_regua_do_dia(date, uuid) from public, anon;
grant execute on function sureya_regua_do_dia(date, uuid) to authenticated, service_role;

-- A licao da 0129: o Supabase concede EXECUTE a `anon` por padrao em `public`,
-- e migration que nao revoga, publica. Estas duas sao contas puras sobre um
-- texto que veio de quem chamou — nao tocam em dado de ninguem —, entao
-- ficam abertas de proposito, declaradas em `testes/porta_do_anonimo.sql`.
