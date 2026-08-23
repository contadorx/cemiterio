-- =====================================================================
-- 0094 — A LIBERACAO E UMA PORTA SO
--
-- O QUE HAVIA: DUAS FILAS, E SO UMA APARECIA
-- ---------------------------------------------------------------------
-- Mensagem para familia saia por dois caminhos diferentes, cada um com
-- sua tela:
--
--   `fila_liberacao`  — foto da lavagem, cobranca, lembrete,
--                       agradecimento. Tela: /painel/fila. Tem politica
--                       de envio, modelo de texto, envio em lote,
--                       destravamento, contagem de erro.
--   `interacoes_ia`   — o que `proativo.ts` escrevia: aniversario,
--                       Finados, aviso de saldo. Tela: a aba "Rascunhos
--                       da IA", dentro de outro endereco.
--
-- Duas filas para o mesmo ato — decidir se uma mensagem sai — significa
-- duas telas para olhar todo dia, e a segunda ninguem olhava. A chave de
-- "nao enviar fotos para esta familia" (0085) vale numa e nao na outra;
-- a contagem de tentativa e o destravamento (0077) existem numa e nao na
-- outra. Uma mensagem comemorativa podia sair para uma familia em luto
-- sem passar por nenhuma das duas protecoes.
--
-- Esta migration abre a porta unica: `fila_liberacao` passa a receber
-- TODOS os tipos, e tudo que enfileira passa pelo mesmo gatilho.
--
-- O QUE ELA FAZ
-- ---------------------------------------------------------------------
-- 1. Dois tipos novos: `comemorativa` (aniversario, Finados, datas) e
--    `servico` (pedido adicional, avulso, o que nao e lavagem de plano).
-- 2. `familias.silenciar` — quais tipos esta familia NAO recebe. A chave
--    de fotos da 0085 continua valendo; esta a generaliza para os
--    demais.
-- 3. O gatilho da porta passa a valer para TODO tipo, e nao so para foto.
-- 4. `sureya_ultima_acao_familia` — o que ja saiu para esta familia, e
--    quando. E a pergunta que ela faz antes de liberar: "eu ja nao mandei
--    alguma coisa para essa gente esta semana?"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · OS TIPOS NOVOS
--
-- `add value` fora de transacao explicita (psql roda cada comando em
-- autocommit), porque um valor novo de enum nao pode ser USADO na mesma
-- transacao em que nasce.
-- ---------------------------------------------------------------------
alter type public.sureya_tipo_mensagem add value if not exists 'comemorativa';
alter type public.sureya_tipo_mensagem add value if not exists 'servico';

-- ---------------------------------------------------------------------
-- 2 · O QUE ESTA FAMILIA NAO RECEBE
--
-- Um array de tipos, e nao uma coluna booleana por tipo: tipo novo nao
-- deve pedir migration nova. Vazio (o padrao) = recebe tudo, que e o
-- comportamento de hoje.
--
-- `familias.enviar_fotos` (0085) CONTINUA valendo e nao foi absorvida:
-- ela e de tres estados (nulo = segue a casa), e o array e de dois. Quem
-- decide foto continua sendo `sureya_envia_fotos`.
-- ---------------------------------------------------------------------
alter table public.familias
  add column if not exists silenciar text[] not null default '{}';

comment on column public.familias.silenciar is
  'Tipos de mensagem que esta familia nao recebe. Vazio = recebe tudo. A foto tem chave propria de tres estados (enviar_fotos, 0085) e nao passa por aqui.';

create or replace function public.sureya_familia_silencia(
  p_familia uuid, p_tipo text
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p_tipo = any(f.silenciar) from familias f where f.id = p_familia),
    false
  );
$$;

comment on function public.sureya_familia_silencia(uuid, text) is
  'Esta familia pediu para nao receber mensagem deste tipo? Falso quando a familia nao existe — silenciar e um ato, e a ausencia de familia nao e um pedido de silencio.';

