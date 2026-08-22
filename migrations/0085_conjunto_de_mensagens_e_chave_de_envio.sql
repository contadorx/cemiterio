-- =====================================================================
-- 0085 · O CONJUNTO DE MENSAGENS, E A CHAVE QUE DECIDE SE A FOTO SAI
-- =====================================================================
--
-- O QUE ACONTECEU NO CAMPO, EM 22/08
-- A primeira limpeza de verdade chegou à tela de liberação com este texto:
--
--     "A limpeza foi feita. Segue a foto. 🌿"
--
-- Não é o texto da casa. O texto da casa está em `src/lib/mensagens.ts` e é
-- outro — longo, no tratamento de senhor(a), assinado com a Dona Nadir. Aquela
-- frase é o TEXTO DE RESERVA que estava escrito dentro de
-- `sureya_concluir_lavagem`, para o caso de a aplicação não mandar nada.
--
-- Ou seja: o caminho de reserva não é teórico, ele roda. E o que ele entregava
-- era um bilhete que parece resposta automática de sistema — exatamente o
-- contrário do tom que o `mensagens.ts` documenta em quinze linhas de comentário.
--
-- Não consegui provar POR QUE o texto bom não chegou naquela chamada: não há
-- nada em `erros_log`, a família tinha destinatário (`recebe_fotos = true`) e o
-- jazigo tinha `familia_id`. As duas hipóteses que sobram são a versão publicada
-- estar atrás do repositório, ou a linha já existir de uma tentativa anterior e
-- o `on conflict do nothing` ter preservado o texto antigo. Por isso esta
-- migration NÃO tenta adivinhar a causa: ela conserta o que aparece.
--
-- O QUE ESTA MIGRATION FAZ
--
--   1. `modelos_mensagem` — um CONJUNTO de textos por tipo, não um só. A
--      família que recebe foto todo mês não pode ler o mesmo parágrafo doze
--      vezes por ano: isso transforma cuidado em formulário.
--
--   2. `sureya_texto_modelo()` — sorteia um modelo ativo. O sorteio é preso à
--      SEMENTE (o id do serviço), não ao relógio: chamar a função convergente
--      de novo no mesmo serviço devolve o MESMO texto, senão uma reparação
--      trocaria a mensagem que a Sureya já tinha lido na fila.
--
--   3. O texto de reserva de `sureya_concluir_lavagem` passa a sair daí, com o
--      nome de quem recebe preenchido.
--
--   4. A CHAVE DE ENVIO DE FOTOS, em dois níveis:
--        · `orgs.enviar_fotos_familia` — a chave geral;
--        · `familias.enviar_fotos`     — por família, e SOBREPÕE a geral;
--                                        nula = segue a geral.
--      Desligada, a lavagem acontece inteira e só a mensagem não é montada. As
--      fotos continuam gravadas no serviço e visíveis no painel — a Sureya
--      confere o trabalho de campo do mesmo jeito.
--
-- POR QUE UMA CHAVE NOVA, E NÃO A `disparos_ativos` QUE JÁ EXISTE
-- `orgs.disparos_ativos` e `clientes.envio_automatico` são os freios do envio
-- AUTOMÁTICO (`notificarFamilia`). São chave de emergência: desligam tudo, de
-- todo mundo. A chave desta migration é de política, não de emergência —
-- "esta família não quer receber foto" —, é por FAMÍLIA (que é o grão da
-- carteira desde a 0049, não o cliente) e vale também para a fila de liberação,
-- que é manual e não passa por aqueles freios.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1 · O CONJUNTO DE TEXTOS
-- ---------------------------------------------------------------------
create table if not exists modelos_mensagem (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  tipo       sureya_tipo_mensagem not null,
  -- `{nome}` = primeiro nome de quem recebe, com o tratamento já embutido no
  -- cadastro. `{jazigo}` = o código do jazigo, para família com mais de um.
  texto      text not null,
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table modelos_mensagem is
  'Os textos da casa, um conjunto por tipo. sureya_texto_modelo() sorteia entre os ativos para a mesma familia nao receber o mesmo paragrafo todo mes.';
comment on column modelos_mensagem.texto is
  'Aceita {nome} (primeiro nome de quem recebe) e {jazigo} (codigo do jazigo).';

create index if not exists idx_modelos_mensagem_uso
  on modelos_mensagem (org_id, tipo) where ativo;

alter table modelos_mensagem enable row level security;

-- Ler: qualquer pessoa da org — a rota de conclusão roda como a Nina.
drop policy if exists modelos_mensagem_org on modelos_mensagem;
create policy modelos_mensagem_org on modelos_mensagem
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Escrever: só admin. Uma policy POR COMANDO, e não `for all`: a lição da 0079
-- é que `with check` não é consultado no DELETE, então um guarda escrito só
-- como `with check` deixa a porta de apagar aberta.
drop policy if exists modelos_mensagem_so_admin_insere on modelos_mensagem;
create policy modelos_mensagem_so_admin_insere on modelos_mensagem
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists modelos_mensagem_so_admin_altera on modelos_mensagem;
create policy modelos_mensagem_so_admin_altera on modelos_mensagem
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null)
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists modelos_mensagem_so_admin_apaga on modelos_mensagem;
create policy modelos_mensagem_so_admin_apaga on modelos_mensagem
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- ---------------------------------------------------------------------
-- 2 · O PRIMEIRO NOME, COM O TRATAMENTO
--
-- Gemea de `primeiroNome` em src/lib/mensagens.ts, e a regra nao e "a primeira
-- palavra": para um publico idoso, "Sr. Joao Batista da Silva" tem de virar
-- "Sr. Joao", nao "Sr." e nao "Joao". O tratamento faz parte do nome.
--
-- As duas copias existem porque o texto pode nascer na aplicacao (fila montada
-- pelo TypeScript) ou no banco (texto de reserva). Se divergirem, a mesma
-- pessoa recebe mensagens tratada de dois jeitos. O teste
-- `testes/mensagens.sql` fixa os mesmos casos dos testes do TypeScript.
-- ---------------------------------------------------------------------
create or replace function public.sureya_primeiro_nome(p_completo text)
returns text
language sql
immutable
as $$
  select case
           when array_length(v.partes, 1) >= 2
                and lower(v.partes[1]) in ('sr.','sra.','dona','dr.','dra.','seu')
             then v.partes[1] || ' ' || v.partes[2]
           else coalesce(nullif(v.partes[1], ''), btrim(coalesce(p_completo,'')))
         end
    from (select regexp_split_to_array(btrim(coalesce(p_completo,'')), '\s+') as partes) v;
