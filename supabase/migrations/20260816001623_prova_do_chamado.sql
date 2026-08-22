do $$
declare num text; r jsonb;
begin
  num := walkstamp.recado_novo('problema','o PDF sai sem a capa','fulano@empresa.com',null,'pt','evidencia','app','diag');
  raise notice '1 abriu com numero: %', num;
  r := walkstamp.chamado_ver(num, 'fulano@empresa.com');
  raise notice '2 consulta com o e-mail certo: status=% texto=%', r->>'status', r->>'texto';
  r := walkstamp.chamado_ver(num, 'outro@empresa.com');
  raise notice '3 com e-mail errado: %', r;
  r := walkstamp.chamado_ver('WS-9999', 'fulano@empresa.com');
  raise notice '4 numero que nao existe: %', r;
  -- quem abriu sem e-mail nao consulta
  num := walkstamp.recado_novo('ideia','seria bom ter atalho','',null,'pt',null,'site',null);
  r := walkstamp.chamado_ver(num, '');
  raise notice '5 aberto sem e-mail, consulta: %', r;
  -- responder
  update walkstamp.recado set status='respondido', resposta='corrigido na versão de hoje',
         respondido_em = now() where email='fulano@empresa.com';
  raise notice '6 tempo medio de resposta (horas): %', walkstamp.chamado_tempo();
end $$;
