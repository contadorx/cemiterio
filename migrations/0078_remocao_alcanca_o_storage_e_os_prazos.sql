-- ============================================================================
-- SUREYA — 0078 · A REMOÇÃO ALCANÇA O ARQUIVO, E OS PRAZOS VIRAM CÓDIGO
--
-- Decisão da responsável (22/08/2026): "vamos com os seus prazos e com a
-- remoção no storage". Isto implementa as duas.
--
-- POR QUE O SQL NÃO APAGA O ARQUIVO SOZINHO
-- ---------------------------------------------------------------------------
-- `storage.objects` é uma tabela, e dá para apagar linha dela — mas isso remove
-- só o REGISTRO. O arquivo continua no bucket, e continua abrindo pela URL
-- pública (D-03). Apagar a linha e achar que removeu é pior que não remover:
-- fica um comprovante de "removido" sobre um arquivo que ainda está lá.
--
-- Quem apaga de verdade é a API de Storage, e ela mora no lado do aplicativo.
-- Por isso a divisão:
--
--     SQL  →  diz QUAIS arquivos são daquela pessoa
--     TS   →  apaga, e só então chama a anonimização
--
-- A ordem importa: se o Storage falhar, a pessoa NÃO é marcada como anonimizada.
-- Melhor devolver "não consegui remover as fotos, tente de novo" do que
-- registrar uma remoção que não aconteceu inteira.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Quais arquivos são desta pessoa
--
-- Sete lugares guardam URL de arquivo ligado a uma pessoa. Levantei um por um
-- no esquema — não é uma lista que dê para adivinhar.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_arquivos_do_cliente(p_cliente uuid)
returns table(url text, origem text)
language sql
security definer
set search_path to 'public'
as $function$
  with meu as (
    select c.id, c.familia_id from clientes c
     where c.id = p_cliente and c.org_id = current_org_id()
  )
  select c.foto_url, 'foto da pessoa' from clientes c, meu
   where c.id = meu.id and c.foto_url is not null

  union
  -- Fotos de serviço nos jazigos DA FAMÍLIA. O jazigo é da família, não da
  -- pessoa — remover só o que está no nome dela deixaria a maior parte para
  -- trás.
  select s.foto_antes_url, 'antes da limpeza' from servicos s
   join tumulos t on t.id = s.tumulo_id, meu
   where t.familia_id = meu.familia_id and s.foto_antes_url is not null
  union
  select s.foto_depois_url, 'depois da limpeza' from servicos s
   join tumulos t on t.id = s.tumulo_id, meu
   where t.familia_id = meu.familia_id and s.foto_depois_url is not null
  union
  select s.foto_inicio_url, 'inicio da limpeza' from servicos s
   join tumulos t on t.id = s.tumulo_id, meu
   where t.familia_id = meu.familia_id and s.foto_inicio_url is not null

  union
  select t.foto_referencia_url, 'referencia do jazigo' from tumulos t, meu
   where t.familia_id = meu.familia_id and t.foto_referencia_url is not null
  union
  select t.foto_enquadramento_url, 'enquadramento do jazigo' from tumulos t, meu
   where t.familia_id = meu.familia_id and t.foto_enquadramento_url is not null

  union
  -- Comprovante de Pix: documento de banco, com nome e valor.
  select cp.imagem_url, 'comprovante de pagamento' from comprovantes cp, meu
   where cp.cliente_id = meu.id and cp.imagem_url is not null

  union
  select m.midia_url, 'midia de conversa' from mensagens m, meu
   where m.cliente_id = meu.id and m.midia_url is not null;
$function$;

comment on function public.sureya_arquivos_do_cliente is
  'Todos os arquivos de Storage ligados a uma pessoa e aos jazigos da familia '
  'dela. O SQL so LISTA — quem apaga de verdade e a API de Storage, do lado do '
  'aplicativo, porque apagar a linha de storage.objects nao remove o arquivo.';


-- ----------------------------------------------------------------------------
-- 2) A anonimização passa a alcançar o que faltava
--
-- A versão anterior deixava para trás quatro coisas que a política levantou
-- (POLITICA_DADOS.md §5). Três entram aqui; `tumulos.falecido_nome` fica de
-- fora **por decisão**: apagar o nome do falecido inutiliza o cadastro do
-- jazigo, que é o objeto do contrato — e o titular do pedido é a família viva,
-- não o registro do jazigo.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_anonimizar_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sem_org'; end if;
  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente_nao_encontrado';
  end if;

  update clientes set
    nome = 'Cliente removido',
    telefone = 'anon:' || left(md5(random()::text), 12),
    perfil_ia = null,
    instrucoes_ia = null,
    observacoes = null,
    foto_url = null,
    ativo_ia = false,
    modo = 'copiloto',
    anonimizado_em = now()
  where id = p_cliente;

  update conversas set aberta = false where cliente_id = p_cliente and org_id = v_org;
  update mensagens set texto = '[removido a pedido]', midia_url = null
    where cliente_id = p_cliente and org_id = v_org;
  update leads set nome_wa = null, mensagens = '[]'::jsonb, status = 'descartado'
    where org_id = v_org and telefone in (select telefone from clientes where id = p_cliente);

  -- O SEGUNDO TELEFONE.
  -- A versao anterior embaralhava `clientes.telefone` e deixava este intacto —
  -- o numero da pessoa continuava no banco, em outra tabela. Era o item mais
  -- barato e mais grave da lista da politica.
  delete from telefones_cliente where cliente_id = p_cliente;

  -- Os rascunhos e as mensagens enviadas carregam o nome dentro do texto.
  update fila_liberacao
     set texto = '[removido a pedido]', texto_final = null, fotos = '[]'::jsonb
   where cliente_id = p_cliente and org_id = v_org;

  -- A INDICACAO TEM DUAS PESSOAS, E SO UMA PEDIU PARA SAIR.
  --
  -- `indicado_nome` e `indicado_tel` sao de um TERCEIRO — quem foi indicado. O
  -- pedido de remocao de quem indicou nao alcanca o dado de outra pessoa, e
  -- apagar seria remover o dado de alguem que nao pediu nada.
  --
  -- O que sai e o VINCULO: `indicador_id` deixa de apontar para quem foi
  -- removido. A indicacao continua existindo, sem dizer de quem veio.
  update indicacoes set indicador_id = null
   where org_id = v_org and indicador_id = p_cliente;

  -- As URLs de arquivo saem do banco. Os ARQUIVOS sao apagados pelo aplicativo
  -- antes desta funcao ser chamada — ver `sureya_arquivos_do_cliente` e
  -- `api/clientes/[id]/lgpd`.
  update comprovantes set imagem_url = null where cliente_id = p_cliente and org_id = v_org;
  update servicos s set foto_antes_url = null, foto_depois_url = null, foto_inicio_url = null
    from tumulos t
   where t.id = s.tumulo_id and s.org_id = v_org
     and t.familia_id = (select familia_id from clientes where id = p_cliente);
