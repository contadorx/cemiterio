-- ============================================================================
-- OS BALDES QUE NAO ABREM SOZINHOS (0139)
--
-- Medido em 27/08: os tres baldes estavam `public = true`. Balde publico no
-- Supabase abre para QUALQUER UM que tenha o endereco, sem senha, para sempre.
-- Os caminhos levam identificadores aleatorios — ninguem acha por tentativa —,
-- mas link que vaza continua valendo.
--
-- O QUE PODE DAR ERRADO AQUI E COMPLETAMENTE MUDO. Um balde que volta a ser
-- publico nao muda nenhuma tela, nao aparece em log e nao quebra nada: as
-- imagens continuam abrindo, so que para mais gente. So se descobre quando ja
-- e tarde — e por isso a trava tem de estar num teste, e nao numa lembranca.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci39(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'BALDES FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare v_pub boolean;
begin
  -- O ensaio comeca com os tres ABERTOS (ver o preambulo do migrar-limpo.sh).
  -- Se esta linha falhar, o teste abaixo estaria passando por vacuidade.
  perform ci39('o ensaio parte dos tres baldes abertos, como a producao estava',
               (select count(*) from storage.buckets where id in ('servicos','comprovantes','conversas')) = 3,
               'os baldes nao existem no banco de ensaio — o teste passaria sem testar nada');

  select public into v_pub from storage.buckets where id = 'comprovantes';
  perform ci39('comprovantes fechou', v_pub is false,
               'extrato de banco com nome, valor e numero de conta abrindo para quem tiver o link');

  select public into v_pub from storage.buckets where id = 'conversas';
  perform ci39('conversas fechou', v_pub is false,
               'o que a familia mandou no privado abrindo para quem tiver o link');

  -- SERVICOS CONTINUA ABERTO DE PROPOSITO, e o teste diz isso em voz alta.
  --
  -- Sao 817 arquivos lidos por URL direta em quatro lugares — a pagina da
  -- familia por token, o site, o painel e o proprio envio (o Evolution BAIXA a
  -- URL para entregar a imagem no WhatsApp). Fecha-lo e um build proprio.
  -- Este assert existe para o dia em que alguem fizer esse build: ele vai
  -- FALHAR, e a falha e o lembrete de vir aqui apagar esta linha em vez de
  -- fechar o balde e descobrir depois que as fotos pararam de chegar.
  select public into v_pub from storage.buckets where id = 'servicos';
  perform ci39('servicos continua aberto — e isso ainda e uma decisao, nao um esquecimento',
               v_pub is true,
               'servicos foi fechado: confira a pagina da familia, o site e o envio pelo WhatsApp antes de apagar este teste');

  -- A PORTA DOS FUNDOS. Uma policy de leitura para `anon` em storage.objects
  -- devolveria por baixo exatamente o que o `public = false` acabou de trancar.
  perform ci39('nenhuma policy devolve os baldes fechados para anon',
               not exists (
                 select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and 'anon' = any(roles)
                    and (qual ilike '%comprovantes%' or qual ilike '%conversas%')
               ),
               'ha policy em storage.objects abrindo para anon o que o balde fechou');

  raise notice '  ---';
end $$;

drop function ci39(text, boolean, text);
