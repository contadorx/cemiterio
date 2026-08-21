# Auditoria de UX — área administrativa

**Data:** 21/08/2026
**Objeto:** painel usado pela responsável pela operação para acompanhar lavagens,
famílias, agenda, recebimentos, comunicações, equipe e configurações.
**Método:** inspeção heurística do fluxo ativo, reconstrução de tarefas, análise de estados
e contraprovas estáticas. Não substitui teste presencial com a administradora nem validação
dos dados reais.

## 1. Parecer executivo

A área administrativa evoluiu na direção correta: o menu foi reduzido e agrupado, a página
inicial responde “quem foi limpo e quem pagou”, a fila exige aprovação humana e famílias,
jazigos e planos foram aproximados. Há uma preocupação clara em usar linguagem do negócio,
não linguagem de ERP.

Mesmo assim, **o painel ainda não está simples como sistema de decisão**. A navegação global
é razoável, mas as telas internas — especialmente Famílias, Agenda, Financeiro e
Configurações — concentram filtros, abas, formulários e ações de manutenção. A pessoa
consegue fazer muita coisa, porém precisa conhecer onde cada coisa mora e interpretar
estados que o sistema deveria transformar em próximas ações.

**Parecer por dimensão:**

- **orientação global:** boa;
- **visão do mês:** boa, com lacunas de erro e significado temporal;
- **cadastro e manutenção:** completos, mas densos;
- **agenda:** poderosa demais na mesma superfície do trabalho diário;
- **financeiro:** funcionalmente amplo, com alto risco cognitivo;
- **aprovação de mensagens:** simples, mas precisa proteção adicional contra descarte;
- **configurações:** principal ponto de sobrecarga;
- **mobile:** há correções importantes, mas não há prova de que os fluxos longos sejam ágeis;
- **recuperação de erro e confirmação:** inconsistente pelo uso recorrente de diálogos nativos.

## 2. Quem usa e quais decisões precisa tomar

O painel parece destinado principalmente à dona/administradora, não a uma equipe de
backoffice especializada. A UX deve ser otimizada para cinco perguntas, nesta ordem:

1. **O que precisa da minha atenção agora?** Lavagem atrasada, mensagem aguardando,
   WhatsApp desconectado, cadastro incompleto ou recebimento pendente.
2. **O trabalho de hoje está acontecendo?** Planejado, iniciado, concluído, não feito e
   pendente de sincronização.
3. **Quem pagou e quem está em aberto?** Valor devido, recebido, não identificado e divergente.
4. **Qual família preciso atender?** Histórico, contatos, jazigos, fotos, contrato e saldo.
5. **Existe algo excepcional para configurar?** Equipe, jornada, cemitério, materiais,
   automações e privacidade.

Quando tarefas de configuração disputam atenção com decisões diárias, o painel deixa de
ser uma mesa de trabalho e vira um catálogo de funções.

## 3. Arquitetura de informação observada

### Navegação global

O menu possui três grupos:

- **Dia a dia:** O mês, Agenda, Liberação, Avulsos e Campo;
- **Carteira:** Famílias, Jazigos e Financeiro;
- **Ajustes:** WhatsApp e Configurações.

A coluna fixa no desktop e a gaveta no celular são padrões adequados. O item ativo tem
texto, fundo e filete, não depende apenas de cor. A gaveta fecha ao navegar e com `Esc`.

### Superfícies principais

- **O mês:** três indicadores e lista de famílias pendentes.
- **Agenda:** consulta, geração, reorganização, inclusão de avulsos, remarcação, conclusão,
  cancelamento, exclusão e estorno.
- **Liberação:** revisão de fotos/texto e decisão de enviar ou não enviar.
- **Famílias:** três abas, etapas de cadastro, busca, múltiplos filtros, ordenação,
  cadastro manual e importação.
- **Financeiro:** várias abas/subabas de fechamento, entradas, gestão, jazigos e banco.
- **Configurações:** onze abas e uma chave mestra de disparos.

Essa estrutura é funcional, mas as quatro últimas superfícies misturam trabalho frequente,
correção excepcional e configuração estrutural.

## 4. Pontos fortes que devem ser preservados

### 4.1 Página inicial orientada ao negócio

“Falta limpar”, “falta pagar” e “em aberto” são mais úteis que métricas abstratas. A lista
começa filtrada por pendências e ordena casos que exigem atenção.