$$;

comment on function public.sureya_primeiro_nome(text) is
  'Primeiro nome preservando o tratamento: "Sr. Joao Batista" -> "Sr. Joao". Gemea de primeiroNome() em src/lib/mensagens.ts.';

-- ---------------------------------------------------------------------
-- 3 · O SORTEIO
-- ---------------------------------------------------------------------
create or replace function public.sureya_texto_modelo(
  p_org     uuid,
  p_tipo    sureya_tipo_mensagem,
  p_semente text default null,
  p_nome    text default null,
  p_jazigo  text default null
) returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_n     int;
  v_i     int;
  v_texto text;
begin
  select count(*) into v_n from modelos_mensagem
   where org_id = p_org and tipo = p_tipo and ativo;

  if v_n = 0 then
    -- Sem modelo cadastrado, ainda tem de sair uma frase inteira. Esta é a
    -- antiga, mantida só para nunca devolver nulo.
    return 'A limpeza foi feita. Segue a foto. 🌿';
  end if;

  -- O SORTEIO É PRESO À SEMENTE, não ao relógio.
  --
  -- `sureya_concluir_lavagem` é convergente: tocar de novo no mesmo serviço
  -- refaz o que estiver faltando. Se o texto fosse aleatório de verdade, uma
  -- reparação trocaria a mensagem que a Sureya já tinha lido na fila — e ela
  -- veria um texto na tela e outro sairia. Com a semente no id do serviço, o
  -- mesmo serviço devolve sempre o mesmo modelo.
  --
  -- `hashtext` pode devolver -2147483648, cujo `abs` estoura em int. Por isso
  -- a conta passa por bigint.
  v_i := mod(abs(hashtext(coalesce(p_semente, ''))::bigint), v_n::bigint)::int;

  select m.texto into v_texto
    from modelos_mensagem m
   where m.org_id = p_org and m.tipo = p_tipo and m.ativo
   order by m.ordem, m.created_at, m.id
   offset v_i limit 1;

  v_texto := replace(v_texto, '{nome}',   coalesce(nullif(sureya_primeiro_nome(p_nome), ''), 'tudo bem'));
  v_texto := replace(v_texto, '{jazigo}', coalesce(nullif(btrim(coalesce(p_jazigo,'')), ''), 'da família'));
  return v_texto;
