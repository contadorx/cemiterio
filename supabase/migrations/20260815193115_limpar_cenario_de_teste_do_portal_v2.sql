delete from walkstamp.fatura where cliente_id in (select id from walkstamp.cliente where nome='Cliente de Teste');
delete from walkstamp.emissao where email like '%@teste-portal.example' or email='ninguem@fora.example';
delete from walkstamp.modelo_doc where cliente_id in (select id from walkstamp.cliente where nome='Cliente de Teste');
delete from walkstamp.config where cliente_id in (select id from walkstamp.cliente where nome='Cliente de Teste');
delete from walkstamp.usuario where email like '%@teste-portal.example' or email='ninguem@fora.example';
delete from walkstamp.dominio where dominio='teste-portal.example';
delete from walkstamp.cliente where nome='Cliente de Teste';
delete from walkstamp.conta where email like '%@teste-portal.example' or email='ninguem@fora.example';
