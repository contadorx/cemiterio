insert into walkstamp.cliente (nome, documento, plano, assentos, dias)
values ('Cliente de Teste', '00.000.000/0001-00', 'time', 3, 90);

insert into walkstamp.dominio (dominio, assentos, dias, cliente, cliente_id)
select 'teste-portal.example', 3, 90, 'Cliente de Teste', id from walkstamp.cliente where nome='Cliente de Teste';

insert into walkstamp.usuario (cliente_id, email, papel, emissoes, ultima_em, vence_em)
select id, 'chefe@teste-portal.example', 'admin', 2, now(), current_date+90 from walkstamp.cliente where nome='Cliente de Teste';
insert into walkstamp.usuario (cliente_id, email, papel, emissoes, ultima_em, vence_em)
select id, 'ana@teste-portal.example', 'membro', 1, now(), current_date+90 from walkstamp.cliente where nome='Cliente de Teste';

insert into walkstamp.fatura (cliente_id, numero, competencia, valor_centavos, moeda, status, vence_em, pago_em, nf_url, nf_numero)
select id, '2026-001', date '2026-08-01', 104700, 'BRL', 'paga', date '2026-08-10', now(),
       'https://financeirox.example/nf/2026-001.pdf', 'NFSe 4417' from walkstamp.cliente where nome='Cliente de Teste';
insert into walkstamp.fatura (cliente_id, numero, competencia, valor_centavos, moeda, status, vence_em)
select id, '2026-002', date '2026-09-01', 104700, 'BRL', 'aberta', date '2026-09-10' from walkstamp.cliente where nome='Cliente de Teste';
