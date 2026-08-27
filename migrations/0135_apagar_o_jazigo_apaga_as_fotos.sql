-- 0135 — APAGAR O JAZIGO PRECISA APAGAR AS FOTOS DELE.
--
-- O QUE EU MEDI EM 27/08, NA PRODUÇÃO
--
--   817 arquivos no balde `servicos`, 292 MB
--   281 deles ÓRFÃOS, 105 MB — 36% do depósito
--   e os 281 pertencem, sem exceção, a túmulos QUE NÃO EXISTEM MAIS
--
-- `DELETE /api/tumulos/[id]` apaga serviços, planos, leituras de GPS e a linha
-- do túmulo. Nunca tocou no Storage. A foto fica lá, aberta pela URL pública,
-- para sempre.
--
-- POR QUE ISSO É MAIS QUE DESPERDÍCIO
--
-- A rota de LGPD (`/api/clientes/[id]/lgpd`) faz a coisa certa: pega a lista
-- pela função `sureya_arquivos_do_cliente`, apaga os ARQUIVOS primeiro e só
-- então marca a pessoa como removida — se o Storage falhar, a remoção não é
-- registrada, porque comprovante de remoção sobre arquivo que ficou é pior que
-- não ter removido.
--
-- Só que essa lista sai dos TÚMULOS DA FAMÍLIA. Um túmulo já apagado não está
-- mais lá — e as fotos dele, que continuam no balde, não entram na lista. Ou
-- seja: hoje dá para a família pedir remoção, o sistema responder "removido", e
-- as fotos do jazigo dela seguirem abrindo por link direto.
--
-- Não é hipótese: são 281 arquivos exatamente nessa situação agora.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
--   1. `sureya_arquivos_do_tumulo` — a mesma lista, um nível abaixo, para a
--      exclusão do túmulo poder apagar antes de apagar.
--   2. `sureya_arquivos_orfaos` — o inventário do que já ficou para trás, para
--      dar para VER antes de apagar. Ela não apaga nada.
--
-- Nenhuma das duas apaga arquivo: quem apaga é a API de Storage, do lado do
-- app (DECISOES.md D-03 — apagar a linha de `storage.objects` remove o
-- registro e deixa o arquivo servindo).

begin;

-- ---------------------------------------------------------------- 1
-- A LISTA DE UM TÚMULO, no mesmo formato de `sureya_arquivos_do_cliente`.
-- Uma lista só: se a exclusão e a exportação divergirem, volta a existir
-- arquivo que se exporta e não se apaga.
create or replace function sureya_arquivos_do_tumulo(p_tumulo uuid)
returns table(url text, origem text)
language sql
security definer
set search_path to 'public'
as $$
  with meu as (
    select t.id from tumulos t
     where t.id = p_tumulo and t.org_id = current_org_id()
  )
  select t.foto_referencia_url, 'referencia do jazigo' from tumulos t, meu
   where t.id = meu.id and t.foto_referencia_url is not null
  union
  select t.foto_enquadramento_url, 'enquadramento do jazigo' from tumulos t, meu
   where t.id = meu.id and t.foto_enquadramento_url is not null
  union
  select s.foto_antes_url, 'antes da limpeza' from servicos s, meu
   where s.tumulo_id = meu.id and s.foto_antes_url is not null
  union
  select s.foto_depois_url, 'depois da limpeza' from servicos s, meu
   where s.tumulo_id = meu.id and s.foto_depois_url is not null
  union
  select s.foto_inicio_url, 'inicio da limpeza' from servicos s, meu
   where s.tumulo_id = meu.id and s.foto_inicio_url is not null;
$$;

-- ---------------------------------------------------------------- 2
-- O INVENTÁRIO DO QUE FICOU PARA TRÁS.
--
-- Varre `storage.objects` e devolve o que nenhum registro do banco aponta.
-- É leitura pura, de propósito: apagar 105 MB de foto é irreversível e é
-- decisão de gente, não de migração.
create or replace function sureya_arquivos_orfaos()
returns table(balde text, caminho text, bytes bigint, criado_em timestamptz, dono_sumido boolean)
language sql
security definer
set search_path to 'public', 'storage'
as $$
  with referidos as (
    select regexp_replace(foto_referencia_url,    '^.*/object/(public|sign)/[^/]+/', '') c from tumulos where foto_referencia_url is not null
    union select regexp_replace(foto_enquadramento_url, '^.*/object/(public|sign)/[^/]+/', '') from tumulos where foto_enquadramento_url is not null
    union select regexp_replace(foto_antes_url,   '^.*/object/(public|sign)/[^/]+/', '') from servicos where foto_antes_url is not null
    union select regexp_replace(foto_depois_url,  '^.*/object/(public|sign)/[^/]+/', '') from servicos where foto_depois_url is not null
    union select regexp_replace(foto_inicio_url,  '^.*/object/(public|sign)/[^/]+/', '') from servicos where foto_inicio_url is not null
    union select regexp_replace(imagem_url,       '^.*/object/(public|sign)/[^/]+/', '') from comprovantes where imagem_url is not null
    union select regexp_replace(foto_url,         '^.*/object/(public|sign)/[^/]+/', '') from clientes where foto_url is not null
    union select regexp_replace(midia_url,        '^.*/object/(public|sign)/[^/]+/', '') from mensagens where midia_url is not null
  )
  select o.bucket_id::text,
         o.name::text,
         (o.metadata->>'size')::bigint,
         o.created_at,
         -- `true` quando o caminho traz um id de túmulo que não existe mais:
         -- é o caso dos 281 de hoje, e o que separa "sobra de exclusão" de
         -- "upload que nunca foi ligado a nada".
         case
           when o.name ~ '/tumulos/[0-9a-f-]{36}/'
           then not exists (
             select 1 from tumulos t
              where t.id = (regexp_match(o.name, '/tumulos/([0-9a-f-]{36})/'))[1]::uuid
           )
           else false
         end
    from storage.objects o
   where not exists (select 1 from referidos r where r.c = o.name)
   order by o.created_at;
$$;

-- ---------------------------------------------------------------- 3
-- A PORTA DO ANÔNIMO FICA FECHADA (lição da 0129).
--
-- Supabase concede EXECUTE a `anon` por padrão no schema `public`. Estas duas
-- leem arquivo de todo mundo e são SECURITY DEFINER — sem revogar, qualquer um
-- com a chave pública lista o depósito inteiro.
revoke execute on function sureya_arquivos_do_tumulo(uuid) from anon, public;
revoke execute on function sureya_arquivos_orfaos() from anon, public;
grant  execute on function sureya_arquivos_do_tumulo(uuid) to authenticated, service_role;
grant  execute on function sureya_arquivos_orfaos() to service_role;

commit;
