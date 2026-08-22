-- ============================================================================
-- SUREYA — 0041 · A AGENDA PARA DE APAGAR DECISÃO HUMANA
--
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- `alocarAgenda()` (src/lib/agenda.ts) reescreve `data_prevista`, `ordem_dia`,
-- `status` e `executora_id` de TODO serviço com status 'pendente'. Ela roda no
-- cron das 9h, no botão "Gerar e distribuir" e no "Reorganizar".
--
-- Consequência: você remarca uma lavagem à mão para o dia que combinou com a
-- família — e na madrugada seguinte o alocador devolve o serviço para onde a
-- fila mandar. Sem log, sem aviso, sem jeito de saber que aconteceu.
--
-- A SOLUÇÃO
-- ---------------------------------------------------------------------------
-- Uma marca de "isto aqui foi decidido por uma pessoa". O alocador passa a
-- pular quem tem essa marca; o resto continua sendo distribuído como sempre.
--
-- Preencher `fixado_em` é o que a remarcação manual faz a partir de agora. Para
-- devolver o serviço ao alocador, é só limpar a marca (a tela tem o botão).
--
-- ⚠ O QUE SE PERDE: NADA. Só adiciona coluna, com default nulo — todo serviço
--   que já existe continua exatamente como está, e o comportamento só muda
--   para o que você remarcar daqui para frente.
--   COMO CONFERIR ANTES: `select count(*) from servicos;` antes e depois — o
--   número tem que ser o mesmo. Nenhuma linha é tocada.
-- ============================================================================

alter table servicos
  add column if not exists fixado_em timestamptz;

comment on column servicos.fixado_em is
  'Quando uma PESSOA decidiu a data/executora desta lavagem. Enquanto estiver preenchido, o alocador automático não mexe nela.';

-- Índice parcial: a consulta do alocador filtra por "não fixado", e os fixados
-- são poucos. Índice pequeno, leitura rápida.
create index if not exists idx_servicos_fixados
  on servicos (org_id, fixado_em)
  where fixado_em is not null;

-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================

-- 1) A coluna existe? (uma linha)
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'servicos' and column_name = 'fixado_em';

-- 2) O que está fixado hoje (deve começar vazio, e encher conforme você remarca).
--    Se um dia aparecer algo aqui que você não reconhece, é só desfixar pela
--    tela da Agenda — o serviço volta a ser distribuído automaticamente.
select s.id, s.data_prevista, s.fixado_em, s.status,
       c.nome as familia, q.codigo as quadra, t.identificacao as jazigo,
       s.motivo_adiamento
  from servicos s
  left join clientes c on c.id = s.cliente_id
  left join tumulos  t on t.id = s.tumulo_id
  left join quadras  q on q.id = t.quadra_id
 where s.fixado_em is not null
 order by s.data_prevista;
