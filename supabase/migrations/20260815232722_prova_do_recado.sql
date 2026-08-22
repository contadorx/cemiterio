do $$
declare r text;
begin
  r := walkstamp.recado_novo('problema','teste de ponta a ponta do recado','x@y.com',3,'pt','evidencia','app','diag de teste');
  raise notice '1 recado normal: %', r;
  r := walkstamp.recado_novo('ideia','a','',null,'pt',null,'site',null);
  raise notice '2 texto curto demais: % (tem que ser vazio)', r;
  r := walkstamp.recado_novo('inventado','texto valido aqui','naoehemail',99,'pt',null,'site',null);
  raise notice '3 tipo/email/nota invalidos: %', r;
end $$;
