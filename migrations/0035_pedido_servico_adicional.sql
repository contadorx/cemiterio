-- 0035 — O pedido que a familia faz na conversa vira AVISO de servico adicional
-- ---------------------------------------------------------------------------
-- O PEDIDO (Leandro, 02/08):
--   "tenho essa conversa, ela nao deveria se tornar algo para o servico ou um
--    aviso para avancar"
--   "o que eu queria era alertar que e um servico adicional para o cadastro"
--
-- O QUE ACONTECEU:
--   D. Cida escreveu pedindo para lavar o tumulo do pai ANTES DO DIA DOS PAIS e
--   disse que faz o Pix quando receber a foto. A IA respondeu prometendo a data.
--   E acabou ali. Nao nasceu servico, nao nasceu agenda, nao nasceu tarefa de
--   campo, nao nasceu preco. Tres promessas vivendo so como texto dentro de uma
--   conversa: lavar antes do dia, mandar a foto, mandar a chave Pix.
--
--   Ou seja: hoje uma conversa e um beco sem saida. Ela sabe escalar para humano
--   e sabe gerar rascunho — nunca soube gerar TRABALHO.
--
-- O QUE ESTA TABELA FAZ:
--   Guarda o PEDIDO detectado (pela IA ou marcado a mao no painel) como um aviso
--   pendente, com a frase exata da familia como prova e o prazo quando existir.
--   Nao e servico ainda: quem transforma em servico e uma PESSOA, porque preco e
--   capacidade de agenda sao decisao do dono, nao da IA.
--
--   fluxo:  conversa -> pedidos_conversa (status 'novo')
--                    -> alguem revisa no painel
--                    -> vira linha em servicos (plano_id null = avulso)
--                    -> status 'registrado' + servico_id preenchido
--
--   ou 'descartado', quando era so conversa.
-- ---------------------------------------------------------------------------

create table if not exists pedidos_conversa (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  cliente_id    uuid references clientes(id) on delete set null,   -- lead ainda pode nao ter familia
  conversa_id   uuid references conversas(id) on delete cascade,
  tumulo_id     uuid references tumulos(id) on delete set null,    -- so quando da para saber qual jazigo

  resumo        text not null,        -- "lavar o jazigo do pai antes do Dia dos Pais"
  trecho        text,                 -- a frase da familia, palavra por palavra (a prova)
  prazo         date,                 -- quando precisa estar pronto, se ela disse
  ocasiao       text,                 -- "Dia dos Pais", "aniversario de falecimento", "Finados"

  origem        text not null default 'ia',    -- ia | humano
  status        text not null default 'novo',  -- novo | registrado | descartado
  servico_id    uuid references servicos(id) on delete set null,   -- o servico que nasceu daqui

  registrado_em timestamptz,
  criado_em     timestamptz not null default now()
);

-- a fila do painel: o que esta esperando decisao
create index if not exists idx_pedidos_conversa_fila
  on pedidos_conversa(org_id, status, prazo);
create index if not exists idx_pedidos_conversa_conversa
  on pedidos_conversa(org_id, conversa_id);

-- UM aviso aberto por conversa.
-- Sem isto, cada mensagem nova da mesma familia ("e ai, ja lavou?") criaria mais
-- um aviso e o painel viraria ruido. O insert da IA usa on conflict do nothing.
create unique index if not exists uq_pedido_conversa_aberto
  on pedidos_conversa(org_id, conversa_id)
  where status = 'novo';

alter table pedidos_conversa enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'pedidos_conversa' and policyname = 'pedidos_conversa_org') then
    create policy pedidos_conversa_org on pedidos_conversa
      using (org_id = current_org_id()) with check (org_id = current_org_id());
  end if;
end $$;

comment on table pedidos_conversa is
  'Pedido de servico ADICIONAL (avulso) detectado numa conversa de WhatsApp. E um aviso, nao um servico: alguem precisa revisar, dar preco e registrar.';
comment on column pedidos_conversa.trecho is
  'A frase exata da familia. Serve de prova na hora de conferir o que foi combinado — e evita que a IA invente pedido.';
comment on column pedidos_conversa.prazo is
  'Data limite quando a familia deu uma (ex.: antes do Dia dos Pais). Null = sem data dita.';
comment on column pedidos_conversa.servico_id is
  'Preenchido quando o aviso virou servico de verdade. Ate la o pedido nao existe na agenda nem no caixa.';


-- ---------------------------------------------------------------------------
-- CONFERENCIA (so leitura)
-- ---------------------------------------------------------------------------
-- select criado_em, status, prazo, ocasiao, resumo from pedidos_conversa order by criado_em desc;
