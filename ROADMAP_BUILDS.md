# Priorização dos temas para os builds

**Data:** 21/08/2026
**Objetivo:** transformar os achados das auditorias em uma sequência executável de entregas,
com dependências, limites de escopo e critérios objetivos para avançar ao go-live.

## 1. Regra de priorização

Os builds não devem seguir a ordem das telas nem começar pelo que é mais visível. A ordem
correta é:

> **proteger os dados → garantir que a lavagem não se perca → simplificar o campo → provar
> o dinheiro → simplificar a administração → ligar comunicações → pilotar e expandir.**

Foram usados cinco critérios, nesta ordem:

1. **Dano potencial:** acesso indevido, cobrança errada ou lavagem perdida vêm primeiro.
2. **Dependência:** UX não consegue representar um estado confiável se o backend ainda não
   diferencia guardado, confirmado, falho e reconciliado.
3. **Frequência:** começar/concluir lavagem e registrar recebimento valem mais que uma
   configuração usada uma vez por ano.
4. **Reversibilidade:** mudanças de aparência são reversíveis; migrations, saldo e envio
   para famílias exigem muito mais cautela.
5. **Evidência:** cada build termina com uma prova; “código pronto” não é critério de saída.

## 2. Visão resumida

| Ordem | Tema | Resultado necessário | Gate |
|---:|---|---|---|
| Build 0 | Base verificável | CI, schema real, backup e ambiente de ensaio | Nenhuma mudança crítica sem baseline |
| Build 1 | Acesso e proteção de dados | Admin/campo realmente separados no banco | Teste direto de RLS e revogação |
| Build 2 | Lavagem confiável ponta a ponta | Conclusão atômica, idempotente e reconciliável | Zero lavagem perdida/duplicada |
| Build 3 | Campo simples e offline honesto | Uma decisão por vez e estados locais claros | Contraprovas no celular passam |
| Build 4 | Verdade financeira | Competência, saldo e conciliação fecham em centavos | Ciclo financeiro de ensaio fecha |
| Build 5 | Administração orientada à ação | Home agrega pendências e telas escondem complexidade | Administradora resolve tarefas sem ajuda |
| Build 6 | Comunicação, privacidade e operação | Fila segura, storage privado, alertas e runbooks | Falhas são detectadas e reprocessadas |
| Build 7 | Piloto e go-live gradual | Operação pequena comprovada antes da expansão | Critérios de go/no-go atendidos |

Os builds são **gates**, não apenas versões. Se o critério de saída falhar, o próximo tema não
começa. É aceitável preparar protótipos em paralelo, mas não ativar funcionalidades que
dependem de uma fundação ainda não aprovada.

## 3. Build 0 — base verificável

### Objetivo

Criar uma linha de base confiável antes de alterar segurança, banco ou financeiro.

### Entregas

1. Corrigir a suíte atual:
   - declarar/fixar `tsx` no projeto;
   - corrigir o acesso desprotegido a `item.fotos.map`;
   - fazer `checar`, `testar`, TypeScript e build rodarem em instalação limpa.
2. Criar CI com `npm ci`, verificações, testes e build.
3. Extrair do Supabase real:
   - tabelas, colunas, constraints e índices;
   - RLS e policies;
   - grants;
   - triggers e funções, especialmente `security definer`;
   - buckets e policies de Storage;
   - histórico real de migrations.
4. Criar baseline versionada e eliminar scripts de diagnóstico/decisão da trilha automática.
5. Separar ambientes de desenvolvimento/homologação/produção.
6. Fazer backup e provar uma restauração em ambiente separado.
7. Criar conjunto mínimo de dados anonimizados: duas organizações se suportadas, um admin,
   duas pessoas de campo, famílias com um/dois jazigos, pré/pós-pago, avulso e recebimentos.

### Critério de saída

- pipeline verde a partir de clone limpo;
- schema real comparado à baseline sem diferença desconhecida;
- backup restaurado e consultável;
- nenhuma chave de produção usada no ambiente de ensaio;
- dados de teste cobrem os fluxos críticos.