### 4.2 Comunicação humana sob controle

A fila mostra destinatário, local, fotos e texto editável antes do envio. A frase “nada é
enviado sem você aprovar” comunica o modelo mental correto e reduz medo da automação.

### 4.3 Cadastro por etapa

Os estados “sem túmulo”, “falta contrato”, “pronta sem limpeza” e “operacional” transformam
um cadastro longo em avanço verificável. O contador “Do campo” também revela jazigos órfãos
que poderiam ficar esquecidos.

### 4.4 Navegação responsiva e persistente

Desktop mantém o menu visível; celular preserva espaço com gaveta. O layout não remonta a
navegação a cada página, favorecendo orientação.

### 4.5 Linguagem direta

Rótulos como “Famílias”, “Jazigos”, “Em aberto”, “Não enviar” e “Dias e horários” são
compreensíveis para a operação. Selos possuem texto, não apenas cores.

### 4.6 WhatsApp verificado no ponto de envio

A fila alerta antes da revisão quando o WhatsApp está desconectado e oferece caminho para
reconexão. Isso evita descobrir a indisponibilidade somente no último clique.

## 5. Contraprovas de usabilidade

### CA-01 — “A página inicial mostra tudo que precisa de atenção”

**Cenário:** há mensagens aguardando, WhatsApp desconectado, comprovantes sem conciliação e
jazigos do campo sem família.
**Observação:** a home mostra somente limpeza/pagamento por família; pendências de outras
áreas dependem de abrir cada item do menu. Não há badges globais no menu.
**Resultado:** a administradora pode encerrar o dia acreditando que está tudo certo enquanto
existem filas operacionais fora da home.
**Conclusão:** parcialmente reprovada. A home precisa de um bloco curto “Precisa de você” com
contagens e links: mensagens, banco, cadastros incompletos, sincronização e falhas.

### CA-02 — “O mês é uma fotografia da competência selecionada”

**Cenário:** selecionar um mês antigo.
**Observação:** lavagens são filtradas pela competência, mas o saldo é calculado sobre todos
os lançamentos da conta corrente, sem corte temporal aparente na rota da home.
**Resultado:** “falta pagar” pode representar saldo atual enquanto “falta limpar” representa
o mês escolhido, misturando tempos na mesma linha.
**Conclusão:** reprovada até validação da regra. A interface deve declarar “saldo atual” ou
calcular posição no fechamento da competência.

### CA-03 — “Se a home não carregar, a pessoa sabe o que ocorreu”

**Cenário:** API retorna 500 ou a conexão cai.
**Observação:** o carregamento usa `finally`, mas não mantém um estado de erro visível nem
botão de tentar novamente; `dados` pode continuar vazio ou antigo.
**Resultado:** tela sem indicadores pode parecer mês sem dados.
**Conclusão:** reprovada. Exibir erro, horário da última atualização e ação “Tentar novamente”.

### CA-04 — “Famílias é uma lista simples de consultar”

**Cenário:** procurar rapidamente quem está devendo.
**Observação:** antes da lista há três abas, cinco filtros de etapa, busca, situação, quadra,
rua, periodicidade, vencimento, ordenação, teste e limpar.
**Resultado:** o recurso é poderoso, mas a consulta cotidiana exige atravessar uma central
de filtros. No celular, os filtros viram carrossel horizontal e alguns ficam fora da visão.
**Conclusão:** reprovada para uso frequente. Manter busca + três atalhos (“em aberto”,
“cadastro incompleto”, “próxima lavagem”) e recolher filtros avançados.

### CA-05 — “Cadastrar uma família é uma única tarefa”

**Cenário:** cadastro individual durante atendimento por telefone.
**Observação:** o formulário combina pessoa, tratamento, telefone, jazigo novo/existente,
quadra, rua, falecido, plano, valor, início e consentimento; importação CSV divide a mesma área.
**Resultado:** um erro tardio pode exigir revisar uma tela longa, e a pessoa não sabe quais
partes foram efetivamente criadas quando há sucesso parcial.
**Conclusão:** parcialmente reprovada. Usar etapas curtas com resumo final e transação única:
Família → Jazigo → Contrato → Conferir. CSV deve ser fluxo separado.

### CA-06 — “Agenda mostra o trabalho, não a engenharia da agenda”

