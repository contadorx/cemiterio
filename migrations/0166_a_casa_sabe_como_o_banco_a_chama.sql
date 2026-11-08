-- ===========================================================================
-- 0166 — A CASA SABE COMO O BANCO A CHAMA
--
-- MEDIDO em 08/11/2026, passando OCR numa FOTO de tela de celular — que e o
-- que chega de quem nao sabe tirar print:
--
--   valor ........ R$ 40,00                   certo
--   data ......... 07/11/2026                 certo
--   os dois nomes .                           certos
--   os ROTULOS ... "PAGADOR" / "RECEBEDOR"    SUMIRAM
--   o E2E ........ virou "io DA TRANSA"
--
-- Os rotulos sao escritos em cinza pequeno, e e justamente isso que nao
-- sobrevive ao brilho, ao moire e a compressao do WhatsApp. Sem eles,
-- "Katia Ferreira dos Santos" e "Sureya Servicos de Limpeza" sao dois nomes e
-- nada mais — e pegar o primeiro poria o nome DA CASA em cima de metade dos
-- pagamentos, fazendo a triangulacao casar tudo com tudo.
--
-- MAS A CASA A GENTE CONHECE: ela RECEBE todo comprovante que chega aqui.
-- Tirando o nome dela dos candidatos, se sobrar exatamente um, foi ele quem
-- pagou. Para isso o sistema precisa saber COMO O BANCO ESCREVE o nome dela —
-- que nao e a marca ("Zelo & Memoria") nem o nome da organizacao: e o nome do
-- titular da conta que recebe o Pix.
--
-- POR QUE UMA COLUNA, E NAO DEDUZIR: dava para procurar o nome que se repete
-- em todos os comprovantes e chamar aquilo de "a casa". So que isso aprende
-- devagar, erra no comeco (quando ha poucos comprovantes) e erra exatamente
-- onde dói — confundindo o recebedor com um pagador frequente. Um campo que
-- se preenche uma vez vale mais que uma deducao que erra calada.
--
-- FICA NULA, e o codigo cai para `marca_nome` e depois `nome`. Nula, a
-- deducao simplesmente nao acontece: o nome do pagador volta nulo quando o
-- papel nao tem rotulo, que e o comportamento seguro.
--
-- NENHUM DADO FOI TOCADO: a coluna nasce vazia e ninguem a preenche daqui.
-- ===========================================================================

alter table orgs add column if not exists nome_no_recebimento text;

comment on column orgs.nome_no_recebimento is
  'Como o BANCO escreve o nome de quem recebe o Pix — o titular da conta, nao '
  'a marca. Usado para descartar o recebedor ao ler um comprovante por OCR e '
  'deduzir quem pagou quando o papel perdeu os rotulos (0166).';



-- ===========================================================================
-- E SETE COLUNAS DE `orgs` QUE SO EXISTIAM DENTRO DO BANCO
--
-- Achado ao escrever esta migration: o `select` de prova no fim dela citava
-- `marca_nome`, e o harness reprovou — "column marca_nome does not exist".
-- Em producao ela existe e CINCO arquivos de `src/` a usam. Em migration
-- nenhuma.
--
-- E a pergunta central do Build 0 de novo: "o repositorio reconstroi o banco?"
-- Ela ja foi respondida com "nao" tres vezes, e uma delas foi exatamente isto
-- — "32 colunas e 15 funcoes `sureya_*` so existiam dentro do banco".
--
-- POR QUE VOLTOU SEM NINGUEM VER: o placar do harness conta TABELAS, FUNCOES,
-- GATILHOS e POLICIES. Nunca contou coluna. Um `alter table ... add column`
-- feito a mao no painel do Supabase passa por baixo dele inteiro, e so aparece
-- no dia em que alguem reconstroi o banco do zero e uma tela quebra.
--
-- Os tipos e os padroes abaixo sao os de producao, lidos de
-- `information_schema` em 08/11/2026 — nao inventados. `if not exists` faz
-- disto um no-op la, e o conserto aqui.
--
-- Um guarda novo (`checar-ficha.mjs`) passa a cobrar que toda coluna de `orgs`
-- citada em `src/` nasca de alguma migration.
-- ===========================================================================

alter table orgs add column if not exists marca_nome       text;
alter table orgs add column if not exists marca_assinatura text;
alter table orgs add column if not exists chave_pix        text;
alter table orgs add column if not exists site             text;

alter table orgs add column if not exists custo_ia_por_chamada numeric not null default 0.05;

alter table orgs add column if not exists assuntos_sempre_manual text[] not null
  default '{luto,reclamacao,cancelamento}'::text[];

alter table orgs add column if not exists palavras_criticas text[] not null default array[
  'faleceu','morreu','morte','enterro','velório','velorio','sepultamento',
  'câncer','cancer','hospital','uti','internado','doente',
  'processo','advogado','justiça','justica','procon','denúncia','denuncia',
  'cancelar','cancelamento','encerrar','parar','desistir',
  'roubo','roubaram','furto','quebrado','quebraram','vandalismo','depredado',
  'reclamação','reclamacao','absurdo','péssimo','pessimo','horrível','horrivel',
  'desconto','processar','devolver o dinheiro','reembolso'
]::text[];

comment on column orgs.marca_nome is
  'Nome da marca nas telas e nos recibos. Existia so em producao ate a 0166.';

-- prova: as oito colunas respondem
select nome_no_recebimento, marca_nome, marca_assinatura, chave_pix, site,
       custo_ia_por_chamada,
       array_length(assuntos_sempre_manual, 1) as n_assuntos,
       array_length(palavras_criticas, 1)      as n_palavras
  from orgs;