end $$;

comment on function public.sureya_texto_modelo(uuid, sureya_tipo_mensagem, text, text, text) is
  'Sorteia um modelo ativo da org, preso a semente para o mesmo servico devolver sempre o mesmo texto. Devolve a frase antiga quando nao ha modelo.';

revoke execute on function public.sureya_texto_modelo(uuid, sureya_tipo_mensagem, text, text, text) from public;
grant  execute on function public.sureya_texto_modelo(uuid, sureya_tipo_mensagem, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4 · AS DUAS CHAVES
-- ---------------------------------------------------------------------
alter table orgs     add column if not exists enviar_fotos_familia boolean not null default true;
alter table familias add column if not exists enviar_fotos         boolean;

comment on column orgs.enviar_fotos_familia is
  'Chave geral: as fotos do servico viram mensagem para a familia. Desligada, a limpeza acontece inteira e nada e enfileirado.';
comment on column familias.enviar_fotos is
  'Sobrepoe a chave geral para esta familia. Nula = segue a geral.';

create or replace function public.sureya_envia_fotos(p_familia uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- A DA FAMÍLIA MANDA. `coalesce` para com o primeiro valor não nulo, então
  -- uma família com `false` continua desligada mesmo com a geral ligada, e uma
  -- com `true` continua ligada mesmo com a geral desligada. Nula = segue a casa.
  select coalesce(
           (select f.enviar_fotos from familias f where f.id = p_familia),
           (select o.enviar_fotos_familia from orgs o
             where o.id = coalesce((select f2.org_id from familias f2 where f2.id = p_familia),
                                   current_org_id())),
           true);
$$;

comment on function public.sureya_envia_fotos(uuid) is
  'A familia recebe as fotos deste servico? familias.enviar_fotos sobrepoe orgs.enviar_fotos_familia; nula segue a geral.';

revoke execute on function public.sureya_envia_fotos(uuid) from public;
grant  execute on function public.sureya_envia_fotos(uuid) to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------
-- 5 · OS TEXTOS DA CASA
--
-- Cinco variações do mesmo gesto, escritas no tom que `src/lib/mensagens.ts`
-- documenta: a foto vem como coisa espontânea — "aproveitei", "fiz questão" —,
-- nunca como comprovante de tarefa cumprida. O público é idoso e o que ele
-- valoriza é a atenção, não o relatório.
--
-- Cinco e não uma porque a família de plano mensal recebe doze por ano. Ler o
-- mesmo parágrafo doze vezes é o que faz cuidado virar formulário.
--
-- Só povoa org que ainda não tem modelo de foto: rodar de novo não duplica, e
-- não desfaz texto que a Sureya tenha editado depois.
-- ---------------------------------------------------------------------
do $seed$
declare
  o record;
begin
  for o in select id from orgs loop
    if exists (select 1 from modelos_mensagem where org_id = o.id and tipo = 'foto') then
      continue;
    end if;

    insert into modelos_mensagem (org_id, tipo, ordem, texto) values
    (o.id, 'foto', 1,
     'Ola, {nome}, tudo bem? Aproveitei nossa rotina de cuidados de hoje no cemiterio para fazer um registro de como o jazigo da familia esta limpo e bem cuidado, e fiz questao de compartilhar com o(a) senhor(a). Seguimos por aqui zelando por tudo com o carinho e o respeito de sempre. Um abraco meu e da Dona Nadir!'),
    (o.id, 'foto', 2,
     'Ola, {nome}, tudo bem? Passei hoje no jazigo da familia para os cuidados de sempre e tirei uma foto para o(a) senhor(a) ver como ficou. Esta tudo limpo e em ordem. Um abraco meu e da Dona Nadir!'),
    (o.id, 'foto', 3,
     'Bom dia, {nome}! Terminei agora os cuidados no jazigo da familia e nao quis deixar de mandar um registro para o(a) senhor(a). Continuamos zelando por tudo com o mesmo carinho de sempre. Um abraco!'),
    (o.id, 'foto', 4,
     'Ola, {nome}, como vai? Estive hoje no cemiterio cuidando do jazigo da familia e aproveitei para registrar. Da sempre um gosto bom ver tudo bem cuidado. Qualquer coisa que precisar, e so me chamar por aqui. Um abraco!'),
    (o.id, 'foto', 5,
     'Ola, {nome}! Passando so para mostrar como o jazigo da familia ficou depois dos cuidados de hoje. Seguimos com o mesmo respeito e a mesma atencao de sempre. Um abraco meu e da Dona Nadir!');
  end loop;
end $seed$;

-- ---------------------------------------------------------------------
-- 6 · A POLÍTICA MORA NA PORTA DA FILA, NÃO DENTRO DE UMA FUNÇÃO
--
-- A tentação era remendar `sureya_concluir_lavagem` — é lá que a frase de
-- reserva está escrita. Duas razões para não fazer isso:
--
--   · para trocar duas linhas dela eu teria de recopiar as 274 linhas inteiras
--     dentro desta migration, e o corpo copiado envelhece em silêncio: é
--     exatamente assim que nasce a deriva que este repositório já pagou caro;
--   · ela não é a única porta. `concluir-admin` e qualquer código futuro também
--     inserem em `fila_liberacao`, e cada um teria de lembrar da regra.
--
-- Um gatilho BEFORE INSERT na fila vale para TODOS os caminhos, de uma vez.
--
-- Retornar NULL num BEFORE INSERT cancela a linha sem erro — a lavagem termina
-- inteira, com débito, extrato, remuneração e material, e apenas a mensagem não
-- nasce. `v_fila` volta falso na função, que é a verdade: nada foi enfileirado.
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
                   -- A semente é o serviço: a função de conclusão é convergente,
                   -- e uma reparação não pode trocar o texto que a Sureya já leu.
                   coalesce(new.servico_id::text, new.tumulo_id::text, new.id::text),
                   v_nome, v_codigo);
  end if;

  return new;
end $$;

comment on function public.sureya_fila_politica_de_foto() is
  'BEFORE INSERT em fila_liberacao: aplica a chave de envio de fotos e troca o texto de reserva por um modelo da casa. Vale para todo caminho que enfileira.';

drop trigger if exists trg_fila_politica_de_foto on fila_liberacao;
create trigger trg_fila_politica_de_foto
  before insert on fila_liberacao
  for each row execute function public.sureya_fila_politica_de_foto();

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select tipo, count(*) filter (where ativo) as ativos from modelos_mensagem group by tipo;
--
-- select sureya_texto_modelo(o.id, 'foto', 'semente-qualquer', 'Sr. Andre Nagae', 'Q1-R5-658')
--   from orgs o;
--
-- select f.nome, f.enviar_fotos, o.enviar_fotos_familia, sureya_envia_fotos(f.id)
--   from familias f join orgs o on o.id = f.org_id limit 10;
