-- ---------------------------------------------------------------------------
-- 0037 — a data que a família pediu para de ser um palpite
--
-- "ele dá uma data de até, mas queria uma data de preferência"
--
-- O que existia: `data_prevista`. Ela É DO ALOCADOR — a cada geração da agenda
-- ele reescreve essa coluna com o dia em que conseguiu encaixar. Quer dizer que
-- a data digitada no "Fazer até" sobrevivia só até a próxima geração, e podia
-- cair DEPOIS do dia pedido sem ninguém avisar. Para o Dia dos Pais, isso é o
-- serviço chegar atrasado calado.
--
-- Agora são duas colunas com donos diferentes — o mesmo desenho que a 0032 já
-- usou para `data_plano`:
--   · data_desejada  → SUA. Congelada. O alocador lê e nunca escreve.
--   · data_prevista  → DELE. O dia da rota, muda quantas vezes precisar.
--
-- Regra combinada: de preferência NA data desejada; se o dia estiver cheio,
-- ANTES dela; nunca depois. Quando nem antes couber, o serviço é marcado com
-- `desejada_estourada` e aparece em vermelho na fila, em vez de sumir.
--
-- Inclui de novo a coluna `observacao` da 0036 (é `if not exists`, roda sem
-- medo mesmo que você já tenha rodado aquela).
-- ---------------------------------------------------------------------------

alter table servicos add column if not exists observacao         text;
alter table servicos add column if not exists data_desejada      date;
alter table servicos add column if not exists desejada_estourada boolean not null default false;

comment on column servicos.observacao is
  'Recado livre do serviço, principalmente avulso: quem pediu, ocasião, o que a família espera. Aparece para quem executa.';
comment on column servicos.data_desejada is
  'A data pedida pela família. Congelada: o alocador lê e nunca sobrescreve. Prefere esse dia, pode antecipar, nunca passar.';
comment on column servicos.desejada_estourada is
  'true quando o alocador não conseguiu encaixar até a data_desejada. É o aviso de que a promessa não cabe na capacidade.';

create index if not exists idx_servicos_desejada
  on servicos(org_id, data_desejada)
  where data_desejada is not null;

-- Serviços avulsos que já existem e nasceram com "Fazer até": herdam a data.
-- Só os que ainda não foram executados, e só uma vez (não sobrescreve o que já
-- tiver data_desejada preenchida).
update servicos
   set data_desejada = data_prevista
 where plano_id is null
   and data_desejada is null
   and data_prevista is not null
   and status in ('pendente', 'agendado');

-- ---------------------------------------------------------------------------
-- CONFERENCIA (somente leitura)
-- ---------------------------------------------------------------------------

-- as colunas existem?
select column_name, data_type
  from information_schema.columns
 where table_name = 'servicos'
   and column_name in ('observacao', 'data_desejada', 'desejada_estourada')
 order by column_name;

-- avulsos em aberto: o que a família pediu x onde a agenda encaixou
select data_desejada  as pediu_para,
       data_prevista  as agenda_marcou,
       desejada_estourada,
       status, valor, observacao
  from servicos
 where plano_id is null
   and status in ('pendente', 'agendado')
 order by data_desejada nulls last;
