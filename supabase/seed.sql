-- ============================================================================
-- O SEED. Dados de DESENVOLVIMENTO — nunca de produção.
--
-- O `supabase db reset` roda isto depois das migrações. Ele existe para que
-- quem clona o repositório tenha, em um comando, um banco com as três formas
-- de conta que o produto conhece — em vez de uma tela vazia e meia hora
-- inventando dados para ver alguma coisa acontecer.
--
-- Tudo aqui usa `.example`, que é um domínio reservado por RFC justamente para
-- isto: nenhum e-mail daqui pode existir no mundo. Se um dia uma linha deste
-- arquivo aparecer na produção, o domínio a denuncia sozinha.
-- ============================================================================

-- 1. Um cliente Time, com admin e um membro. É a forma que paga.
with c as (
  insert into walkstamp.cliente (nome, documento, plano, assentos, dias, stripe_id)
       values ('Auditoria Modelo Ltda', '00.000.000/0001-00', 'time', 5, 90, 'cus_dev_time')
    returning id
)
insert into walkstamp.usuario (cliente_id, email, papel, emissoes, ultima_em, vence_em)
select c.id, e.email, e.papel, e.n, now(), current_date + 90
  from c, (values ('chefe@modelo.example','admin',3),
                  ('ana@modelo.example','membro',1)) as e(email,papel,n);

insert into walkstamp.dominio (dominio, assentos, dias, cliente, cliente_id)
select 'modelo.example', 5, 90, 'Auditoria Modelo Ltda', id
  from walkstamp.cliente where nome = 'Auditoria Modelo Ltda';

-- O perfil que a ferramenta puxa: identidade e formato padrão do documento.
insert into walkstamp.config (cliente_id, empresa, rotulo, ambiente, papel, layout, hash, numerar)
select id, 'Auditoria Modelo', 'Evidência', 'QAS', 'a4', 'auto', true, true
  from walkstamp.cliente where nome = 'Auditoria Modelo Ltda';

insert into walkstamp.modelo_doc (cliente_id, nome, escopo, dados)
select id, 'Padrão de auditoria', 'time', '{"campos":["chamado","ambiente"]}'::jsonb
  from walkstamp.cliente where nome = 'Auditoria Modelo Ltda';

-- 2. Uma fatura paga e uma em aberto — a área do cliente precisa das duas para
--    mostrar as duas caras que ela tem.
insert into walkstamp.fatura (cliente_id, numero, competencia, valor_centavos, moeda,
                              status, vence_em, pago_em, nf_numero)
select id, '2026-001', date '2026-07-01', 104700, 'BRL', 'paga', date '2026-07-10', now(), 'NFSe 4417'
  from walkstamp.cliente where nome = 'Auditoria Modelo Ltda';
insert into walkstamp.fatura (cliente_id, numero, competencia, valor_centavos, moeda, status, vence_em)
select id, '2026-002', date '2026-08-01', 104700, 'BRL', 'aberta', current_date + 8
  from walkstamp.cliente where nome = 'Auditoria Modelo Ltda';

-- 3. Um assinante Personal, que é a outra forma de pagar.
insert into walkstamp.cliente (nome, plano, assentos, dias, stripe_id, stripe_assinatura)
     values ('solo@modelo.example', 'personal', 1, 30, 'cus_dev_solo', 'sub_dev_solo');
insert into walkstamp.usuario (cliente_id, email, papel, emissoes, ultima_em, vence_em)
select id, 'solo@modelo.example', 'admin', 7, now(), current_date + 30
  from walkstamp.cliente where nome = 'solo@modelo.example';

-- 4. Um roteiro de time com um caso feito e dois por fazer: é o estado em que
--    a tela de acompanhamento fica interessante.
with r as (
  insert into walkstamp.roteiro (cliente_id, dono, nome, escopo)
  select id, 'chefe@modelo.example', 'Rodada de regressão — agosto', 'time'
    from walkstamp.cliente where nome = 'Auditoria Modelo Ltda'
  returning id
)
insert into walkstamp.roteiro_caso (roteiro_id, ordem, caso, titulo, cenario, chamado,
                                    sistema, responsavel, feito_em, feito_por, impressao)
select r.id, v.ordem, v.caso, v.titulo, 'evidencia', v.chamado, 'SAP ECC',
       v.resp, v.feito, v.por, v.imp
  from r, (values
    (1,'CT-01','Entrar na transação','INC-1201','ana@modelo.example',
       now(),'ana@modelo.example','9f2b7c41aa'),
    (2,'CT-02','Informar o fornecedor','INC-1201','ana@modelo.example',
       null::timestamptz,null::text,null::text),
    (3,'CT-03','Aprovar o pedido','INC-1202','chefe@modelo.example',
       null::timestamptz,null::text,null::text)
  ) as v(ordem,caso,titulo,chamado,resp,feito,por,imp);

-- 5. Chamados de suporte nos três estados, com uma nota de NPS cada — sem isso
--    o painel de negócio abre com o NPS vazio e não dá para ver se ele calcula.
insert into walkstamp.recado (numero, tipo, texto, email, nota, idioma, cenario, origem,
                              status, resposta, respondido_em)
values ('WS-9001','problema','O PDF sai sem a capa quando o cenário é ata.',
        'chefe@modelo.example', 9, 'pt','ata','app','respondido',
        'Corrigido na versão de hoje.', now() - interval '4 hours'),
       ('WS-9002','ideia','Seria bom exportar o roteiro para CSV.',
        'ana@modelo.example', 8, 'pt', null,'site','aberto', null, null),
       ('WS-9003','elogio','A transcrição local resolveu meu problema de compliance.',
        'solo@modelo.example', 10,'pt','evidencia','app','aberto', null, null);

-- 6. Lista de aviso e marcos de uso, para os gráficos do painel não abrirem em
--    branco.
insert into walkstamp.interesse (email, idioma)
values ('curioso@modelo.example','pt'), ('curious@modelo.example','en');

insert into walkstamp.evento (nome, formato, idioma, origem, criado_em)
select v.nome, v.formato, 'pt', v.origem, now() - (g * interval '1 day')
  from generate_series(0, 20) g,
       (values ('abriu_ferramenta',null,'arquivo'),
               ('carregou_video',null,'gravacao'),
               ('baixou_saida','pdf','gravacao')) as v(nome,formato,origem);
