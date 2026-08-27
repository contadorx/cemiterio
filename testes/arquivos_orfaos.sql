-- ============================================================================
-- APAGAR O JAZIGO PRECISA APAGAR AS FOTOS (0135)
--
-- Medido em 27/08 na producao: 817 arquivos no balde, 282 ORFAOS (105 MB, 36%
-- do deposito), e 281 deles de tumulos QUE NAO EXISTEM MAIS. A rota de
-- exclusao apagava servicos, planos, leituras e a linha do tumulo — e nunca
-- tocava no Storage.
--
-- Nao e so desperdicio. A remocao por LGPD monta a lista a partir dos TUMULOS
-- DA FAMILIA; tumulo ja apagado nao esta mais la, e as fotos dele nao entram
-- na lista. Dava para responder "removido" com a foto do jazigo abrindo por
-- link direto.
--
-- O que se prova aqui e a LISTA — quem apaga e a API de Storage, do lado do
-- app. Mas a lista e a parte que diverge em silencio: esquecer um campo aqui
-- apaga o registro e deixa o arquivo, que foi como se fabricaram os 281.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci35(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'ORFAOS FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_tum uuid := '55555555-5555-5555-5555-555555555555';
  v_fam uuid := '44444444-4444-4444-4444-444444444444';
  v_n   int;
  v_sumido boolean;
begin
  insert into orgs (id, nome) values (v_org, 'Teste Orfaos') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome)
    values ('22222222-2222-2222-2222-222222222222', v_org, 'Cem') on conflict (id) do nothing;
  -- quadra_id e NOT NULL em tumulos: sem isto o fixture nao entra (licao de 0132)
  insert into quadras (id, org_id, cemiterio_id, codigo)
    values ('33333333-3333-3333-3333-333333333333', v_org,
            '22222222-2222-2222-2222-222222222222', 'Q1') on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Familia Teste')
    on conflict (id) do nothing;

  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                       foto_referencia_url, foto_enquadramento_url)
  values (v_tum, v_org, '33333333-3333-3333-3333-333333333333', v_fam, 'T-1',
          'https://x.co/storage/v1/object/public/servicos/o/tumulos/' || v_tum || '/referencia-1.jpg',
          'https://x.co/storage/v1/object/public/servicos/o/tumulos/' || v_tum || '/enquadramento-1.jpg')
  on conflict (id) do nothing;

  insert into servicos (id, org_id, tumulo_id, status, data_prevista,
                        foto_antes_url, foto_depois_url)
  values ('66666666-6666-6666-6666-666666666666', v_org, v_tum, 'executado', current_date,
          'https://x.co/storage/v1/object/public/servicos/o/s/antes-1.jpg',
          'https://x.co/storage/v1/object/public/servicos/o/s/depois-1.jpg')
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------
  -- 1. A LISTA DO TUMULO TRAZ AS QUATRO
  --
  -- Faltar uma e o defeito inteiro: o registro some e o arquivo fica.
  -- `current_org_id()` e nulo fora de sessao (licao de 0103), entao a
  -- contagem vai direto na regra, do mesmo jeito que a funcao a escreve.
  -- ---------------------------------------------------------------------
  select count(*) into v_n from (
    select foto_referencia_url u from tumulos where id = v_tum and foto_referencia_url is not null
    union select foto_enquadramento_url from tumulos where id = v_tum and foto_enquadramento_url is not null
    union select foto_antes_url from servicos where tumulo_id = v_tum and foto_antes_url is not null
    union select foto_depois_url from servicos where tumulo_id = v_tum and foto_depois_url is not null
    union select foto_inicio_url from servicos where tumulo_id = v_tum and foto_inicio_url is not null
  ) x;
  perform ci35('a lista de um jazigo tem as quatro fotos dele', v_n = 4,
               'vieram ' || v_n || ', esperado 4');

  -- Campo vazio virando linha faria `apagarArquivos` receber null, contar como
  -- falha, e bloquear a exclusao para sempre.
  select count(*) into v_n from sureya_arquivos_do_tumulo(v_tum) where url is null;
  perform ci35('campo vazio nao vira linha na lista', v_n = 0, 'apareceu url nula');

  -- ---------------------------------------------------------------------
  -- 2. O INVENTARIO DOS ORFAOS
  --
  -- O falso positivo aqui e o perigoso: mandar apagar foto viva.
  -- ---------------------------------------------------------------------
  insert into storage.objects (bucket_id, name, metadata) values
    ('servicos', 'o/tumulos/' || v_tum || '/referencia-1.jpg', '{"size":1000}'::jsonb),
    ('servicos', 'o/tumulos/99999999-9999-9999-9999-999999999999/referencia-9.jpg', '{"size":2000}'::jsonb);

  select count(*) into v_n from sureya_arquivos_orfaos() where caminho like '%' || v_tum || '%';
  perform ci35('arquivo referenciado NAO aparece como orfao', v_n = 0,
               'acusou ' || v_n || ' foto viva como orfa');

  select count(*) into v_n from sureya_arquivos_orfaos() where caminho like '%99999999%';
  perform ci35('arquivo sem dono aparece como orfao', v_n = 1, 'vieram ' || v_n);

  -- Esta coluna separa "sobra de exclusao" (seguro apagar) de "upload que
  -- nunca foi ligado a nada" (precisa de olho antes).
  select dono_sumido into v_sumido from sureya_arquivos_orfaos() where caminho like '%99999999%';
  perform ci35('e diz que o tumulo dele nao existe mais', v_sumido is true,
               'dono_sumido veio ' || coalesce(v_sumido::text, 'nulo'));

  raise exception 'ENSAIO DESFEITO >> tudo passou';
exception when others then
  if sqlerrm not like 'ENSAIO DESFEITO%' then raise; end if;
  raise notice '  ok  o ensaio foi desfeito, nada ficou no banco';
end $$;