### Não fazer ainda

- redesenhar telas;
- ligar disparos;
- migrar toda a carteira;
- alterar saldo real.

## 4. Build 1 — acesso e proteção de dados

### Objetivo

Garantir que a conta individualizada tenha permissões reais, não apenas menus diferentes.

### Entregas

1. Criar helpers de papel/organização no banco com validação de membro ativo.
2. Policies por operação:
   - admin acessa a administração da organização;
   - campo lê somente o roteiro/dados indispensáveis;
   - campo escreve apenas início, conclusão, ocorrência, foto e consumo autorizados;
   - serviço de outra executora é negado.
3. Revisar todos os grants e RPCs `security definer`; revogar o que não for necessário.
4. Fazer `iniciar` e `concluir` validarem organização, papel, atividade e atribuição.
5. Ao desativar uma pessoa, revogar sessões/acesso imediatamente.
6. Trocar senha inicial simples por convite ou senha temporária forte; MFA para admin.
7. Remover segredo de query string em crons/webhook e adotar header/HMAC conforme o caso.

### Contraprovas obrigatórias

- campo tenta chamar PostgREST diretamente para ler/alterar financeiro: **403**;
- campo tenta concluir UUID de outra executora: **403**;
- membro inativo com sessão antiga: **403**;
- admin da organização A tenta acessar organização B: nenhum dado;
- anônimo tenta RPC interna: execução negada;
- cron sem segredo, segredo errado e segredo em query: negados.

### Critério de saída

Matriz anônimo/campo/admin/service role passa tanto pelas APIs quanto diretamente pelo
Supabase. Nenhum teste depende de a interface esconder botões.

## 5. Build 2 — lavagem confiável ponta a ponta

### Objetivo

Fazer uma lavagem física virar um registro completo ou uma pendência reparável, nunca um
sucesso parcial silencioso.

### Entregas

1. Criar RPC transacional/idempotente de conclusão que trate:
   - autorização e transição de status;
   - vínculo da executora;
   - histórico da lavagem;
   - débito/competência conforme regra aprovada;
   - consumo de material;
   - remuneração;
   - outbox/fila de comunicação.
2. Definir chaves únicas por efeito e comportamento para repetição/concorrência.
3. Manter upload fora da transação, mas registrar/reutilizar arquivo e identificar órfãos.
4. Criar reconciliação diária: serviço executado × fotos × financeiro × remuneração × fila.
5. Classificar falha como transitória ou permanente; permanente vira pendência visível.
6. Instrumentar correlação por `servico_id` e etapa.
7. Testar dois requests simultâneos, timeout após commit e reprocessamento.

### Critério de saída

- 100 execuções simuladas produzem exatamente um conjunto de efeitos;
- clique/requisição duplicada não duplica débito, material, remuneração ou mensagem;
- falha injetada em cada etapa é reparada automaticamente ou aparece em painel;
- reconciliação retorna zero divergência antes do piloto.

## 6. Build 3 — campo simples e offline honesto

### Objetivo

Entregar o menor fluxo possível para quem está lavando: achar, começar, terminar e seguir.

### Entregas

1. Colocar lista/“próximo jazigo” imediatamente depois do resumo.
2. Recolher apoio, materiais, cadastro e puxar mais em `Mais opções`.
3. Uma ação principal em largura total por estado; “como chegar” e “não consegui” ficam
   secundários e separados.
4. Consolidar o cartão em uma implementação e remover/arquivar fluxos antigos não usados.
5. Modelar estados por lavagem:
   - não iniciada;
   - em andamento;
   - guardada neste celular;
   - enviando;
   - confirmada pelo servidor;
   - precisa de ajuda.
6. Reconciliar cache da agenda com IndexedDB ao abrir offline.
7. Deduplicar fila local por `servicoId + tipo`, travar no primeiro toque e limpar ação ao
   cancelar a câmera.
8. Enfileirar também “não feito” e pedido de material, ou declarar claramente a limitação.
9. Mostrar pendências em linguagem operacional: lavagens/jazigos, não “registros”.

### Contraprovas obrigatórias

