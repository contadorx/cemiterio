-- 0113 — DESCARTAR PARA DE VERDADE
--
-- O CASO
--   "tinha uma foto eu descartei, então deveria ser descartada também né"
--
--   Estava certo. Medido em 23/08:
--     fila_liberacao  1 foto DESCARTADA   servico 1b54c69d…
--     fila_envios     1 midia PENDENTE    .../1b54c69d…/depois-….jpg
--   A mesma foto, em duas filas, com decisões opostas.
--
-- POR QUE SÃO DUAS FILAS
--   Elas não são redundantes, e por isso a confusão é fácil:
--     fila_liberacao  espera uma PESSOA aprovar
--     fila_envios     já foi aprovada, a entrega FALHOU, está tentando de novo
--   Esta tinha 2 tentativas: saiu, o WhatsApp recusou, voltou para a fila.
--
--   Quando a Sureya vê a mensagem de volta na tela e a descarta, ela está
--   dizendo "não mande isso". Mas o descarte só apagava a intenção — a
--   tentativa continuava viva do outro lado, e sairia sozinha no dia em que a
--   entrega voltasse a funcionar. Descartar não descartava.
--
-- O QUE FALTAVA
--   O vínculo. `fila_envios` guardava só telefone e payload; para saber de que
--   serviço era aquela mídia, só olhando o caminho do arquivo — uma amarração
--   por texto de URL, que quebra no dia em que o storage mudar de forma.

begin;

-- ---------------------------------------------------------------------------
-- 1. A FILA DE REENVIO PASSA A SABER DE QUE SERVIÇO É
-- ---------------------------------------------------------------------------
alter table fila_envios add column if not exists servico_id uuid;

comment on column fila_envios.servico_id is
  'De que servico e esta midia. Sem ele, descartar na fila_liberacao nao alcanca a tentativa de reenvio.';

create index if not exists idx_fila_envios_servico
  on fila_envios (org_id, servico_id) where servico_id is not null;

-- BACKFILL pelo caminho do arquivo, uma vez só.
--
-- É exatamente a amarração frágil que a coluna vem substituir — mas para o que
-- JÁ está na fila não há outra fonte, e deixar a linha de hoje sem vínculo
-- seria manter o defeito vivo justamente no caso que o revelou.
--
-- O padrão é `/servicos/<org>/<servico>/depois-*.jpg`: o penúltimo segmento.
update fila_envios
   set servico_id = sub.id
  from (
    select e.id as fila_id,
           nullif(split_part(
             regexp_replace(coalesce(e.payload->>'media', ''), '^.*/servicos/', ''),
             '/', 2), '')::uuid as id
      from fila_envios e
     where e.servico_id is null
       and coalesce(e.payload->>'media', '') ~ '/servicos/[0-9a-f-]+/[0-9a-f-]+/'
  ) sub
 where fila_envios.id = sub.fila_id
   and sub.id is not null;

-- ---------------------------------------------------------------------------
-- 2. DESCARTAR ALCANÇA AS DUAS FILAS
-- ---------------------------------------------------------------------------
-- Marca como `falhou` com o motivo escrito, em vez de apagar: a linha continua
-- contando a história — a mensagem existiu, tentou sair, e uma pessoa decidiu
-- que não. Apagar deixaria o mesmo estado final e nenhuma explicação.
create or replace function public.sureya_cancelar_reenvio_do_servico(
  p_servico uuid, p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int := 0;
begin
  if p_servico is null then return 0; end if;

  update fila_envios
     set status = 'falhou',
         ultimo_erro = coalesce(nullif(btrim(p_motivo), ''),
                                'cancelado junto com o descarte na fila de liberacao')
         -- `proximo_retry` e NOT NULL e fica onde esta: quem drena a fila
         -- filtra por `status = 'pendente'`, entao mudar o status ja para a
         -- tentativa. Zerar a data exigiria afrouxar a coluna sem ganho.
   where org_id = current_org_id()
     and servico_id = p_servico
     and status = 'pendente';

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.sureya_cancelar_reenvio_do_servico(uuid, text) from public, anon;
grant execute on function public.sureya_cancelar_reenvio_do_servico(uuid, text)
  to authenticated, service_role;

commit;
