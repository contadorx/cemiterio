-- ---------------------------------------------------------------------------
-- 0036 — uma linha de recado no serviço avulso
--
-- "tenho um serviço esporádico como registrar"
--
-- O serviço avulso nasce de um pedido que veio de fora do sistema: telefonema,
-- alguém que passou no cemitério, você lembrando. Esse contexto — quem pediu,
-- por que, para qual data — não existia em lugar nenhum: a tabela `servicos` só
-- tem jazigo, data e valor. A executora chegava no jazigo sem saber que aquela
-- limpeza era do Dia dos Pais e que a família estava esperando a foto.
--
-- Coluna nova, opcional, aditiva. Nada quebra sem ela: a API grava o serviço do
-- mesmo jeito e só omite o recado.
-- ---------------------------------------------------------------------------

alter table servicos add column if not exists observacao text;

comment on column servicos.observacao is
  'Recado livre do serviço, principalmente avulso: quem pediu, ocasião, o que a família espera. Aparece para quem executa.';

-- ---------------------------------------------------------------------------
-- CONFERENCIA (somente leitura)
-- ---------------------------------------------------------------------------

-- a coluna existe?
select column_name, data_type
  from information_schema.columns
 where table_name = 'servicos' and column_name = 'observacao';

-- avulsos abertos (plano_id null = fora de plano)
select data_prevista, status, valor, observacao
  from servicos
 where plano_id is null and status in ('pendente','agendado')
 order by data_prevista;
