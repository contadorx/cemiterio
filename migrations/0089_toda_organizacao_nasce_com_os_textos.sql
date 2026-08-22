-- =====================================================================
-- 0089 · TODA ORGANIZAÇÃO NASCE COM OS TEXTOS DA CASA
-- =====================================================================
--
-- COMO ISTO APARECEU
-- Escrevendo o teste da limpeza registrada pelo painel (0088), a conferência
-- "e com um texto da casa, não a frase de reserva" falhou. Não por causa do
-- caminho novo: por causa da organização nova.
--
-- O povoamento da 0085 é um `do $$ for o in select id from orgs $$` — ele
-- percorre as organizações que EXISTIAM no instante em que a migration rodou.
-- Uma organização criada depois nasce sem modelo nenhum, e aí
-- `sureya_texto_modelo` cai na frase antiga: "A limpeza foi feita. Segue a
-- foto." — o mesmo bilhete de sistema que a leva inteira da 0085 existiu para
-- tirar do caminho.
--
-- Em produção há uma organização só, então isto nunca ia morder aqui. Ia morder
-- na primeira restauração de backup em ambiente novo, na homologação, e no dia
-- em que existir uma segunda operação — e ia morder em silêncio, que é o pior
-- jeito: ninguém abre o cadastro de textos para conferir se ele está vazio.
--
-- POR QUE GATILHO E NÃO OUTRO BLOCO DE POVOAMENTO
-- Outro bloco resolveria hoje e quebraria de novo na próxima organização. O
-- gatilho responde à pergunta certa — "esta organização já tem textos?" — no
-- momento certo, que é o nascimento dela.
-- =====================================================================

-- A LISTA MORA NUMA FUNÇÃO SÓ.
--
-- O gatilho é uma casca em volta dela, e o povoamento das organizações que já
-- existem chama a mesma. Duas cópias da lista neste repositório seria o começo
-- de duas listas diferentes.
create or replace function public.sureya_semear_textos(p_org uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Guarda de convergência: rodar de novo sobre uma org que já tem textos não
  -- duplica, e não desfaz texto que a Sureya tenha editado depois.
  if exists (select 1 from modelos_mensagem where org_id = p_org and tipo = 'foto') then
    return 0;
  end if;

  -- Cinco variações do mesmo gesto, no tom que src/lib/mensagens.ts documenta:
  -- a foto vem como coisa espontânea, nunca como comprovante de tarefa. Cinco
  -- e não uma porque a família de plano mensal recebe doze por ano.
  insert into modelos_mensagem (org_id, tipo, ordem, texto) values
  (p_org, 'foto', 1,
   'Olá, {nome}, tudo bem? Aproveitei nossa rotina de cuidados de hoje no cemitério para fazer um registro de como o jazigo da família está limpo e bem cuidado, e fiz questão de compartilhar com o(a) senhor(a). Seguimos por aqui zelando por tudo com o carinho e o respeito de sempre. Um abraço meu e da Dona Nadir!'),
  (p_org, 'foto', 2,
   'Olá, {nome}, tudo bem? Passei hoje no jazigo da família para os cuidados de sempre e tirei uma foto para o(a) senhor(a) ver como ficou. Está tudo limpo e em ordem. Um abraço meu e da Dona Nadir!'),
  (p_org, 'foto', 3,
   'Bom dia, {nome}! Terminei agora os cuidados no jazigo da família e não quis deixar de mandar um registro para o(a) senhor(a). Continuamos zelando por tudo com o mesmo carinho de sempre. Um abraço!'),
  (p_org, 'foto', 4,
   'Olá, {nome}, como vai? Estive hoje no cemitério cuidando do jazigo da família e aproveitei para registrar. Dá sempre um gosto bom ver tudo bem cuidado. Qualquer coisa que precisar, é só me chamar por aqui. Um abraço!'),
  (p_org, 'foto', 5,
   'Olá, {nome}! Passando só para mostrar como o jazigo da família ficou depois dos cuidados de hoje. Seguimos com o mesmo respeito e a mesma atenção de sempre. Um abraço meu e da Dona Nadir!');

  return 5;
end $$;

comment on function public.sureya_semear_textos(uuid) is
  'Povoa os textos da casa de uma organizacao. Convergente: nao duplica e nao desfaz texto editado. E a UNICA copia da lista neste repositorio.';

revoke execute on function public.sureya_semear_textos(uuid) from public, anon;
grant  execute on function public.sureya_semear_textos(uuid) to authenticated, service_role;

create or replace function public.sureya_textos_iniciais()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform sureya_semear_textos(new.id);
  return new;
end $$;

comment on function public.sureya_textos_iniciais() is
  'Casca do gatilho: povoa os textos da casa quando uma organizacao nasce. Sem isto ela cai na frase de reserva, que e o bilhete de sistema que a 0085 tirou do caminho.';

drop trigger if exists trg_textos_iniciais on orgs;
create trigger trg_textos_iniciais
  after insert on orgs
  for each row execute function public.sureya_textos_iniciais();

-- E as que já existem e ficaram sem — inclusive qualquer uma criada entre a
-- 0085 e esta migration. Mesma função, mesma lista.
do $$
declare o record;
begin
  for o in select id from orgs loop
    perform sureya_semear_textos(o.id);
  end loop;
end $$;

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select o.nome, count(m.id) filter (where m.tipo='foto') as textos
--   from orgs o left join modelos_mensagem m on m.org_id = o.id
--  group by o.nome;
