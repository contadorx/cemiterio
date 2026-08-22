/* Segunda correção do expurgo, e ela é melhor que a primeira tentativa.
 *
 * `plano` tem `check (plano in ('personal','time'))`, e eu tentei escrever
 * 'encerrado' nele. A prova pegou — mas o remédio certo não é alargar o check:
 * é NÃO mexer no plano.
 *
 * O que o expurgo tem que tirar é o que identifica uma PESSOA: o nome (que num
 * assinante Personal é o e-mail dele) e o documento. Plano, assentos e dias
 * descrevem o que foi VENDIDO — é exatamente o que a fatura guardada precisa
 * para continuar fazendo sentido daqui a dois anos, e não é dado pessoal.
 */
create or replace function walkstamp.expurgo(p_seco boolean default true)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  DIAS_CONTA   int := 90;
  MESES_LISTA  int := 24;
  MESES_EVENTO int := 18;
  alvos bigint[];
  r jsonb;
  n_roteiros int := 0; n_casos int := 0; n_usuarios int := 0; n_modelos int := 0;
  n_config int := 0; n_dominios int := 0; n_emissoes int := 0; n_recados int := 0;
  n_anexos int := 0; n_lista int := 0; n_eventos int := 0;
begin
  select coalesce(array_agg(id), '{}') into alvos
    from walkstamp.cliente
   where not ativo and encerrado_em is not null
     and encerrado_em < now() - make_interval(days => DIAS_CONTA)
     and expurgado_em is null;

  select count(*) into n_roteiros from walkstamp.roteiro r
    where r.cliente_id = any(alvos)
       or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_casos from walkstamp.roteiro_caso c
    join walkstamp.roteiro r on r.id = c.roteiro_id
   where r.cliente_id = any(alvos)
      or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_anexos from walkstamp.roteiro_caso c
    join walkstamp.roteiro r on r.id = c.roteiro_id
   where c.anexo_caminho is not null
     and (r.cliente_id = any(alvos)
       or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos)));
  select count(*) into n_usuarios from walkstamp.usuario where cliente_id = any(alvos);
  select count(*) into n_modelos  from walkstamp.modelo_doc where cliente_id = any(alvos);
  select count(*) into n_config   from walkstamp.config where cliente_id = any(alvos);
  select count(*) into n_dominios from walkstamp.dominio where cliente_id = any(alvos);
  select count(*) into n_emissoes from walkstamp.emissao where cliente_id = any(alvos);
  select count(*) into n_recados  from walkstamp.recado
   where lower(email) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_lista from walkstamp.interesse
   where criado_em < now() - make_interval(months => MESES_LISTA);
  select count(*) into n_eventos from walkstamp.evento
   where criado_em < now() - make_interval(months => MESES_EVENTO);

  r := jsonb_build_object(
    'seco', p_seco, 'contas', coalesce(array_length(alvos,1), 0),
    'roteiros', n_roteiros, 'casos', n_casos, 'anexos', n_anexos,
    'usuarios', n_usuarios, 'modelos', n_modelos, 'config', n_config,
    'dominios', n_dominios, 'emissoes', n_emissoes, 'chamados', n_recados,
    'lista_de_aviso', n_lista, 'marcos_de_uso', n_eventos,
    'faturas_mantidas', (select count(*) from walkstamp.fatura where cliente_id = any(alvos)));

  if p_seco then
    return r || jsonb_build_object('faxina', '[]'::jsonb);
  end if;

  if coalesce(array_length(alvos,1), 0) > 0 then
    insert into walkstamp.anexo_orfao (caminho)
    select c.anexo_caminho from walkstamp.roteiro_caso c
      join walkstamp.roteiro rr on rr.id = c.roteiro_id
     where c.anexo_caminho is not null
       and (rr.cliente_id = any(alvos)
         or lower(rr.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos)));

    delete from walkstamp.recado
     where lower(email) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
    delete from walkstamp.roteiro
     where cliente_id = any(alvos)
        or lower(dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
    delete from walkstamp.emissao   where cliente_id = any(alvos);
    delete from walkstamp.modelo_doc where cliente_id = any(alvos);
    delete from walkstamp.config     where cliente_id = any(alvos);
    delete from walkstamp.dominio    where cliente_id = any(alvos);
    delete from walkstamp.usuario    where cliente_id = any(alvos);

    /* Sai o que identifica pessoa. Fica o que descreve a venda — é o que a
       fatura guardada precisa para continuar fazendo sentido. */
    update walkstamp.cliente
       set nome = 'conta encerrada #' || id,
           documento = null,
           expurgado_em = now()
     where id = any(alvos);
  end if;

  delete from walkstamp.interesse where criado_em < now() - make_interval(months => MESES_LISTA);
  delete from walkstamp.evento    where criado_em < now() - make_interval(months => MESES_EVENTO);

  insert into walkstamp.expurgo_log (seco, relatorio) values (false, r);
  return r || jsonb_build_object('faxina', walkstamp.anexo_faxina_lista(100));
end $$;

revoke all on function public.walkstamp_expurgo(boolean) from public, anon, authenticated;
grant execute on function public.walkstamp_expurgo(boolean) to service_role;