end
$function$;


-- ----------------------------------------------------------------------------
-- 3) OS PRAZOS
--
-- Prazos aprovados pela responsável em 22/08/2026, de POLITICA_DADOS.md §4:
--
--     lançamentos financeiros    5 anos
--     fotos de serviço           contrato encerrado + 1 ano
--     comprovantes de Pix        5 anos
--     conversas de WhatsApp      2 anos
--     leads não convertidos      6 meses
--
-- DUAS DECISÕES DE DESENHO
--
-- (a) A prévia vem antes, sempre, e é uma função separada. Apagar dado de
--     família por rotina, sem alguém ver o número primeiro, é como o histórico
--     some sem ninguém notar.
--
-- (b) NÃO existe cron chamando isto. É um botão. O sistema tem cinco rotinas
--     automáticas e nenhuma apaga nada — e essa propriedade vale mais que a
--     conveniência de não precisar apertar um botão por ano.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_expurgo_previa(p_hoje date default null)
returns table(categoria text, prazo text, quantidade bigint, mais_antigo date)
language sql
security definer
set search_path to 'public'
as $function$
  with h as (select coalesce(p_hoje, current_date) as hoje)
  select 'conversas'::text, '2 anos'::text, count(*)::bigint, min(m.created_at::date)
    from mensagens m, h
   where m.org_id = current_org_id() and m.created_at < h.hoje - interval '2 years'

  union all
  select 'leads nao convertidos', '6 meses', count(*)::bigint, min(l.created_at::date)
    from leads l, h
   where l.org_id = current_org_id()
     and l.created_at < h.hoje - interval '6 months'
     and coalesce(l.status::text,'') <> 'convertido'

  union all
  -- Lancamento so sai depois de 5 anos E com a familia quitada. Apagar divida
  -- em aberto por prazo seria perdoar sozinho.
  select 'lancamentos financeiros', '5 anos, so se a familia estiver quitada',
         count(*)::bigint, min(l.data)
    from conta_corrente l, h
   where l.org_id = current_org_id()
     and l.data < h.hoje - interval '5 years'
     and (select coalesce(sum(case when x.tipo::text='credito' then x.valor else -x.valor end),0)
            from conta_corrente x where x.familia_id = l.familia_id
              and x.status_conc = 'confirmado') >= -0.005

  union all
  select 'comprovantes de pagamento', '5 anos', count(*)::bigint, min(c.created_at::date)
    from comprovantes c, h
   where c.org_id = current_org_id() and c.created_at < h.hoje - interval '5 years'

  union all
  -- Foto de servico: contrato encerrado ha mais de um ano. Contrato ativo nunca
  -- perde foto, por mais velha que seja — ela e a prova do servico.
  select 'fotos de servico', 'contrato encerrado + 1 ano', count(*)::bigint, min(s.data_executada::date)
    from servicos s
    join tumulos t on t.id = s.tumulo_id
    join familias f on f.id = t.familia_id, h
   where s.org_id = current_org_id()
     and coalesce(f.contratado, false) = false
     and s.data_executada < h.hoje - interval '1 year'
     and (s.foto_antes_url is not null or s.foto_depois_url is not null);
$function$;

comment on function public.sureya_expurgo_previa is
  'O que os prazos de retencao (POLITICA_DADOS.md §4) alcancariam hoje. So '
  'conta — nao apaga. A previa vem antes, sempre.';

revoke execute on function public.sureya_arquivos_do_cliente(uuid) from public, anon;
revoke execute on function public.sureya_expurgo_previa(date) from public, anon;

commit;


-- ============================================================================
-- O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** FAZ
--
-- Não cria `sureya_expurgar`. A prévia existe, o número aparece, e o expurgo de
-- verdade só deve ser escrito depois de a responsável olhar esse número uma
-- vez, num ambiente real, e concordar com ele.
--
-- Hoje a prévia devolve zero em todas as categorias — o sistema tem meses de
-- vida, não anos. Escrever agora a função que apaga seria escrever, sem
-- possibilidade de teste, o único código do sistema que destrói dado de
-- família. Ela entra quando houver o que apagar.
-- ============================================================================
