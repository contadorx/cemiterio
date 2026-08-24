-- 0118 — O PORTAL DA FAMÍLIA NUNCA ABRIU
--
-- O RELATO
--   "Eu fui em uma família criar o link da família e ele não funcionou no
--    navegador e não aparece também."
--
-- O QUE ACONTECIA
--   O link é gerado, é válido, aponta para uma página que existe — e a página
--   devolve "não encontrado" para todo mundo, desde sempre.
--
--   A rota `/api/portal` é pública e diz, no próprio comentário, o desenho:
--
--     "Endpoint público (sem login). Usa a chave anon + RPCs SECURITY
--      DEFINER, que só expõem dados não-sensíveis do túmulo pelo token."
--
--   O desenho está certo. Só faltava a metade que o faz funcionar: `anon`
--   nunca teve permissão de executar essas funções. Medido em produção:
--
--     select has_function_privilege('anon', 'sureya_portal_cabecalho(text)', 'EXECUTE')
--     → false
--
--     set role anon; select * from sureya_portal_cabecalho('...');
--     → ERROR: permission denied for function sureya_portal_cabecalho
--
--   E o erro não aparecia em lugar nenhum: a rota junta os três `error` num
--   `if` só e devolve **404 "nao_encontrado"**. Permissão negada e token
--   inexistente saíam pela mesma porta, com a mesma frase. Quem clicasse leria
--   "este link não existe" sobre um link que existe.
--
--   É a lição da 0067/0079 pelo avesso. Lá o problema foi permissão de MAIS
--   em DELETE; aqui foi de MENOS numa função pública. SECURITY DEFINER ignora
--   RLS, então o GRANT é a única guarda que sobra — e ele foi tratado como
--   detalhe nas duas vezes.
--
-- POR QUE É SEGURO DEVOLVER A PERMISSÃO
--   As três funções de leitura filtram por `qr_token` e exigem 16 caracteres
--   ou mais. O token é `gen_random_bytes(16)` em hexa — 32 caracteres. Elas
--   devolvem identificação, nome do falecido, quadra, cemitério e as fotos do
--   serviço. Nenhum valor, nenhum telefone, nenhum saldo, nenhum contato.
--
--   `sureya_emitir_token_portal` e `sureya_revogar_token_portal` NÃO entram:
--   as duas leem `current_org_id()` e são do painel. Emitir token pela porta
--   pública seria dar a chave a quem bateu.

begin;

grant execute on function public.sureya_portal_cabecalho(text) to anon;
grant execute on function public.sureya_portal_historico(text) to anon;
grant execute on function public.sureya_portal_irmaos(text)    to anon;

-- E as de emitir/revogar ficam onde estavam, explicitamente.
revoke all on function public.sureya_emitir_token_portal(uuid)  from anon;
revoke all on function public.sureya_revogar_token_portal(uuid) from anon;

-- ---------------------------------------------------------------------------
-- OS OUTROS JAZIGOS DA FAMÍLIA — pela FAMÍLIA, e não pelo cliente
-- ---------------------------------------------------------------------------
-- `sureya_portal_irmaos` casava `t2.cliente_id = t1.cliente_id`. Isso é
-- anterior à decisão de 22/08 (D-01), quando o jazigo passou a pertencer à
-- FAMÍLIA e `cliente_id` virou resquício.
--
-- Medido: dos 266 jazigos, 266 têm família e 239 têm `cliente_id` — 27 ficam
-- de fora. E mesmo entre os 239, dois jazigos da mesma família cadastrados por
-- pessoas diferentes não se enxergariam.
--
-- É o mesmo defeito que a 0106 corrigiu na lista de famílias: perguntar ao
-- cliente o que a família responde.
create or replace function public.sureya_portal_irmaos(p_token text)
returns table(token text, identificacao text, falecido_nome text, quadra text, rua text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t2.qr_token, t2.identificacao, t2.falecido_nome, q.codigo, t2.rua
  from tumulos t1
  join tumulos t2
    on t2.familia_id = t1.familia_id
   and t2.org_id = t1.org_id
   and t2.id <> t1.id
   and t2.qr_token is not null
  join quadras q on q.id = t2.quadra_id
  where t1.qr_token = p_token
    and p_token is not null
    and length(p_token) >= 16
    and t1.familia_id is not null
  order by t2.identificacao
  limit 10;
$$;

revoke all on function public.sureya_portal_irmaos(text) from public;
grant execute on function public.sureya_portal_irmaos(text) to anon, authenticated, service_role;

commit;
