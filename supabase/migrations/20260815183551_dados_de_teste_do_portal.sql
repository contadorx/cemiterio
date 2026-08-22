insert into walkstamp.dominio (dominio, assentos, dias, cliente, admin_email)
values ('teste-portal.example', 5, 90, 'Cliente de Teste', 'chefe@teste-portal.example')
on conflict (dominio) do update set admin_email = excluded.admin_email,
  assentos = excluded.assentos, dias = excluded.dias, cliente = excluded.cliente, ativo = true;

insert into walkstamp.conta (email, plano, assentos, dias, cliente, ativo, emissoes, ultima_em, vence_em)
values ('chefe@teste-portal.example','time',5,90,'Cliente de Teste',true,2,now(),current_date+90),
       ('ana@teste-portal.example','time',5,90,'Cliente de Teste',true,1,now(),current_date+90),
       ('joao@teste-portal.example','time',5,90,'Cliente de Teste',true,3,now(),current_date+90)
on conflict (email) do update set ativo = true, emissoes = excluded.emissoes,
  ultima_em = excluded.ultima_em, vence_em = excluded.vence_em, dias = excluded.dias;
