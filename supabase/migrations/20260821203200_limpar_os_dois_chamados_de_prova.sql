/* ============================================================================
 * OS DOIS CHAMADOS DE MENTIRA QUE FICARAM NA CAIXA.
 *
 * `20260816001623_prova_do_chamado` abriu dois chamados para provar o fluxo e
 * respondeu um deles. A limpeza que veio junto do recado — `20260815232735` —
 * é ANTERIOR e só apaga os textos daquela prova; estes dois nasceram depois e
 * nunca foram varridos.
 *
 * Medido na produção: 5 chamados, dos quais 2 são estes. E a consequência não
 * é cosmética:
 *
 *   - o painel de negócio conta 5 chamados onde há 3;
 *   - `chamado_resposta()` calcula o tempo médio de resposta a partir de uma
 *     resposta que ninguém escreveu — e esse número aparece na PÁGINA PÚBLICA,
 *     que existe justamente para não prometer um prazo inventado.
 *
 * Um número inventado numa página que se orgulha de não inventar números é
 * pior do que não ter o número.
 *
 * ESTA É A ÚNICA DAS TRÊS MIGRAÇÕES NOVAS QUE MEXE EM DADO. Ela é estreita de
 * propósito: casa pelo texto E pelo e-mail exatos que a migração de prova
 * escreveu, e não por "parece teste". Se alguém de verdade tiver aberto um
 * chamado com a mesma frase e o mesmo endereço, é a mesma pessoa da prova.
 * ========================================================================= */

delete from walkstamp.recado
 where (texto = 'o PDF sai sem a capa'  and email = 'fulano@empresa.com')
    or (texto = 'seria bom ter atalho'  and email is null and origem = 'site');