**Cenário:** administradora quer apenas saber o que será lavado amanhã.
**Observação:** a mesma tela expõe seis horizontes, período personalizado, reorganização,
geração por dias, geração mensal, avulsos, diagnósticos e várias ações por serviço.
**Resultado:** o trabalho diário disputa espaço com planejamento estrutural e correções.
**Conclusão:** reprovada. Separar `Agenda` (consultar/remarcar) de `Planejar agenda`
(gerar/reorganizar/diagnosticar), deixando o último dentro de uma ação secundária.

### CA-07 — “Ações destrutivas são consistentes e seguras”

**Cenário:** excluir, estornar, remover acesso, desconectar WhatsApp ou descartar mensagem.
**Observação:** parte usa `confirm`, parte `prompt`, parte exclui após botão; na fila, “Não
enviar” fica ao lado de “Enviar” e não há confirmação no componente.
**Resultado:** contexto, consequência e possibilidade de desfazer variam por tela.
**Conclusão:** reprovada. Adotar um único componente de confirmação com objeto, efeito,
motivo quando necessário e opção de desfazer para descarte não financeiro.

### CA-08 — “Liberação permite revisar com segurança”

**Cenário:** dez mensagens semelhantes e duas famílias com nomes próximos.
**Observação:** todos os cartões têm a mesma hierarquia; enviar remove imediatamente o item,
e descartar está próximo. Não aparece horário da lavagem nem comparação explícita antes/depois.
**Resultado:** aumenta risco de operar a família errada ou descartar por toque equivocado.
**Conclusão:** parcialmente reprovada. Rotular fotos “antes/depois”, mostrar data/hora,
confirmar descarte e oferecer “desfazer” por alguns segundos.

### CA-09 — “Financeiro tem uma única porta”

**Cenário:** registrar uma entrada e conferir se o mês fechou.
**Observação:** existe uma porta global, mas dentro dela há abas e subabas, componentes de
entrada, fechamento, equipe, reajustes, remuneração, gestão, jazigos e conferência bancária.
**Resultado:** a consolidação do menu deslocou a complexidade para dentro da página.
**Conclusão:** parcialmente reprovada. A primeira visão deve ser um funil: `a identificar →
a conciliar → em aberto → mês pronto para fechar`, deixando relatórios e configurações abaixo.

### CA-10 — “Configurações são ocasionais e fáceis de localizar”

**Cenário:** alterar os dias de trabalho ou remover acesso de uma pessoa.
**Observação:** onze abas aparecem simultaneamente e a página possui mais de mil linhas,
incluindo equipe, cemitérios, jornada, campo, campanhas, avaliações, indicações, LGPD,
auditoria e diagnóstico.
**Resultado:** a pessoa precisa ler todos os rótulos; em celular formam várias linhas de
botões. Configuração operacional e diagnóstico técnico têm o mesmo nível.
**Conclusão:** reprovada. Agrupar em `Operação`, `Equipe e acessos`, `Comunicação`, `Dados e
privacidade` e `Diagnóstico`; diagnóstico deve ficar no fim e exigir intenção explícita.

### CA-11 — “O painel é visualmente consistente”

**Cenário:** alternar entre Home/Liberação e Agenda/Famílias/Financeiro.
**Observação:** telas novas usam Tailwind e componentes de `pecas.tsx`; telas extensas usam
objetos inline de `ui.tsx`, com uma folha global e `!important` para corrigir mobile.
**Resultado:** controles, espaçamentos, estados de carregamento e botões variam. Correções
globais podem afetar elementos inesperados.
**Conclusão:** parcialmente reprovada. Migrar por fluxo, começando por formulários e ações
críticas, para componentes únicos com estados de erro/sucesso padronizados.

### CA-12 — “O mobile administrativo é naturalmente simples”

**Cenário:** cadastrar família ou conferir agenda num aparelho de 360 px.
**Observação:** a folha móvel aumenta alvos e largura de campos, mas também transforma filtros
em rolagem horizontal e tabelas em áreas roláveis. Isso evita quebra visual, não reduz a
complexidade da tarefa.
**Resultado:** tecnicamente responsivo, porém não necessariamente fácil.
**Conclusão:** reprovada como prova de usabilidade. Fluxos prioritários precisam teste real
com teclado aberto, rolagem, voltar do navegador e perda de conexão.

