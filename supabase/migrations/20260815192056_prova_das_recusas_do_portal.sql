do $$
declare r jsonb;
begin
  r := walkstamp.time_convidar('ana@teste-portal.example','x@teste-portal.example');
  raise notice 'membro administra? %', r;
  r := walkstamp.time_convidar('chefe@teste-portal.example','naoehemail');
  raise notice 'email torto: %', r;
  r := walkstamp.time_convidar('chefe@teste-portal.example','novo@teste-portal.example');
  raise notice 'terceiro entrou, usados=%', r->'usados';
  r := walkstamp.time_convidar('chefe@teste-portal.example','quarto@teste-portal.example');
  raise notice 'quarto (limite 3): %', r;
  r := walkstamp.time_bloquear('chefe@teste-portal.example','estranho@outra.com',true);
  raise notice 'bloquear de fora: %', r;
  r := walkstamp.time_bloquear('chefe@teste-portal.example','chefe@teste-portal.example',true);
  raise notice 'bloquear a si: %', r;
  r := walkstamp.time_config('chefe@teste-portal.example',
        '{"empresa":"Cliente de Teste S.A.","logo_url":"https://x/logo.png","rotulo":"Evidência"}'::jsonb);
  raise notice 'config: %', r->'config';
  r := walkstamp.time_modelo('chefe@teste-portal.example', null, 'Padrão de auditoria', 'time',
        '{"campos":["chamado","ambiente"]}'::jsonb, false);
  raise notice 'modelo: %', r->'modelos';
end $$;
