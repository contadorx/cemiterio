-- ============================================================================
-- 0139 — OS BALDES QUE NAO ABREM SOZINHOS
-- ============================================================================
--
-- O QUE SE MEDIU EM 27/08
--
--   servicos      817 arquivos   public = true
--   comprovantes    3 arquivos   public = true
--   conversas       1 arquivo    public = true
--
-- Balde publico no Supabase abre para QUALQUER UM que tenha o endereco, sem
-- senha, para sempre. Os caminhos levam identificadores aleatorios, entao
-- ninguem acha por tentativa — mas link que vaza (encaminhado, no historico do
-- navegador, na previa de um aplicativo) continua valendo depois disso.
--
-- ISTO APARECEU ESCREVENDO O AVISO DE PRIVACIDADE DA 0138. A frase honesta,
-- com os baldes abertos, era "as fotos ficam num endereco que abre para quem
-- tiver o link". Para a foto do jazigo isso e ate o que FAZ a foto chegar. Para
-- os outros dois nao:
--
--   comprovantes  extrato de banco, com nome, valor e as vezes numero de conta
--   conversas     o que a familia mandou no privado
--
-- E MEDIDO ANTES DE FECHAR: nenhum dos dois nunca saiu daqui. Zero mensagens
-- de saida com midia, zero linhas na fila de liberacao apontando para eles.
-- Fechar nao quebra nada que ja esteja no mundo — so tranca o que so devia ser
-- visto por quem entrou.
--
-- O QUE ESTA MIGRATION **NAO** FAZ: fechar `servicos`.
--
-- Sao 817 arquivos lidos por URL direta em quatro lugares — a pagina da familia
-- por token, o site publico, o painel e o proprio envio pelo WhatsApp (o
-- Evolution BAIXA a URL para entregar a imagem). Fecha-lo exige assinar em
-- todos eles, inclusive numa pagina que nao tem sessao. E um build proprio, com
-- o seu proprio ensaio. Fazer junto aqui seria trocar um risco conhecido por um
-- apagao de fotos.
--
-- O endereco guardado no banco NAO muda. `getPublicUrl` so monta uma string —
-- ela nao concede nada. Num balde fechado esse endereco devolve 400, e quem o
-- transforma em algo que abre e `assinar()` (src/lib/storage.ts), a porta unica.
-- Por isso deu para fechar dois baldes sem migrar uma linha: `caminhoDaUrl` ja
-- sabia ler esse formato, e a exclusao da 0135 continua funcionando intacta.
-- ============================================================================

update storage.buckets
   set public = false
 where id in ('comprovantes', 'conversas');

-- ----------------------------------------------------------------------------
-- QUEM PODE LER O QUE ESTA DENTRO
--
-- Link assinado e gerado com a chave de servico, que ignora RLS — as quatro
-- rotas que assinam ja passaram por `exigirAdmin` e ja filtraram a linha por
-- `org_id`, entao a autorizacao acontece antes, na aplicacao.
--
-- O que NAO pode existir e uma policy de leitura solta em `storage.objects`
-- para `anon`: ela devolveria pela porta dos fundos exatamente o que este
-- arquivo acabou de trancar. Abaixo elas sao derrubadas se existirem — e o
-- teste cobra que nenhuma volte.
-- ----------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('comprovantes_publico', 'conversas_publico',
                          'leitura_publica_comprovantes', 'leitura_publica_conversas')
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