### CA-13 — “O sistema sempre diferencia vazio de falha”

**Cenário:** APIs de listas falham.
**Observação:** vários `fetch(...).catch(() => null)` apenas mantêm `null`, array vazio ou
estado anterior. Algumas páginas possuem erro explícito; outras mostram carregando, vazio
ou nada.
**Resultado:** a responsável pode interpretar falha de rede como ausência de pendência.
**Conclusão:** reprovada. Toda lista precisa de quatro estados inequívocos: carregando,
erro com retry, vazio confirmado e conteúdo com horário de atualização.

### CA-14 — “Termos iguais significam a mesma coisa”

**Cenário:** navegar entre O mês, Financeiro, Famílias e Liberação.
**Observação:** convivem “falta pagar”, “em aberto”, “saldo”, “entrada”, “recebimento”,
“competência”, “conciliação” e “fechamento”. Alguns são conceitos diferentes, mas não há
glossário contextual nem frases de apoio consistentes.
**Resultado:** risco de interpretar saldo, dívida e dinheiro recebido como a mesma medida.
**Conclusão:** precisa validação com a administradora. Fixar vocabulário: `a receber`,
`recebido`, `a identificar`, `conciliado` e `saldo da família`.

## 6. Avaliação heurística

| Critério | Nota | Síntese |
|---|---:|---|
| Arquitetura global | 4/5 | Menu enxuto, agrupado e responsivo |
| Próxima ação | 3/5 | Home prioriza famílias, mas não agrega todas as filas |
| Linguagem do negócio | 4/5 | Boa, com vocabulário financeiro ainda amplo |
| Consistência visual | 2/5 | Dois sistemas de componentes e diálogos nativos |
| Prevenção de erro | 2/5 | Ações críticas e sucessos parciais inconsistentes |
| Visibilidade de estado | 2/5 | Falha e vazio nem sempre são distinguíveis |
| Eficiência no desktop | 3/5 | Navegação boa; telas internas densas |
| Eficiência no celular | 2/5 | Responsivo não equivale a fluxo simplificado |
| Recuperação/desfazer | 2/5 | Pouco retry, undo e histórico contextual |
| Acessibilidade | 3/5 | Foco e texto ajudam; falta auditoria completa |

**Resultado:** 27/50. A base de navegação é boa; a maior dívida está dentro das telas e na
transformação de dados/filas em decisões inequívocas.

## 7. Proposta de experiência administrativa

### 7.1 Home — “Precisa de você”

Manter os três números do mês e acrescentar, somente quando houver algo:

1. `3 mensagens para revisar`;
2. `2 recebimentos para identificar`;
3. `4 famílias com cadastro incompleto`;
4. `1 lavagem do celular ainda não sincronizada`;
5. `WhatsApp desconectado`;
6. `1 rotina automática atrasada`.

Cada linha leva ao filtro já aplicado. Se não houver nada, mostrar “Nenhuma ação pendente”
com horário da última atualização.

### 7.2 Agenda em dois níveis

- **Agenda:** hoje, amanhã, semana; ver, concluir excepcionalmente, remarcar ou marcar não feito.
- **Planejamento:** gerar mês, reorganizar, incluir avulsos, capacidade e diagnóstico.

O botão de planejamento pode abrir uma folha/página secundária. Não deve dominar a consulta.

### 7.3 Famílias orientada a tarefas

Exibir por padrão:

- busca;
- atalhos `Em aberto`, `Cadastro incompleto`, `Próxima lavagem`;
- botão `Filtros avançados` com contador de filtros ativos;
- botão `Nova família` separado de `Importar planilha`.

O cadastro deve salvar rascunho e mostrar progresso: `1. Família`, `2. Jazigo`, `3. Contrato`,
`4. Conferir`. O resumo final precisa dizer exatamente o que foi criado.

### 7.4 Financeiro como funil

Primeira visão:

1. **A identificar:** dinheiro que entrou sem família confirmada;
2. **A conciliar:** sugestão existe, depende de aprovação;
3. **Em aberto:** famílias com dívida;
4. **Pronto para fechar:** todas as diferenças resolvidas;
5. **Fechado:** competência imutável, com opção formal de reabertura.

Relatórios, remuneração e categorias ficam como ferramentas secundárias.

### 7.5 Configuração por domínio

