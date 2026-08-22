/* O tempo real de resposta entra na conta junto com o resto.
   Uma chamada a mais só para isso seria uma viagem inteira até sa-east-1 para
   buscar dois números. */
create or replace function walkstamp.conta_do_usuario(p_email text)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e  text := lower(btrim(coalesce(p_email,'')));
  pl record;
  u  walkstamp.usuario%rowtype;
  c  walkstamp.cliente%rowtype;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select * into pl from walkstamp.plano_de(e);
  select * into u  from walkstamp.usuario where email = e;
  if u.cliente_id is not null then
    select * into c from walkstamp.cliente where id = u.cliente_id;
  end if;
  return jsonb_build_object(
    'email',    e,
    'plano',    pl.plano, 'assentos', pl.assentos, 'dias', pl.dias,
    'cliente',  pl.cliente, 'motivo', pl.motivo,
    'papel',    coalesce(u.papel, 'membro'),
    'vence_em', u.vence_em,
    'emissoes', coalesce(u.emissoes, 0),
    'assinante', c.stripe_id is not null,
    'perfil',   walkstamp.perfil_do_usuario(e),
    'faturas',  walkstamp.minhas_faturas(e),
    'chamados', walkstamp.meus_chamados(e),
    'resposta', walkstamp.chamado_resposta(),
    /* O painel do time só existe para quem administra. Pedi-lo para um membro
       comum devolveria erro, então nem se pergunta. */
    'time',     case when coalesce(u.papel,'') = 'admin'
                     then walkstamp.time_painel(e) else null end);
end $$;
