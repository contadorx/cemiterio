-- ============================================================================
-- A IMPRESSÃO DIGITAL DO ESQUEMA.
--
-- A MESMA consulta roda nos dois lados — no banco reconstruído a partir do Git
-- e na produção — e as duas saídas têm que ser iguais. É isto que transforma
-- "o repositório reconstrói o banco" de afirmação em medida.
--
-- O que ela NÃO olha, de propósito: OIDs, datas, e o conteúdo das tabelas. Um
-- teste de esquema que reclamasse de dado seria um teste que reprova toda vez
-- que alguém usa o produto.
-- ============================================================================
with objetos as (

  -- colunas
  select 'coluna' as cat,
         c.table_schema||'.'||c.table_name||'.'||c.column_name||' '||
         c.data_type||' null='||c.is_nullable||' def='||coalesce(c.column_default,'-') as linha
    from information_schema.columns c
   where c.table_schema = 'walkstamp'

  union all
  -- RLS por tabela
  select 'rls', n.nspname||'.'||c.relname||' rls='||c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'walkstamp' and c.relkind = 'r'

  union all
  -- restrições (check, pk, fk, unique)
  select 'restricao', n.nspname||'.'||rel.relname||' '||con.conname||' '||
         pg_get_constraintdef(con.oid)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'walkstamp'

  union all
  -- índices
  select 'indice', indexdef
    from pg_indexes where schemaname = 'walkstamp'

  union all
  -- sequências
  select 'sequencia', n.nspname||'.'||c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'walkstamp' and c.relkind = 'S'

  union all
  -- políticas de RLS
  select 'politica', schemaname||'.'||tablename||' '||policyname||' '||
         coalesce(qual,'-')||' / '||coalesce(with_check,'-')
    from pg_policies where schemaname = 'walkstamp'

  union all
  -- funções: assinatura, retorno, linguagem, security definer, search_path e
  -- o md5 do CORPO. O corpo entra por hash porque o que importa é ser o mesmo,
  -- e imprimi-lo inteiro faria a impressão digital do tamanho do esquema.
  select 'funcao',
         n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||
         ' -> '||pg_get_function_result(p.oid)||
         ' lang='||l.lanname||
         ' sdef='||p.prosecdef||
         ' cfg='||coalesce(array_to_string(p.proconfig,','),'-')||
         ' corpo='||md5(coalesce(p.prosrc,''))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'walkstamp'
      or (n.nspname = 'public' and p.proname like 'walkstamp\_%')

  union all
  /* QUEM PODE EXECUTAR O QUÊ. Esta é a categoria que mais importa das sete:
     metade do histórico é sobre uma função que ficou aberta ao navegador sem
     ninguém perceber. Uma diferença aqui é um buraco de segurança, e não uma
     divergência de esquema. */
  select 'permissao',
         n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||
         r.rolname||'='||has_function_privilege(r.rolname, p.oid, 'execute')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
   where (n.nspname = 'walkstamp'
       or (n.nspname = 'public' and p.proname like 'walkstamp\_%'))
     and exists (select 1 from pg_roles x where x.rolname = r.rolname)

  union all
  -- os baldes do Storage que as migrações criam
  select 'balde', b.id||' publico='||b.public||' teto='||coalesce(b.file_size_limit::text,'-')||
         ' tipos='||coalesce(array_to_string(b.allowed_mime_types,','),'-')
    from storage.buckets b where b.id in ('roteiro','blog')
)
select cat, count(*) as quantos, md5(string_agg(linha, E'\n' order by linha)) as impressao
  from objetos group by cat order by cat;
