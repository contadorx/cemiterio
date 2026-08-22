-- O ciclo inteiro da licença sobre o modelo novo, incluindo os dois defeitos
-- que já foram corrigidos uma vez e não podem voltar: teste que se renova
-- sozinho, e teste que vira plano pago.
do $$
declare r record;
begin
  -- 1. desconhecido ganha teste de 14 dias, uma vez
  select * into r from walkstamp.plano_de('ninguem@fora.example');
  raise notice '1 desconhecido: motivo=% dias=%', r.motivo, r.dias;
  perform walkstamp.registrar_emissao('ninguem@fora.example','teste',1,14,null,current_date+14);
  select * into r from walkstamp.plano_de('ninguem@fora.example');
  raise notice '2 depois do teste: motivo=% (tem que ser teste_usado)', r.motivo;

  -- 2. o teste NÃO virou plano pago
  raise notice '3 cliente do usuario de teste: %',
    (select cliente_id from walkstamp.usuario where email='ninguem@fora.example');

  -- 3. quem é do domínio do cliente entra pago
  select * into r from walkstamp.plano_de('outro@teste-portal.example');
  raise notice '4 do dominio: motivo=% plano=% assentos=% cliente=%', r.motivo, r.plano, r.assentos, r.cliente;
  perform walkstamp.registrar_emissao('outro@teste-portal.example','time',3,90,'Cliente de Teste',current_date+90);
  select * into r from walkstamp.plano_de('outro@teste-portal.example');
  raise notice '5 depois de pedir: motivo=% (agora conta) plano=%', r.motivo, r.plano;

  -- 4. bloqueado no portal para de receber
  perform walkstamp.time_bloquear('chefe@teste-portal.example','outro@teste-portal.example',true);
  select * into r from walkstamp.plano_de('outro@teste-portal.example');
  raise notice '6 bloqueado: motivo=% (tem que ser suspensa)', r.motivo;

  -- 5. o prazo mudado no portal alcança quem JÁ pediu
  perform walkstamp.time_bloquear('chefe@teste-portal.example','outro@teste-portal.example',false);
  perform walkstamp.time_ajustar('chefe@teste-portal.example', 7, 3);
  select * into r from walkstamp.plano_de('outro@teste-portal.example');
  raise notice '7 prazo novo alcanca quem ja pediu: dias=% (tem que ser 7)', r.dias;

  -- 6. cliente inteiro suspenso derruba todo mundo
  update walkstamp.cliente set ativo=false where nome='Cliente de Teste';
  select * into r from walkstamp.plano_de('ana@teste-portal.example');
  raise notice '8 cliente suspenso: motivo=% ', r.motivo;
  update walkstamp.cliente set ativo=true where nome='Cliente de Teste';
end $$;