- **Operação:** cemitérios, jornada, campo e materiais;
- **Equipe e acessos:** pessoas, papéis e desligamento;
- **Comunicação:** WhatsApp, disparos, campanhas, avaliações e indicações;
- **Dados e privacidade:** LGPD, exportação e retenção;
- **Sistema:** auditoria e diagnóstico.

A chave de disparos deve continuar destacada, mas informar última alteração, autor e alcance.

## 8. Prioridades

### P0 — antes do piloto administrativo

1. Distinguir erro, vazio e conteúdo em Home, Liberação, Agenda, Famílias e Financeiro.
2. Confirmar/corrigir a coerência temporal de saldos na home por competência.
3. Padronizar confirmação para descarte, exclusão, estorno e remoção de acesso.
4. Mostrar rótulos antes/depois, família, local e data na fila de liberação.
5. Validar fluxos financeiros e de cadastro com dados reais anonimizados.

### P1 — antes de operar toda a carteira

1. Criar bloco “Precisa de você” com links filtrados.
2. Separar Agenda de Planejamento.
3. Recolher filtros avançados de Famílias.
4. Organizar Configurações em cinco domínios.
5. Padronizar feedback, retry, sucesso e “desfazer”.
6. Separar cadastro individual de importação em massa.

### P2 — evolução

1. Migrar telas inline para biblioteca de componentes única.
2. Criar histórico de ações críticas com autor e consequência legível.
3. Adicionar atalhos de teclado no desktop sem prejudicar mobile.
4. Medir tempo para resolver pendências, não quantidade de cliques em telas.

## 9. Contraprovas práticas obrigatórias

Executar com a administradora real, sem orientação durante a tarefa.

| Teste | Tarefa | Critério de aprovação |
|---|---|---|
| A1 | Dizer tudo que exige atenção hoje | Encontra todas as filas em até 60 s |
| A2 | Descobrir quem não foi limpo no mês | Conclui em até 20 s sem abrir Financeiro |
| A3 | Descobrir quem deve e quanto | Explica corretamente saldo e competência |
| A4 | Cadastrar família com dois jazigos | Completa sem ajuda e confirma o que foi salvo |
| A5 | Retomar cadastro incompleto | Encontra a próxima etapa em até 20 s |
| A6 | Remarcar uma lavagem | Entende efeito nas próximas sem tentativa errada |
| A7 | Estornar lavagem cobrada | Relata consequência financeira antes de confirmar |
| A8 | Aprovar mensagem com duas fotos | Identifica antes/depois, destino e serviço corretos |
| A9 | Descartar mensagem por engano | Consegue desfazer sem suporte técnico |
| A10 | Registrar e conciliar pagamento parcial | Saldo final confere em centavos |
| A11 | Alterar jornada sem quebrar agenda | Localiza impacto e revisa reorganização |
| A12 | Remover acesso de campo | Entende efeito e comprova bloqueio imediato |
| A13 | Repetir A4 e A10 no celular | Sem rolagem perdida ou teclado cobrindo ação |
| A14 | Repetir tarefa com API indisponível | Diferencia falha de “nenhum dado” |

Registrar sucesso sem ajuda, tempo, caminho percorrido, interpretações erradas, retorno de
tela e confiança de 1 a 5. Critérios gerais para piloto:

- 100% das ações financeiras preservam valores e deixam consequência compreendida;
- pelo menos 90% das tarefas recorrentes são concluídas sem ajuda;
- nenhuma falha de API é interpretada como lista vazia;
- nenhuma ação destrutiva ocorre sem entendimento explícito;
- a administradora encontra todas as pendências do dia em até 60 segundos;
- cadastro individual é concluído e conferido em até cinco minutos, salvo caso excepcional.

## 10. Conclusão

O painel já possui uma boa espinha dorsal e decisões de produto coerentes com uma operação
pequena. O risco atual não é falta de funcionalidade; é transformar cada tela em uma coleção
de recursos igualmente visíveis. A home precisa agregar exceções, e as telas internas devem
separar trabalho frequente de planejamento, manutenção e diagnóstico.

A meta de UX administrativa deve ser: **abrir, saber o que precisa de atenção e resolver sem
procurar em várias áreas**. A inspeção indica o caminho, mas somente as contraprovas com a
responsável e dados próximos da realidade autorizam o go-live.
