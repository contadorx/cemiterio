# Tela branca no app de campo — causa e correção

## O que aconteceu
"Application error: a client-side exception has occurred" — o sintoma clássico
de **service worker servindo página velha**.

O Next.js gera arquivos de código com nome versionado a cada publicação
(`main-a1b2c3.js`). A página HTML aponta para os nomes da versão dela. O service
worker antigo guardava **a página** em cache — então o celular abria o HTML
velho, que pedia arquivos que não existiam mais no servidor. Resultado: tela
branca.

## A correção
`public/sw.js` foi reescrito com regras claras:
- **Página (navegação)** → sempre da rede. Nunca serve HTML guardado.
  Sem internet, mostra uma tela de aviso em português.
- **Código e imagens do Next** → cache é seguro (o nome muda a cada versão).
- **API** → nunca passa pelo service worker.

E `RegistrarSW` agora força a troca: quando existe versão nova, ela assume na
hora e a página recarrega uma vez. Antes, a versão antiga continuava no comando
até fechar todas as abas.

## Rede de segurança
Criei `src/app/error.tsx`: se qualquer erro de JavaScript acontecer, em vez da
tela branca em inglês aparece:

> 🌿 **Algo deu errado aqui**
> Não foi culpa sua e nada do que você registrou se perdeu.
> [Tentar de novo] [Limpar e recarregar]

O botão "Limpar e recarregar" apaga service worker e cache — resolve sozinho
esse tipo de problema. E o erro é registrado em **Config → Diagnóstico**.

## Segundo problema encontrado
Ao investigar, descobri que os componentes novos do campo — **Começar**,
**Não deu** e **confirmação por QR** — tinham sido criados como arquivos mas
**nunca ligados na página**. Eu havia reportado como prontos, e não estavam.

Agora estão. O fluxo é:
**▶ Começar** → confirma o jazigo (QR ou foto) → cronômetro no card →
**📸 Finalizar com a foto**. Mais o **Não deu** em todo card.

O card mostra **QD · RUA · nº** e os avisos (🌷 data de memória · ⏰ ficou pra
depois · 📷 primeira visita).

## Depois de publicar
Peça para a Nina abrir e, se a tela branca persistir uma vez, tocar em
**"Limpar e recarregar"**. É só na primeira vez — o service worker novo já
resolve daí em diante.