revoke execute on function public.sureya_familia_silencia(uuid, text) from public, anon;
grant  execute on function public.sureya_familia_silencia(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3 · O QUE JA SAIU PARA ESTA FAMILIA
--
-- Uma linha por familia POR TIPO, e nao so a ultima de todas. As duas
-- perguntas sao diferentes e as duas se fazem na hora de liberar:
--
--   "ja mandei foto para essa familia recentemente?"  -> mesma linha
--   "ja falei com essa gente esta semana?"            -> a mais recente
--                                                        de qualquer tipo
--
-- So conta o que foi ENVIADO. Descartado nao chegou em ninguem, e contar
-- como acao faria a tela dizer que a familia recebeu o que a Sureya
-- decidiu nao mandar.
-- ---------------------------------------------------------------------
create or replace view public.sureya_ultima_acao_familia
with (security_invoker = true) as
select distinct on (f.familia_id, f.tipo)
  f.familia_id,
  f.org_id,
  f.tipo::text                                              as tipo,
  f.decidido_em,
  (f.decidido_em at time zone 'America/Sao_Paulo')::date     as dia
from fila_liberacao f
where f.status = 'enviado'
  and f.familia_id is not null
  and f.decidido_em is not null
order by f.familia_id, f.tipo, f.decidido_em desc;

comment on view public.sureya_ultima_acao_familia is
  'A ultima mensagem ENVIADA para cada familia, por tipo. Descartada nao conta: nao chegou em ninguem.';

revoke all    on public.sureya_ultima_acao_familia from public, anon;
grant  select on public.sureya_ultima_acao_familia to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4 · A PORTA PASSA A VALER PARA TODO TIPO
--
-- O gatilho da 0085 devolvia `new` sem olhar nada quando o tipo nao era
-- `foto` — ele existia so para a foto. Agora ele e a porta: primeiro o
-- silencio da familia (que vale para todos), depois a regra especifica
-- da foto (a chave de tres estados e o texto de reserva).
--
-- Continua sendo BEFORE INSERT devolvendo NULL para barrar: a mensagem
-- barrada nao entra na fila, em vez de entrar e ser descartada depois. O
-- efeito para quem olha a tela e o mesmo; a diferenca e que ninguem
-- precisa decidir sobre uma mensagem que ja estava decidida.
-- ---------------------------------------------------------------------
create or replace function public.sureya_fila_politica_de_foto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome   text;
  v_codigo text;
begin
  -- O SILENCIO DA FAMILIA VALE PARA QUALQUER TIPO.
  --
  -- Vem antes de tudo: uma familia que pediu para nao receber cobranca
  -- nao deve nem ver a cobranca preparada na fila esperando decisao.
  if new.familia_id is not null
     and sureya_familia_silencia(new.familia_id, new.tipo::text) then
    return null;
  end if;

  if new.tipo <> 'foto' then
    return new;
  end if;

  -- A CHAVE. Desligada para esta família, a mensagem não entra na fila.
  if new.familia_id is not null and not sureya_envia_fotos(new.familia_id) then
    return null;
  end if;

  -- O TEXTO DE RESERVA.
  --
  -- Substituo em dois casos, e SÓ nesses dois: texto vazio, e o texto que
  -- estava escrito dentro de `sureya_concluir_lavagem` — aquele que apareceu
  -- na tela de liberação em produção no dia 22/08. Um texto que a aplicação
  -- escreveu de propósito passa intacto; senão eu estaria jogando fora a
  -- mensagem boa do `mensagens.ts` para pôr a minha no lugar.
  if coalesce(btrim(new.texto), '') = ''
     or btrim(new.texto) = 'A limpeza foi feita. Segue a foto. 🌿' then
    select c.nome into v_nome from clientes c where c.id = new.cliente_id;
    select t.codigo into v_codigo from tumulos t where t.id = new.tumulo_id;
    new.texto := sureya_texto_modelo(
                   new.org_id, 'foto',
                   coalesce(new.servico_id::text, new.tumulo_id::text, new.id::text),
                   v_nome, v_codigo);
  end if;

  return new;
end $$;

comment on function public.sureya_fila_politica_de_foto() is
  'BEFORE INSERT em fila_liberacao: barra o que a familia silenciou (qualquer tipo), aplica a chave de envio de fotos e troca o texto de reserva por um modelo da casa. Vale para todo caminho que enfileira.';