Executar os testes T1–T12 da auditoria de campo, com destaque para modo avião, reabertura,
câmera cancelada, toque duplo, memória cheia, sessão expirada, luva e sol.

### Critério de saída

- nenhuma foto/lavagem perdida;
- 90% ou mais das tarefas principais sem ajuda;
- próxima ação encontrada em menos de 10 segundos (mediana);
- operadora explica corretamente guardado versus confirmado;
- nenhum toque acidental em “não deu” ou “encerrar dia”.

## 7. Build 4 — verdade financeira

### Objetivo

Definir e provar uma única verdade para dívida, pagamento, competência e fechamento.

### Entregas

1. Aprovar glossário/regra com a responsável:
   - devedor é família ou pessoa;
   - pré-pago, pós-pago e contra-foto;
   - competência e vencimento;
   - pagamento parcial/adiantado;
   - avulso, desconto, estorno, reembolso e inadimplência;
   - fechamento e reabertura.
2. Resolver a convivência de `movimentos` e `conta_corrente`: fonte oficial, espelho e
   reconciliação explícitos.
3. Corrigir a home para não misturar lavagens de uma competência com saldo de outro momento;
   rotular `saldo atual` ou calcular saldo na data selecionada.
4. Tornar movimentos financeiros idempotentes e auditáveis.
5. Implementar funil:
   - a identificar;
   - a conciliar;
   - em aberto;
   - pronto para fechar;
   - fechado.
6. Criar relatório de divergência e impedir fechamento enquanto houver diferença.
7. Validar saldos iniciais família por família antes da migração real.

### Critério de saída

- cenários de pré/pós-pago, parcial, duplicado, adiantado e estorno fecham em centavos;
- home, ficha, conta corrente, relatório e fechamento exibem o mesmo resultado;
- um ciclo completo de homologação é reconciliado com extrato de ensaio;
- a administradora explica os números sem ajuda técnica.

## 8. Build 5 — administração orientada à ação

### Objetivo

Fazer a administradora abrir o painel e descobrir tudo que precisa dela sem visitar cada menu.

### Entregas

1. Home `Precisa de você` com links já filtrados para:
   - mensagens;
   - recebimentos;
   - cadastros incompletos;
   - sincronizações/falhas;
   - WhatsApp e rotinas.
2. Badges apenas para pendências acionáveis, evitando decoração permanente.
3. Separar Agenda de Planejamento.
4. Em Famílias, manter busca e três atalhos; recolher filtros avançados com contador.
5. Separar `Nova família` de `Importar planilha`; cadastro individual em quatro etapas com
   resumo do que foi salvo.
6. Agrupar Configurações em Operação, Equipe, Comunicação, Dados/Privacidade e Sistema.
7. Padronizar quatro estados de lista: carregando, erro+retry, vazio confirmado e conteúdo.
8. Padronizar ações críticas, motivo, consequência e desfazer quando aplicável.
9. Começar migração das telas inline para componentes únicos, priorizando formulários e
   decisões financeiras.

### Contraprovas obrigatórias

Executar A1–A14 da auditoria administrativa em desktop e os fluxos principais no celular.

### Critério de saída

- todas as pendências são encontradas em até 60 segundos;
- 90% ou mais das tarefas recorrentes sem ajuda;
- falha de API nunca é confundida com lista vazia;
- cadastro individual completo/conferido em até cinco minutos;
- nenhuma ação destrutiva ocorre sem consequência compreendida.

## 9. Build 6 — comunicação, privacidade e operação assistida

### Objetivo

Ligar o atendimento às famílias com segurança, possibilidade de revisão e suporte operacional.

### Entregas

1. Na fila de liberação, mostrar antes/depois, data/hora, família, destinatário e jazigo.
2. Confirmar descarte e oferecer desfazer; idempotência no envio.
3. Buckets privados separados para serviços e comprovantes; URLs assinadas com validade.
4. Política implementada de retenção, exclusão, consentimento e incidente LGPD.
5. Outbox/retry de WhatsApp com estado legível e sem duplicar mensagem.
6. Dash/alertas para cron atrasado, WhatsApp desconectado, upload, fila e divergência.
7. Runbooks de deploy, rollback, rotação de segredos, restauração e operação manual.
8. Manter disparos automáticos desligados; liberar capacidades uma por vez.

