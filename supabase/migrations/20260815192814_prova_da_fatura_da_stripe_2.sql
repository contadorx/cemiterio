do $$
declare r jsonb; n integer;
begin
  r := walkstamp.fatura_da_stripe('in_x','cus_nunca','ninguem@nenhures.example','A-0',1000,'BRL','paga',null,null);
  raise notice '1 pagador desconhecido: %', r;
  r := walkstamp.fatura_da_stripe('in_1','cus_abc','chefe@teste-portal.example','A-1',104700,'BRL','aberta',current_date+10,null);
  raise notice '2 conhecido pelo e-mail: %', r;
  r := walkstamp.fatura_da_stripe('in_1','cus_abc','chefe@teste-portal.example','A-1',104700,'BRL','aberta',current_date+10,null);
  r := walkstamp.fatura_da_stripe('in_1','cus_abc','chefe@teste-portal.example','A-1',104700,'BRL','paga',current_date+10,null);
  r := walkstamp.fatura_da_stripe('in_2','cus_abc','',null,104700,'BRL','aberta',null,null);
  raise notice '5 so pelo customer: %', r;
end $$;
