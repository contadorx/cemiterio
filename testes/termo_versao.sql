-- ============================================================================
-- O TERMO TEM VERSAO, E QUEM ACEITOU ACEITOU UMA DELAS (0138)
--
-- O QUE SE MEDIU EM PRODUCAO, EM 27/08
--
--   339 contatos · 62 marcados como tendo autorizado o contato · 59 deles
--   vindos de UMA importacao de planilha em 18/07 · e ZERO caracteres em
--   `orgs.aviso_privacidade`. Nunca houve texto.
--
-- O sistema afirmava que 62 pessoas concordaram, e nao havia com o que.
--
-- O QUE PODE DAR ERRADO AQUI NAO APARECE EM TELA NENHUMA. Um consentimento
-- gravado sem versao, ou uma versao publicada que ainda se deixa editar, nao
-- produzem erro, nao entram em log e nao mudam nenhum numero. So aparecem no
-- dia em que alguem perguntar com que direito uma familia foi contatada — e
-- nesse dia nao ha mais o que medir.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci38(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'TERMO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- `current_org_id()` le a sessao: sem ela as funcoes recusam com 'sem_org', que
-- e o comportamento certo mas nao e o que este arquivo esta medindo.
insert into auth.users (id, email)
  values ('38383838-0000-0000-0000-000000000001','termo@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','38383838-0000-0000-0000-000000000001', false);

insert into orgs (id, nome) values ('38383838-3838-3838-3838-383838383838','CI Termo')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('38383838-3838-3838-3838-383838383838','38383838-0000-0000-0000-000000000001','admin', true)
  on conflict do nothing;

do $$
declare
  v_org uuid := '38383838-3838-3838-3838-383838383838';
  v_fam uuid := '38383838-0000-0000-0000-0000000000fa';
  c_antigo uuid := '38383838-0000-0000-0000-0000000000c1';
  c_novo   uuid := '38383838-0000-0000-0000-0000000000c2';
  v_t1 uuid; v_t2 uuid;
  v_n int; v_versao int; v_texto text; v_acao text; v_erro text;
begin
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Teste') on conflict (id) do nothing;

  -- O CONTATO ANTIGO: autorizou em julho, antes de existir qualquer texto.
  insert into clientes (id, org_id, familia_id, nome, telefone, consentimento_em, consentimento_via)
  values (c_antigo, v_org, v_fam, 'Dona Ines', '11900000001',
          now() - interval '40 days', 'importacao') on conflict (id) do nothing;
  insert into clientes (id, org_id, familia_id, nome, telefone)
  values (c_novo, v_org, v_fam, 'Sr. Aparecido', '11900000002') on conflict (id) do nothing;

  -- =========================================================================
  -- SEM TERMO PUBLICADO, NINGUEM AUTORIZA
  --
  -- E a trava que faz a lista de "versao desconhecida" parar de crescer. Sem
  -- ela, marcar a caixinha continua registrando concordancia com um texto que
  -- nao existe — que e exatamente como se chegou as 62.
  -- =========================================================================
  begin
    perform sureya_registrar_consentimento(c_novo, 'cadastro');
    perform ci38('sem termo publicado, registrar RECUSA', false,
                 'gravou um consentimento a um texto que nao existe');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform ci38('sem termo publicado, registrar RECUSA',
                 v_erro = 'sem_termo_publicado', 'recusou por outro motivo: ' || v_erro);
  end;

  perform ci38('e o contato continua SEM autorizacao',
               (select consentimento_em is null from clientes where id = c_novo),
               'a coluna foi carimbada mesmo com a funcao recusando');

  -- RASCUNHO NAO VALE. Uma versao que ainda vai mudar nao pode ser aceita por
  -- ninguem: e o defeito original, agora com numero.
  insert into termos_privacidade (org_id, versao, titulo, texto)
  values (v_org, 1, 'Aviso', 'Rascunho, ainda vai mudar.') returning id into v_t1;

  perform ci38('rascunho nao vira termo vigente',
               (select id from sureya_termo_vigente(v_org)) is null,
               'um texto nao publicado apareceu como valendo');

  begin
    perform sureya_registrar_consentimento(c_novo, 'cadastro');
    perform ci38('e nao da para aceitar um rascunho', false, 'aceitou o rascunho');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform ci38('e nao da para aceitar um rascunho',
                 v_erro = 'sem_termo_publicado', 'recusou por outro motivo: ' || v_erro);
  end;

  -- =========================================================================
  -- PUBLICADA A VERSAO 1
  -- =========================================================================
  update termos_privacidade set publicado_em = now() where id = v_t1;

  perform ci38('publicada, ela passa a valer',
               (select versao from sureya_termo_vigente(v_org)) = 1, 'nao virou vigente');

  perform sureya_registrar_consentimento(c_novo, 'cadastro');

  select versao into v_versao from consentimentos
   where cliente_id = c_novo and acao = 'aceitou' order by em desc limit 1;
  perform ci38('quem aceita agora fica com a versao carimbada', v_versao = 1,
               'versao gravada: ' || coalesce(v_versao::text, 'nula'));

  -- A COLUNA E O EVENTO NAO PODEM DISCORDAR. Sao duas leituras do mesmo fato,
  -- e e assim que dois numeros comecam iguais e terminam brigando (0092, 0105,
  -- 0106, 0115). Aqui a mesma transacao escreve as duas.
  perform ci38('e a coluna antiga foi carimbada na mesma transacao',
               (select consentimento_em is not null from clientes where id = c_novo),
               'o evento existe e a coluna nao — as telas antigas nao veriam');

  -- =========================================================================
  -- PUBLICADA, NAO MUDA MAIS
  --
  -- Sem esta trava "versao" e enfeite: bastaria reescrever a 1 para que todo
  -- mundo passasse a ter aceitado outra coisa, sem nunca a ter visto.
  -- =========================================================================
  begin
    update termos_privacidade set texto = 'Texto trocado por baixo' where id = v_t1;
    perform ci38('versao publicada nao se edita', false,
                 'o texto de uma versao ja aceita foi reescrito');
  exception when others then
    get stacked diagnostics v_erro = message_text;
    perform ci38('versao publicada nao se edita',
                 v_erro = 'termo_publicado_nao_muda', 'barrou por outro motivo: ' || v_erro);
  end;

  select texto into v_texto from termos_privacidade where id = v_t1;
  perform ci38('e o texto continua o que a pessoa leu',
               v_texto = 'Rascunho, ainda vai mudar.', 'texto agora: ' || v_texto);

  -- =========================================================================
  -- A VERSAO 2 NAO REESCREVE A 1
  -- =========================================================================
  insert into termos_privacidade (org_id, versao, titulo, texto, publicado_em)
  values (v_org, 2, 'Aviso', 'Texto novo, de verdade.', now()) returning id into v_t2;

  perform ci38('a 2 passa a valer', (select versao from sureya_termo_vigente(v_org)) = 2,
               'a vigente nao andou');

  select versao into v_versao from consentimentos
   where cliente_id = c_novo and acao = 'aceitou' order by em desc limit 1;
  perform ci38('mas quem aceitou a 1 continua tendo aceitado a 1', v_versao = 1,
               'a aceitacao antiga foi reescrita para ' || v_versao);

  -- =========================================================================
  -- AS ANTIGAS: NAO SE INVENTA O QUE FOI DITO A ELAS
  --
  -- Carimbar as 62 de julho com a versao 1 seria fabricar um fato juridico.
  -- `versao` nula quer dizer o que realmente se sabe: aceitou antes de existir
  -- termo, e nao da para dizer o que. E o "vazio nao e zero" do projeto, agora
  -- sobre uma afirmacao que se faz a respeito de outra pessoa.
  -- =========================================================================
  -- A REGRA E UMA FUNCAO, e por isso da para cobra-la aqui. Enquanto era um
  -- `insert` solto na migration, ela valia para as 62 de producao e para mais
  -- ninguem — nem para este contato, criado depois.
  perform sureya_semear_consentimentos_antigos(v_org);

  perform ci38('a antiga entrou no historico',
               exists (select 1 from consentimentos where cliente_id = c_antigo),
               'quem ja tinha autorizacao ficou fora do historico');

  perform ci38('e ela ficou como versao DESCONHECIDA, nao como versao 1',
               (select versao is null and termo_id is null from consentimentos
                 where cliente_id = c_antigo limit 1),
               'inventaram para ela um texto que ela nunca viu');

  -- Rodar de novo nao pode duplicar: convergente, como todo reparo do projeto.
  perform sureya_semear_consentimentos_antigos(v_org);
  perform ci38('semear de novo nao duplica',
               (select count(*) from consentimentos where cliente_id = c_antigo) = 1,
               'a antiga ganhou uma segunda linha a cada rodada');

  perform ci38('a tela separa as desconhecidas das demais',
               exists (select 1 from sureya_consentimentos_por_versao(v_org)
                        where desconhecida and quantos = 1)
               and exists (select 1 from sureya_consentimentos_por_versao(v_org)
                            where not desconhecida and versao = 1 and quantos = 1),
               'a conta por versao nao separa o que se sabe do que nao se sabe');

  -- =========================================================================
  -- RETIRAR DEIXA RASTRO
  --
  -- Antes, desmarcar apagava `consentimento_em` — e com ele o fato de que houve
  -- autorizacao um dia. Sob a LGPD o que se precisa poder mostrar e o contrario:
  -- que foi dada, e que foi atendida quando pediram para tirar.
  -- =========================================================================
  perform sureya_retirar_consentimento(c_novo, 'pediu por telefone');

  perform ci38('retirar apaga o estado atual',
               (select consentimento_em is null from clientes where id = c_novo),
               'continua marcada como autorizada');

  select acao into v_acao from consentimentos
   where cliente_id = c_novo order by em desc limit 1;
  perform ci38('mas o historico guarda que foi retirada', v_acao = 'retirou',
               'ultimo evento: ' || coalesce(v_acao, 'nenhum'));

  perform ci38('e o aceite anterior nao sumiu',
               (select count(*) from consentimentos
                 where cliente_id = c_novo and acao = 'aceitou') = 1,
               'apagou a prova de que houve autorizacao');

  select count(*) into v_n from sureya_consentimentos_por_versao(v_org);
  perform ci38('quem retirou sai da conta de quem autorizou',
               not exists (select 1 from sureya_consentimentos_por_versao(v_org)
                            where versao = 1),
               'continua contando alguem que pediu para sair');

  raise notice '  ---';
end $$;

-- =========================================================================
-- QUEM PODE CHAMAR — licao da 0129.
--
-- SECURITY DEFINER ignora RLS: so o GRANT protege, e o Supabase concede
-- EXECUTE a `anon` POR PADRAO em `public`. Estas escrevem e leem consentimento
-- de pessoa fisica, o dado mais sensivel do sistema.
-- =========================================================================
do $$
begin
  perform ci38('anon nao registra consentimento',
    not has_function_privilege('anon','sureya_registrar_consentimento(uuid,text)','execute'),
    'qualquer visitante do site poderia carimbar autorizacoes');
  perform ci38('anon nao retira consentimento',
    not has_function_privilege('anon','sureya_retirar_consentimento(uuid,text)','execute'),
    'qualquer visitante poderia apagar autorizacoes');
  perform ci38('anon nao le o termo vigente',
    not has_function_privilege('anon','sureya_termo_vigente(uuid)','execute'),
    'aberto para quem nao entrou');
  perform ci38('anon nao conta quem autorizou',
    not has_function_privilege('anon','sureya_consentimentos_por_versao(uuid)','execute'),
    'aberto para quem nao entrou');
  perform ci38('anon nao semeia consentimento antigo',
    not has_function_privilege('anon','sureya_semear_consentimentos_antigos(uuid)','execute'),
    'aberto para quem nao entrou');
end $$;

drop function ci38(text, boolean, text);
