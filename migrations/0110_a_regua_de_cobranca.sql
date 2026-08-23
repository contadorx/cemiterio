-- 0110 — A RÉGUA DE COBRANÇA
--
-- O PEDIDO
--   "Me construi a regua, mas lembro que o disparo é manual pela fila do
--    conversas, me monta ela personalizavel e vou ajustando"
--
-- O QUE JÁ HAVIA, E POR QUE NÃO SERVIA
--   `clientes.regua_cobranca` com três nomes fixos — suave, padrão, firme — e
--   `cobranca_nivel`, `max_lembretes`, `dias_entre_cobrancas`. Os DEGRAUS
--   estavam dentro do TypeScript: quantos dias, que texto, em que ordem.
--   Personalizar exigia mexer em código, que é o oposto de "vou ajustando".
--
--   E ela só sabia perseguir quem JÁ deve. A cobrança do serviço PRÉVIO — o
--   aviso antes do vencimento — não existia em lugar nenhum.
--
-- O DESENHO
--   Uma régua é uma lista de DEGRAUS, e cada degrau é uma linha da tabela:
--
--     quando          antes ou depois do vencimento
--     dias            quantos, contados dele
--     texto           o que se diz naquele degrau
--     ativo           liga e desliga sem apagar o que foi escrito
--
--   `dias` NEGATIVO é antes do vencimento (o aviso prévio), POSITIVO é depois
--   (a cobrança de quem atrasou). Um eixo só, com o zero no vencimento — dois
--   campos separados ("tipo" + "dias") deixariam criar "aviso prévio, 5 dias
--   depois", que não quer dizer nada.
--
-- ⚠ NADA DISPARA SOZINHO
--   A régua NÃO envia. Ela decide o que ENTRA NA FILA de liberação, que é a
--   porta única desde a 0094 — e a fila só sai por comando de quem lê. Isto
--   não é uma configuração que se possa afrouxar: é a regra da casa, e mais
--   ainda agora que os disparos automáticos estão desligados até o app se
--   provar na operação.

begin;

create table if not exists regua_degraus (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  -- Qual régua: os nomes que `clientes.regua_cobranca` já usa. Assim a escolha
  -- por família continua valendo, e o que muda é o CONTEÚDO de cada uma.
  regua         sureya_regua_cobranca not null default 'padrao',
  -- Dias em relação ao VENCIMENTO. Negativo = antes, positivo = depois.
  dias          smallint not null,
  texto         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Um degrau por dia por régua: dois textos para "3 dias depois" fariam a
  -- família receber duas cobranças na mesma manhã.
  constraint regua_degraus_unico unique (org_id, regua, dias),
  -- Um ano para cada lado é folga de sobra. O limite existe para pegar o
  -- engano de digitação, que num campo de dias é fácil e caro.
  constraint regua_degraus_faixa check (dias between -365 and 365),
  constraint regua_degraus_texto check (length(btrim(texto)) >= 10)
);

create index if not exists idx_regua_degraus_org on regua_degraus (org_id, regua, dias);

alter table regua_degraus enable row level security;

-- A da organização, e uma RESTRITIVA POR COMANDO — a lição da 0079: `using`
-- governa select/update/delete e `with check` governa insert/update, e DELETE
-- nunca consulta `with check`. Por isso cada comando tem a sua.
drop policy if exists regua_degraus_org on regua_degraus;
create policy regua_degraus_org on regua_degraus
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists regua_degraus_insert_admin on regua_degraus;
create policy regua_degraus_insert_admin on regua_degraus
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists regua_degraus_update_admin on regua_degraus;
create policy regua_degraus_update_admin on regua_degraus
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists regua_degraus_delete_admin on regua_degraus;
create policy regua_degraus_delete_admin on regua_degraus
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- ---------------------------------------------------------------------------
-- OS DEGRAUS DE PARTIDA
-- ---------------------------------------------------------------------------
-- Um ponto de partida para AJUSTAR, não um padrão a defender. Os textos são
-- deliberadamente sóbrios: quem cobra uma família num cemitério não pode soar
-- como cobrança de loja.
--
-- Convergente: rodar de novo não duplica nem sobrescreve o que a casa editou.
insert into regua_degraus (org_id, regua, dias, texto)
select o.id, 'padrao'::sureya_regua_cobranca, d.dias, d.texto
  from orgs o,
  (values
    (-5, 'Olá, {nome}. Passando para avisar que a mensalidade do cuidado com o jazigo vence em 5 dias. Qualquer dúvida é só me chamar. 🌿'),
    (-1, 'Olá, {nome}. A mensalidade vence amanhã. Se precisar de outra data ou de outra forma de pagamento, me avisa que a gente ajeita.'),
    ( 3, 'Olá, {nome}. A mensalidade do jazigo venceu há alguns dias e ainda não identifiquei o pagamento. Pode ter sido só um esquecimento — me avisa se precisar do Pix de novo. 🌿'),
    ( 10, 'Olá, {nome}. Continuo sem identificar o pagamento da mensalidade. Se ficou difícil neste mês, me diga: prefiro combinar com você a deixar a conta crescer.'),
    ( 20, 'Olá, {nome}. A mensalidade segue em aberto. Os cuidados com o jazigo continuam, e eu gostaria de resolver isso junto com você — me chama para combinarmos.'),
    ( 30, 'Olá, {nome}. Sobre a mensalidade em aberto: me avise como prefere seguir. Se não for possível continuar agora, tudo bem — é só me dizer para eu suspender as visitas sem constrangimento.')
  ) as d(dias, texto)
on conflict (org_id, regua, dias) do nothing;

commit;
