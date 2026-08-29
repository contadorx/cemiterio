-- ============================================================================
-- O TELEFONE NAO CRIA GENTE NOVA (0145)
--
-- Medido em 29/08: 46 clientes cadastrados SEM o 55, e o WhatsApp sempre manda
-- COM. Nenhum deles era reconhecido: virava lead, e depois alguem cadastrava a
-- pessoa outra vez. Onze pares de duplicados nasceram assim.
--
-- O QUE PODE DAR ERRADO AQUI E GRAVE NOS DOIS SENTIDOS:
--
--   casar de menos  a familia escreve e vira desconhecida (o estado de hoje)
--   casar DEMAIS    duas pessoas diferentes viram uma. Num sistema em que o
--                   telefone diz QUEM PAGA, isso junta dois razoes — e o erro
--                   so aparece quando alguem for cobrado pelo que ja pagou.
--
-- E a fusao tem um terceiro: doze das vinte e nove referencias a `clientes`
-- sao ON DELETE CASCADE. Apagar a copia sem mover primeiro nao limpa
-- duplicata: APAGA O HISTORICO DA FAMILIA.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci45(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'TELEFONE/FUSAO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '45454545-4545-4545-4545-454545454545';
  v_cem uuid := '45454545-0000-0000-0000-0000000000ce';
  v_qua uuid := '45454545-0000-0000-0000-0000000000dd';
  f_boa uuid := '45454545-0000-0000-0000-0000000000f1';  -- Tonellotti (com jazigo)
  f_vaz uuid := '45454545-0000-0000-0000-0000000000f2';  -- "Familia Katia" (vazia)
  c_boa uuid := '45454545-0000-0000-0000-0000000000c1';  -- Katia sem o 55
  c_cop uuid := '45454545-0000-0000-0000-0000000000c2';  -- Katia com o 55
  v_tum uuid := '45454545-0000-0000-0000-0000000000a1';
  v_cnv uuid := '45454545-0000-0000-0000-0000000000cc';
  v_cmp uuid := '45454545-0000-0000-0000-0000000000b1';
  v_erro text; v_id uuid; v_n int;
begin
  -- =========================================================================
  -- A REGRA DO NUMERO
  -- =========================================================================
  perform ci45('sem o 55, ganha o 55',
               sureya_telefone_normalizado('11988758966') = '5511988758966',
               'o cadastro sem DDI continua invisivel para o WhatsApp');
  perform ci45('com o 55, fica como esta',
               sureya_telefone_normalizado('5511988758966') = '5511988758966', '');
  perform ci45('simbolo e espaco nao contam',
               sureya_telefone_normalizado('(11) 98875-8966') = '5511988758966',
               'o numero digitado com parenteses virou outra pessoa');
  perform ci45('fixo de oito digitos tambem ganha o DDI',
               sureya_telefone_normalizado('1132345678') = '551132345678', '');

  -- O NONO DIGITO NAO SE INVENTA. A operadora sabe se e a mesma linha; o banco
  -- nao. Adivinhar aqui juntaria duas familias em silencio — e o erro so
  -- apareceria quando alguem fosse cobrado pelo que ja pagou.
  perform ci45('o nono digito NAO e inventado',
               sureya_telefone_normalizado('551188758966')
               <> sureya_telefone_normalizado('5511988758966'),
               'o banco esta adivinhando o nono digito e pode juntar duas pessoas');

  -- Forma desconhecida nao vira numero plausivel: fica visivelmente torta.
  perform ci45('lixo nao vira telefone',
               sureya_telefone_normalizado('12') = '12'
               and sureya_telefone_normalizado('') = '',
               'inventou um numero em cima de cadastro quebrado');
  perform ci45('nulo nao explode',
               sureya_telefone_normalizado(null) = '', '');

  -- =========================================================================
  -- O CASO DA KATIA, montado igual ao de producao.
  -- =========================================================================
  insert into orgs (id, nome) values (v_org, 'Teste 0145') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (f_boa, v_org, 'Tonellotti') on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (f_vaz, v_org, 'Familia Katia') on conflict (id) do nothing;

  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (c_boa, v_org, 'Katia', '11988758966', f_boa) on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (c_cop, v_org, 'Kátia', '5511988758966', f_vaz) on conflict (id) do nothing;

  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values (v_tum, v_org, v_qua, f_boa, 'Mendes', 'Q3-R10-001') on conflict (id) do nothing;

  -- A copia carrega o que a familia mandou: conversa e comprovante.
  insert into conversas (id, org_id, cliente_id) values (v_cnv, v_org, c_cop)
    on conflict (id) do nothing;
  insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida, status)
    values (v_cmp, v_org, c_cop, 40.00, current_date, 'a_conferir') on conflict (id) do nothing;
  perform sureya_lancar(
    p_cliente := c_cop, p_tipo := 'credito', p_valor := 40.00, p_origem := 'pagamento',
    p_descricao := 'Comprovante', p_status := 'a_conferir', p_comprovante := v_cmp,
    p_org := v_org);

  -- =========================================================================
  -- ACHAR A PESSOA — os dois jeitos de escrever o mesmo numero.
  -- =========================================================================
  perform ci45('o numero com 55 acha alguem',
               sureya_achar_cliente('5511988758966', v_org) is not null,
               'o telefone do WhatsApp nao acha ninguem');
  perform ci45('e o numero sem 55 acha o MESMO alguem',
               sureya_achar_cliente('11988758966', v_org)
               = sureya_achar_cliente('5511988758966', v_org),
               'os dois jeitos de escrever ainda sao duas pessoas');
  perform ci45('numero de outra pessoa nao acha ninguem',
               sureya_achar_cliente('5511911111111', v_org) is null,
               'esta casando numero que nao e de ninguem — junta familias erradas');

  -- =========================================================================
  -- A LISTA DE DUPLICADOS diz o que cada lado carrega.
  -- =========================================================================
  perform ci45('o par aparece na lista de duplicados',
               (select count(*) from sureya_clientes_duplicados(v_org)) = 2,
               'a tela de fusao nao teria o que mostrar');
  perform ci45('e ela diz quantos jazigos cada lado tem',
               (select jazigos from sureya_clientes_duplicados(v_org) where cliente_id = c_boa) = 1
               and (select jazigos from sureya_clientes_duplicados(v_org) where cliente_id = c_cop) = 0,
               'sem isso nao da para saber qual dos dois e o cadastro de verdade');
  perform ci45('e o que a copia carrega',
               (select comprovantes from sureya_clientes_duplicados(v_org) where cliente_id = c_cop) = 1,
               'a copia parece descartavel e tem dinheiro presa nela');

  -- =========================================================================
  -- APAGAR A FAMILIA COM GENTE DENTRO E RECUSADO.
  --
  -- Sem esta trava: `conta_corrente` e CASCADE (o razao some) e `clientes` e
  -- SET NULL (a pessoa fica orfa, e `sureya_lancar` recusa orfao).
  -- =========================================================================
  begin
    delete from familias where id = f_vaz;
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci45('familia com gente dentro nao se apaga',
               v_erro like '%familia_nao_esta_vazia%',
               'deu para apagar a familia e levar o razao junto, em silencio');
  perform ci45('e o lancamento continua la',
               (select count(*) from conta_corrente where cliente_id = c_cop) = 1,
               'os R$ 40 sumiram');

  -- =========================================================================
  -- O ENSAIO DA FUSAO NAO MOVE NADA.
  -- =========================================================================
  perform sureya_fundir_clientes(c_boa, c_cop, v_org, true);
  perform ci45('o ensaio da fusao nao move nada',
               (select count(*) from clientes where id = c_cop) = 1
               and (select cliente_id from comprovantes where id = v_cmp) = c_cop,
               'a previa fundiu de verdade');

  -- =========================================================================
  -- A FUSAO VALENDO — move tudo, DEPOIS apaga.
  -- =========================================================================
  perform sureya_fundir_clientes(c_boa, c_cop, v_org);

  perform ci45('a copia sai do cadastro',
               (select count(*) from clientes where id = c_cop) = 0, '');
  perform ci45('a conversa nao foi apagada junto',
               (select cliente_id from conversas where id = v_cnv) = c_boa,
               'CASCADE apagou a conversa da familia — historico perdido');
  perform ci45('o comprovante foi junto',
               (select cliente_id from comprovantes where id = v_cmp) = c_boa,
               'o comprovante sumiu com a copia');
  perform ci45('e o lancamento tambem, com a familia certa',
               (select count(*) from conta_corrente
                 where cliente_id = c_boa and familia_id = f_boa) = 1,
               'o dinheiro ficou apontando para a familia que vai deixar de existir');

  -- MESMO NUMERO NAO VIRA TELEFONE EXTRA.
  -- "11988758966" e "5511988758966" sao o MESMO numero depois de normalizar.
  -- Guardar uma copia dele em telefones_cliente seria criar a duplicata na
  -- tabela ao lado, no exato momento em que se acaba de tirar uma.
  perform ci45('o mesmo numero nao vira telefone extra repetido',
               (select count(*) from telefones_cliente where cliente_id = c_boa) = 0,
               'fundiu e ja criou uma duplicata na tabela de telefones extras');
  perform ci45('e o WhatsApp continua achando a pessoa certa',
               sureya_achar_cliente('5511988758966', v_org) = c_boa,
               'depois de fundir, a proxima mensagem dela cai como desconhecida');

  perform ci45('nao ha mais duplicado',
               (select count(*) from sureya_clientes_duplicados(v_org)) = 0, '');

  -- E AGORA a familia vazia se apaga.
  delete from familias where id = f_vaz;
  perform ci45('a familia que ficou vazia se apaga',
               (select count(*) from familias where id = f_vaz) = 0,
               'a trava esta impedindo ate a limpeza legitima');

  -- =========================================================================
  -- NUMERO DIFERENTE DE VERDADE NAO SE JOGA FORA.
  --
  -- Quando a copia tem OUTRO numero — a familia trocou de celular e alguem
  -- cadastrou de novo —, esse numero e por onde ela escreve hoje. Perde-lo
  -- faria a proxima mensagem dela cair como desconhecida: o defeito que esta
  -- migration existe para fechar, recriado pela propria limpeza.
  -- =========================================================================
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values ('45454545-0000-0000-0000-0000000000c4', v_org, 'Katia (celular novo)',
            '5511933334444', f_boa)
    on conflict (id) do nothing;
  perform sureya_fundir_clientes(c_boa, '45454545-0000-0000-0000-0000000000c4', v_org);

  perform ci45('numero diferente da copia vira telefone extra',
               (select count(*) from telefones_cliente
                 where cliente_id = c_boa
                   and sureya_telefone_normalizado(telefone) = '5511933334444') = 1,
               'jogou fora o numero por onde a familia escreve hoje');
  perform ci45('e o WhatsApp acha a pessoa por ele tambem',
               sureya_achar_cliente('5511933334444', v_org) = c_boa,
               'o telefone extra existe e a busca nao olha para ele');

  -- =========================================================================
  -- FUNDIR PARA DENTRO DE UM ORFAO E RECUSADO.
  -- =========================================================================
  -- O CADASTRO GANHA FAMILIA SOZINHO (gatilho `sureya_familia_para_cliente`),
  -- entao o orfao so existe se alguem apagar a familia por baixo — que e
  -- exatamente o que o `SET NULL` faz. Reproduzo esse estado a mao.
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values ('45454545-0000-0000-0000-0000000000c3', v_org, 'Orfao', '5511922222222', null)
    on conflict (id) do nothing;
  update clientes set familia_id = null where id = '45454545-0000-0000-0000-0000000000c3';
  begin
    perform sureya_fundir_clientes('45454545-0000-0000-0000-0000000000c3', c_boa, v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci45('nao se funde para dentro de quem nao tem familia',
               v_erro like '%quem_fica_sem_familia%',
               'criou o estado que sureya_lancar recusa: todo pagamento dela falharia');

  -- Fundir alguem consigo mesmo apagaria a propria pessoa no fim da funcao.
  begin
    perform sureya_fundir_clientes(c_boa, c_boa, v_org, true);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci45('nao se funde alguem consigo mesmo',
               v_erro like '%mesma_pessoa%',
               'a funcao apagaria a propria pessoa no fim');

  -- =========================================================================
  -- O RAZAO ANTIGO ESTA CONGELADO (D-01), e `movimentos` e ON DELETE CASCADE.
  --
  -- Mover seria escrever nele — proibido. Apagar deixaria o CASCADE levar
  -- historico junto, calado. Entao a fusao PARA e diz por que.
  -- =========================================================================
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values ('45454545-0000-0000-0000-0000000000c5', v_org, 'Com razao antigo',
            '5511955556666', f_boa)
    on conflict (id) do nothing;
  insert into movimentos (org_id, cliente_id, tipo, valor, origem, descricao, data)
    values (v_org, '45454545-0000-0000-0000-0000000000c5', 'credito', 10, 'pix_comprovante', 'antigo', current_date);
  begin
    perform sureya_fundir_clientes(c_boa, '45454545-0000-0000-0000-0000000000c5', v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci45('copia com lancamento no razao antigo nao se funde',
               v_erro like '%copia_tem_razao_antigo%',
               'a fusao escreveu no razao congelado ou apagou historico em silencio');

  -- =========================================================================
  -- QUEM PODE — licao da 0129. Estas funcoes movem dinheiro e apagam gente.
  -- =========================================================================
  perform ci45('anon nao acha cliente por telefone',
               not has_function_privilege('anon', 'sureya_achar_cliente(text,uuid)', 'execute'),
               'da para descobrir se um numero e cliente sem entrar no sistema');
  perform ci45('anon nao lista duplicados',
               not has_function_privilege('anon', 'sureya_clientes_duplicados(uuid)', 'execute'), '');
  perform ci45('anon nao funde ninguem',
               not has_function_privilege('anon', 'sureya_fundir_clientes(uuid,uuid,uuid,boolean)', 'execute'),
               'uma funcao que apaga cadastro esta aberta no endereco publico');

  raise notice '  ---';
end $$;

drop function ci45(text, boolean, text);

-- ============================================================================
-- A FAXINA DAS FAMILIAS SEM JAZIGO (0147)
--
-- Medido em 29/08, com os 11 duplicados ja juntados: 122 familias sem jazigo,
-- 113 pessoas dentro, 103 delas criadas no mesmo dia (a importacao). E TRES que
-- escreveram de verdade — Eliana, Nena Roberto e Zulmira.
--
-- O QUE PODE DAR ERRADO AQUI E MUDO:
--   apagar demais   `mensagens.cliente_id` e CASCADE: a conversa da familia
--                   sumiria junto com a limpeza, sem aviso.
--   apagar de menos deixar a pessoa para tras a torna ORFA, e orfao nao recebe
--                   pagamento (`sureya_lancar` recusa) — 113 de uma vez.
-- ============================================================================
create or replace function ci47(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'FAXINA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '47474747-4747-4747-4747-474747474747';
  v_cem uuid := '47474747-0000-0000-0000-0000000000ce';
  v_qua uuid := '47474747-0000-0000-0000-0000000000dd';
  f_seca uuid := '47474747-0000-0000-0000-0000000000f1';  -- so a pessoa
  f_fala uuid := '47474747-0000-0000-0000-0000000000f2';  -- escreveu (Zulmira)
  f_tem  uuid := '47474747-0000-0000-0000-0000000000f3';  -- tem jazigo
  c_seca uuid := '47474747-0000-0000-0000-0000000000c1';
  c_fala uuid := '47474747-0000-0000-0000-0000000000c2';
  c_tem  uuid := '47474747-0000-0000-0000-0000000000c3';
  v_cnv  uuid := '47474747-0000-0000-0000-0000000000cc';
  v_erro text; v_n int;
begin
  insert into orgs (id, nome) values (v_org, 'Teste 0147') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;

  insert into familias (id, org_id, nome) values (f_seca, v_org, 'So a pessoa') on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (f_fala, v_org, 'Zulmira') on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (f_tem,  v_org, 'Com jazigo') on conflict (id) do nothing;

  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (c_seca, v_org, 'Importada', '5511911110001', f_seca) on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (c_fala, v_org, 'Zulmira', '5511911110002', f_fala) on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (c_tem, v_org, 'Dona do jazigo', '5511911110003', f_tem) on conflict (id) do nothing;

  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values ('47474747-0000-0000-0000-0000000000a1', v_org, v_qua, f_tem, 'T-1', 'Q1-R1-001')
    on conflict (id) do nothing;

  insert into conversas (id, org_id, cliente_id) values (v_cnv, v_org, c_fala)
    on conflict (id) do nothing;
  insert into mensagens (org_id, conversa_id, cliente_id, direcao, autor, texto)
    values (v_org, v_cnv, c_fala, 'entrada', 'cliente', 'Bom dia, quando vao la?');

  -- =========================================================================
  -- A LISTA SEPARA QUEM PODE DE QUEM SEGURA.
  -- =========================================================================
  perform ci47('a familia com jazigo nao entra na lista',
               not exists (select 1 from sureya_familias_sem_jazigo(v_org)
                            where familia_id = f_tem),
               'a faxina esta olhando para familia que tem jazigo');
  perform ci47('a que so tem a pessoa pode sair',
               (select pode_apagar from sureya_familias_sem_jazigo(v_org)
                 where familia_id = f_seca) = true, '');
  perform ci47('a que escreveu NAO pode sair',
               (select pode_apagar from sureya_familias_sem_jazigo(v_org)
                 where familia_id = f_fala) = false,
               'a conversa da familia sumiria junto com a limpeza, sem aviso');
  perform ci47('e a lista diz por que ela fica',
               (select porque from sureya_familias_sem_jazigo(v_org)
                 where familia_id = f_fala) like '%escreveu%',
               'a tela nao teria como explicar a recusa');
  perform ci47('quem segura aparece primeiro',
               (select familia_id from sureya_familias_sem_jazigo(v_org) limit 1) = f_fala,
               'no fim de uma lista de 122, a informacao que muda a decisao nao e lida');

  -- =========================================================================
  -- O ENSAIO NAO APAGA NADA.
  -- =========================================================================
  perform sureya_apagar_familia_sem_jazigo(f_seca, v_org, true);
  perform ci47('o ensaio nao apaga nada',
               (select count(*) from familias where id = f_seca) = 1
               and (select count(*) from clientes where id = c_seca) = 1,
               'a previa apagou de verdade');

  -- =========================================================================
  -- APAGAR VALENDO — a pessoa vai junto.
  -- =========================================================================
  perform sureya_apagar_familia_sem_jazigo(f_seca, v_org);
  perform ci47('a familia sai', (select count(*) from familias where id = f_seca) = 0, '');
  perform ci47('e a pessoa vai junto, sem virar orfa',
               (select count(*) from clientes where id = c_seca) = 0,
               'a pessoa ficou sem familia — e orfao nao recebe pagamento');

  -- =========================================================================
  -- QUEM ESCREVEU E RECUSADO PELO BANCO, nao so escondido na tela.
  -- =========================================================================
  begin
    perform sureya_apagar_familia_sem_jazigo(f_fala, v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci47('quem escreveu e recusado pelo banco',
               v_erro like '%familia_tem_historico%',
               'a tela e a unica coisa protegendo a conversa da familia');
  perform ci47('e a mensagem continua la',
               (select count(*) from mensagens where conversa_id = v_cnv) = 1,
               'a recusa apagou a conversa pela metade');

  -- =========================================================================
  -- FAMILIA COM JAZIGO E RECUSADA — esta funcao apaga a PESSOA junto.
  -- =========================================================================
  begin
    perform sureya_apagar_familia_sem_jazigo(f_tem, v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci47('familia com jazigo e recusada',
               v_erro like '%familia_tem_jazigo%',
               'apagaria o dono de um jazigo');

  perform ci47('anon nao lista familias sem jazigo',
               not has_function_privilege('anon', 'sureya_familias_sem_jazigo(uuid)', 'execute'), '');
  perform ci47('anon nao apaga familia',
               not has_function_privilege('anon',
                 'sureya_apagar_familia_sem_jazigo(uuid,uuid,boolean)', 'execute'),
               'uma funcao que apaga cadastro esta aberta no endereco publico');

  raise notice '  ---';
end $$;

drop function ci47(text, boolean, text);
