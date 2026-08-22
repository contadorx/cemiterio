-- Bloquear o joão e conferir que plano_de para de liberar para ele.
select walkstamp.time_bloquear('chefe@teste-portal.example','joao@teste-portal.example',true);
-- Encurtar o prazo do domínio e conferir que as contas existentes acompanham.
select walkstamp.time_ajustar('chefe@teste-portal.example', 7, 12);