### Critério de saída

- envio repetido não duplica mensagem;
- fotos privadas não abrem sem autorização/URL válida;
- falhas simuladas geram alerta e procedimento executável;
- restauração e rollback são ensaiados;
- responsável consegue operar manualmente durante indisponibilidade de integração.

## 10. Build 7 — piloto e go-live gradual

### Objetivo

Validar pessoas, processo, dados e tecnologia juntos antes de escalar.

### Etapas

1. Cadastro assistido e dupla conferência de uma amostra.
2. Piloto com uma pessoa de campo, um bloco/cemitério, 10–20 lavagens e três dias úteis.
3. Conferência diária de serviço, fotos, material, remuneração, financeiro e comunicação.
4. Um ciclo de cobrança em paralelo com o processo anterior usado apenas como espelho.
5. Revisão de incidentes e correção antes de ampliar.
6. Expansão por bloco, nunca toda a carteira de uma vez.
7. Automação de mensagens ativada por capacidade, com chave de desligamento e rollback.

### Gate final de go-live

- zero P0 e P1 abertos;
- 100% das lavagens do piloto reconciliadas;
- 100% do ciclo financeiro conferido em centavos;
- critérios presenciais de campo e administração aprovados;
- backup/restauração, suporte e rollback ensaiados;
- responsáveis nomeados para operação, financeiro, tecnologia e incidente;
- consentimento explícito da responsável pela operação para expandir.

## 11. Dependências e paralelismo seguro

```text
Build 0 (baseline/CI)
        |
Build 1 (acesso/RLS)
        |
Build 2 (lavagem atômica)
       / \
Build 3  Build 4
(campo)  (financeiro)
       \ /
Build 5 (admin orientado à ação)
        |
Build 6 (comunicação/privacidade/operação)
        |
Build 7 (piloto e expansão)
```

Depois do Build 2, Campo e Financeiro podem ter frentes de implementação paralelas, mas o
Build 5 só deve fechar quando ambos fornecerem estados confiáveis para a home. Protótipos de
UX podem ser preparados antes; ativação em produção respeita os gates.

## 12. O que não priorizar agora

Até o piloto fechar, não deve consumir a capacidade principal:

- novos módulos de CRM, leads ou campanhas;
- expansão de IA/autoresposta;
- mapa sofisticado ou customização visual extensa;
- relatórios gerenciais sem decisão associada;
- gamificação/produtividade individual;
- refatoração ampla sem teste de comportamento;
- automação de mensagem antes de fila, idempotência e privacidade.

Esses temas podem ser úteis no futuro, mas aumentam superfície antes de o núcleo provar
lavagem, recebimento e atendimento.

## 13. Formato recomendado para cada build

Cada build deve abrir com um documento curto contendo:

1. problema e risco que resolve;
2. histórias/tarefas incluídas;
3. explicitamente fora do escopo;
4. migration e estratégia de rollback;
5. telemetria/alerta necessário;
6. testes automatizados;
7. contraprova humana;
8. critério de go/no-go;
9. evidências anexadas ao encerramento.

Um build não termina quando foi implantado; termina quando passou a contraprova e deixou
evidência reproduzível.

## 14. Recomendação final

Se houver capacidade para apenas um tema por vez, executar exatamente **Build 0 → 1 → 2**.
Esses três não são negociáveis: sem baseline não se conhece o banco, sem autorização a conta
de campo não é segura, e sem atomicidade a lavagem pode virar prejuízo invisível.

Depois, priorizar **Build 3** para validar a execução física e **Build 4** para validar o
recebimento. A UX administrativa do **Build 5** deve consumir os estados confiáveis criados
pelos anteriores, em vez de apenas reorganizar telas sobre dados ambíguos. Comunicação e
go-live vêm por último porque tornam qualquer erro anterior visível para a família.
