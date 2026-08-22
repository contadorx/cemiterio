#!/usr/bin/env python3
"""
Gera os dois builds a partir de src/template.html.

  public/app.html                   -> a ferramenta, com jsPDF vindo do CDN
  offline/walkstamp-offline.html  -> jsPDF embutido, arquivo único, funciona sem internet

Edite sempre src/template.html. Os arquivos gerados são descartáveis.
"""

import datetime as _dt
import functools
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
MARKER = "<script>/*__JSPDF__*/</script>"
CDN = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"

# Nome de exibição da marca. Trocar de nome é trocar ESTA linha e o SITE abaixo.
# Antes disto ele estava escrito à mão em 46 lugares, em três idiomas — o tipo de
# coisa que faz uma decisão de dez minutos virar uma tarde de caça.
MARCA = "Walkstamp"

# ---------------------------------------------------------------------------
# A VERSÃO DO BUILD.
#
# O motivo é o pacote OFFLINE. Ele é um arquivo solto que a pessoa guarda no
# computador dela, manda por e-mail e abre meses depois — e não tem como se
# atualizar sozinho. Sem carimbo, "estou com um problema no offline" é uma
# conversa sem chão: ninguém sabe de qual build se está falando, nem se o
# defeito já foi consertado três versões atrás.
#
# O formato é a DATA seguida de um contador do dia: `2026.08.19-1`. Data porque
# é o que a pessoa consegue comparar de cabeça ("o meu é de junho"), e contador
# porque num dia de ajustes saem vários. O contador vive num arquivo, ao lado
# do build, e é derivado — ninguém digita versão à mão.
VER_ARQ = "src/.build"


def versao_do_build(root):
    """Data de hoje mais quantos builds já saíram hoje. Deriva, não se digita."""
    hoje = _dt.date.today().isoformat()
    arq = root / VER_ARQ
    try:
        anterior, n = arq.read_text(encoding="utf-8").strip().split()
        n = int(n)
    except Exception:
        anterior, n = "", 0
    n = n + 1 if anterior == hoje else 1
    try:
        arq.write_text(f"{hoje} {n}\n", encoding="utf-8")
    except Exception:
        pass
    return f"{hoje.replace('-', '.')}-{n}"
# O logotipo escreve a marca em duas metades, a segunda em destaque.
MARCA_A, MARCA_B = "Walk", "stamp"

# Endereço público do site, sem barra no fim. Sai daqui para o canonical, para os
# hreflang e para o link do topo da ferramenta — trocar de domínio é mudar esta linha.
SITE = "https://walkstamp.com"

# O endereço da área do cliente em cada idioma.
#
# Ele existia escrito à mão em TRÊS lugares: no `lib/conta/textos.ts`, no
# `next.config.mjs` e no `lib/site.ts`. Os dois primeiros tinham cinco idiomas;
# o terceiro tinha três — e por isso o link "Sua conta" do rodapé saía
# `undefined` nas páginas em alemão e em francês, num site que fala cinco
# idiomas há semanas. Ninguém viu porque `undefined` num `href` não quebra
# nada: só leva a lugar nenhum.
CAMINHO_CONTA = {"pt": "/conta", "en": "/en/account", "es": "/es/cuenta",
                 "de": "/de/konto", "fr": "/fr/compte"}

# Versão dos ícones. O navegador guarda favicon com unhas e dentes: sem um
# parâmetro que mude, quem já visitou o site continua vendo o ícone antigo
# mesmo depois do deploy. Suba este número sempre que a marca mudar.
ICON_V = "3"

# ---------------------------------------------------------------------------
# Medição. São duas coisas separadas, de propósito:
#
#   Vercel Web Analytics  -> quantas pessoas chegaram e de onde. Só visitas de
#                            página, sem cookie e sem identificador persistente.
#                            Eventos personalizados são recurso de plano pago,
#                            então o funil NÃO passa por aqui.
#   Supabase              -> os três marcos do funil e a lista de aviso. Chama
#                            duas funções que só sabem inserir; as tabelas ficam
#                            num schema fora da API e ninguém as lê pelo cliente.
#
# Nada disso entra no build offline: os tokens abaixo viram string vazia lá, e o
# código sai junto. O arquivo único continua sendo um arquivo que não fala com
# ninguém — e isso é verificável abrindo ele e procurando por "supabase".
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Identificação legal. Sai daqui para os Termos e para a Política de Privacidade
# nos três idiomas — a LGPD exige que o controlador esteja identificado, e um
# CNPJ digitado em nove lugares vira nove chances de digitar errado.
#
# ATENÇÃO: o endereço abaixo precisa RECEBER e-mail de verdade. Publicar canal de
# titular que não responde é pior que não publicar — o prazo do art. 19 corre do
# mesmo jeito. Se preferir usar outro, é esta linha.
# ---------------------------------------------------------------------------
EMPRESA = "Produtize Produtos e Serviços Inteligentes Ltda."
CNPJ    = "48.417.292/0001-99"
CONTATO = "privacidade@walkstamp.com"

# O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD).
#
# O QUE A LEI PEDE, e é só isto: a IDENTIDADE e as INFORMAÇÕES DE CONTATO,
# divulgadas publicamente, de forma clara e objetiva (art. 41, §1º). Nome e
# canal. Nada além disso.
#
# O QUE NÃO ENTRA AQUI, e a recusa é deliberada: CPF, RG, endereço, telefone
# pessoal. Publicar o CPF de alguém numa página aberta da internet é entregar,
# de graça e para sempre, o dado que abre conta e contrata crédito no Brasil —
# e fazer isso dentro de uma POLÍTICA DE PRIVACIDADE seria o documento se
# contradizendo na própria linha em que promete cuidado. A lei não pede, o
# avaliador de fornecedor não procura, e o dano é irreversível: página indexada
# não se despublica de verdade.
#
# Se algum dia um contrato exigir a qualificação completa do encarregado, ela
# vai no INSTRUMENTO ASSINADO entre as partes — que é privado —, e não no site.
ENCARREGADO = "Leandro Batista de Oliveira"

# ---------------------------------------------------------------------------
# Google Drive e Google Docs. Os três nascem VAZIOS e é assim que devem ficar
# em qualquer cópia que não seja a sua: com eles vazios, nenhum botão do Google
# é renderizado e nenhum endereço do Google é requisitado.
#
# São valores PÚBLICOS por natureza — vão para dentro de um HTML estático que
# qualquer pessoa lê. O que protege a chave não é o segredo, é a lista de
# origens autorizadas no console do Google. O passo a passo está em
# GOOGLE-DRIVE.md.
#
#   G_CLIENT  -> liga "Enviar para o Google Docs" (só ele já basta)
#   G_KEY     -> chave de API, restrita a Picker API + seus domínios
#   G_APP     -> número do projeto, só dígitos
#              os três juntos ligam "Abrir do Google Drive"
#
# Nada disso entra no build offline: lá os três viram string vazia, como os
# tokens de medição.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Licença do plano Time. Esta é a chave PÚBLICA — ela só sabe CONFERIR uma
# assinatura, nunca produzir uma. Pode ir para o HTML e para o repositório
# público sem risco nenhum; quem assina é a privada, que fica no
# emitir-licenca.py e nunca entra aqui.
#
# Trocar o par derruba todas as licenças já emitidas. Só faça isso se a privada
# vazar — e aí é justamente o que se quer.
# ---------------------------------------------------------------------------
LIC_PUB = "sVXqPeioW7lkGRM2EPNSOadXCQNFGTBXLtzTknMSeYE"
# A segunda chave pública: a do emissor AUTOMÁTICO (a função da Supabase que
# manda o link por e-mail). São duas de propósito. A de cima assina qualquer
# licença e a privada dela nunca sai da máquina do Leandro; a de baixo vive num
# segredo da Supabase, e o navegador só aceita dela licenças curtas (até 100
# dias) e pequenas (até 25 assentos). Se o servidor for comprometido, o estrago
# máximo é um punhado de licenças de teste — nunca uma licença perpétua.
LIC_PUB_AUTO = "XTO_Xcc5mByFV3tIcijyhjIaJZR-8cyf_HCb1npPtMs"

G_CLIENT = "184815388097-6aki8j9sfgat025onau4alnsu6vqje0b.apps.googleusercontent.com"
G_KEY    = "AIzaSyBsXkxGvHeiSlj4U42wMNDAd-GdlrO18QM"
G_APP    = "184815388097"

# Projeto PRÓPRIO do Walkstamp, na organização Softaria (região sa-east-1).
# Antes era o projeto do SalaVox, emprestado: dois produtos no mesmo banco, na
# mesma conta de e-mail e nos mesmos limites. Separado, cada um cresce sem
# atropelar o outro — e o dia em que um for vendido, migrado ou desligado não
# arrasta o outro junto.
#
# Estas duas linhas são PÚBLICAS por construção: a chave publicável é a chave
# anônima, e só consegue chamar duas funções que apenas INSEREM (medição e lista
# de aviso). Ler a lista de e-mails ou a tabela de licenças é privilégio do
# service_role, que nunca sai do servidor.
SUPA_URL = "https://kjlnyyblhanficgpends.supabase.co"
SUPA_KEY = "sb_publishable_J78bnm05t_zuzcLQ65pW-A_9K3HtU81"

# Snippet oficial do Vercel para site em HTML puro. O `window.va` enfileira
# chamadas feitas antes do script chegar; o script cuida do resto.
ANALYTICS = (
    '<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>'
    '<script defer src="/_vercel/insights/script.js"></script>'
)

META = f"""<title>{MARCA} — transforme vídeo em contexto para IA</title>
<meta name="description" content="Transforme qualquer vídeo em um PDF com os frames que importam e a transcrição sincronizada, pronto para colar em uma IA. Roda no seu navegador: o vídeo não sai do seu computador.">
<meta property="og:type" content="website">
<meta property="og:title" content="{MARCA} — transforme vídeo em contexto para IA">
<meta property="og:description" content="Frames por mudança de cena + transcrição sincronizada, em um PDF único. Nada é enviado para servidor nenhum.">
<meta name="twitter:card" content="summary_large_image">"""

PLAIN_TITLE = "<title>Vídeo → PDF (frames + transcrição)</title>"


# ---------------------------------------------------------------------------
# Páginas do site em pt / en / es, geradas do dicionário src/i18n-site.json.
# Arquivos separados por idioma (e não tradução no navegador) porque só assim
# o buscador indexa cada versão.
# ---------------------------------------------------------------------------

IDIOMAS = ["pt", "en", "es", "de", "fr"]
NOMES = {"pt": "Português", "en": "English", "es": "Español",
         "de": "Deutsch", "fr": "Français"}

REDIRECT = """<script>
/* Detecção de idioma na home. Três regras, e a ordem importa:

   1. `?lang=` na URL manda em tudo — quem clicou numa sigla escolheu, e a
      escolha fica registrada para as próximas visitas;
   2. uma escolha anterior (guardada no `localStorage`, e é a ÚNICA coisa que
      esta página guarda) vale mais que o idioma do sistema: quem já disse que
      lê em português num computador em inglês não quer ser mandado de volta
      para /en toda vez;
   3. só então o idioma do navegador decide.

   `navigator.languages` e não `navigator.language`: quem tem "pt-BR, en-US"
   configurado prefere português, e olhar só o primeiro item já erraria menos,
   mas a lista inteira erra menos ainda quando o primeiro é um idioma que não
   temos. */
(function(){
  try{
    var q = new URLSearchParams(location.search).get('lang');
    var temos = ['pt','en','es','de','fr'];
    if (q && temos.indexOf(q) >= 0) { try{ localStorage.setItem('walkstamp.lang', q); }catch(e){} return; }
    var salvo = null;
    try{ salvo = localStorage.getItem('walkstamp.lang'); }catch(e){}
    var escolhido = (temos.indexOf(salvo) >= 0) ? salvo : null;
    if (!escolhido) {
      var lista = navigator.languages && navigator.languages.length
        ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < lista.length && !escolhido; i++) {
        var n = String(lista[i]).slice(0,2).toLowerCase();
        if (temos.indexOf(n) >= 0) escolhido = n;
      }
    }
    if (escolhido && escolhido !== 'pt') location.replace('/' + escolhido);
  }catch(e){}
})();
</script>"""


# O endereço de cada página interna, por idioma. Só as páginas de conteúdo têm
# endereço traduzido: é nelas que o buscador procura pelas palavras que a pessoa
# digita, e "/en/substituto-do-steps-recorder" não seria encontrado por ninguém.
# As páginas legais mantêm o mesmo caminho nos três idiomas, porque quem chega
# nelas chega por link, não por busca.
# Qual documento cada página de caso de uso mostra na figura.
CENARIO_DA_PAGINA = {
    "casoEv": "evidencia", "casoIn": "instrucao", "casoAta": "ata",
    "casoUx": "ux", "casoIa": "ia",
}

@functools.lru_cache(maxsize=1)
def chaves_do_render():
    """As chaves que o Next escreve na hora de renderizar, e não o dicionário.

    Sem isto o validador acusava `tabelaPlanos` e `quantasFeatures` como "sem
    valor" em cinco idiomas a cada build: dez linhas de aviso falso, todo dia,
    escondendo o aviso verdadeiro que aparecesse no meio. Elas são LIDAS de
    `lib/site.ts` — repetir os nomes aqui seria criar a segunda lista que já
    apagou o hreflang de duas línguas e deixou o rodapé apontando para
    `undefined`. Se alguém acrescentar uma terceira, ela aparece sozinha; se
    alguém apagar uma, o aviso volta, que é o que se quer.
    """
    arq = ROOT / "lib" / "site.ts"
    if not arq.exists():
        return frozenset()
    return frozenset(re.findall(r"^\s*t\.(\w+)\s*=",
                                arq.read_text(encoding="utf-8"), re.M))


SLUGS = {
    "precos":      {"pt": "precos",      "en": "precos",      "es": "precos", "de": "preise", "fr": "tarifs"},
    "privacidade": {"pt": "privacidade", "en": "privacidade", "es": "privacidade", "de": "privacidade", "fr": "privacidade"},
    "termos":      {"pt": "termos",      "en": "termos",      "es": "termos", "de": "termos", "fr": "termos"},
    "seguranca":   {"pt": "seguranca",   "en": "security",    "es": "seguridad", "de": "informationssicherheit", "fr": "securite-de-l-information"},
    "verificar":   {"pt": "verificar",   "en": "verify",      "es": "verificar", "de": "pruefen", "fr": "verifier"},
    "comparativo": {"pt": "comparativo",  "en": "compare",     "es": "comparativa", "de": "vergleich", "fr": "comparatif"},
    "link":        {"pt": "link",        "en": "link",        "es": "link", "de": "link", "fr": "link"},
    "time":        {"pt": "time",        "en": "team",        "es": "equipo", "de": "team", "fr": "equipe"},
    # A base de conhecimento. O endereço é traduzido porque é uma página de
    # BUSCA: ninguém procura "ajuda" em inglês.
    "ajuda":       {"pt": "ajuda",       "en": "help",        "es": "ayuda", "de": "hilfe", "fr": "aide"},
    # As cinco páginas de caso de uso. O endereço é traduzido de propósito: é
    # nelas que a busca acontece, e ninguém procura "caso-usabilidade" em inglês.
    "casoEv":  {"pt": "evidencia-de-teste",    "en": "test-evidence",    "es": "evidencia-de-prueba", "de": "testnachweis", "fr": "preuve-de-test"},
    "casoIn":  {"pt": "instrucao-de-trabalho", "en": "work-instruction", "es": "instruccion-de-trabajo", "de": "arbeitsanweisung", "fr": "mode-operatoire"},
    "casoAta": {"pt": "ata-de-reuniao",        "en": "meeting-minutes",  "es": "acta-de-reunion", "de": "besprechungsprotokoll", "fr": "compte-rendu-de-reunion"},
    "casoIa":  {"pt": "contexto-para-ia",      "en": "context-for-ai",   "es": "contexto-para-ia", "de": "kontext-fuer-ki", "fr": "contexte-pour-ia"},
    "casoUx":  {"pt": "teste-de-usabilidade",  "en": "usability-test",   "es": "prueba-de-usabilidad", "de": "usability-test", "fr": "test-d-utilisabilite"},
    "steps":       {"pt": "substituto-do-steps-recorder",
                    "en": "steps-recorder-replacement",
                    "es": "alternativa-al-steps-recorder", "de": "steps-recorder-ersatz", "fr": "alternative-au-steps-recorder"},
}


# Título e descrição de cada página interna, por idioma. Ficavam dentro do
# gerador; subiram para cá quando o site virou Next.js, porque agora quem os
# lê é o TypeScript — e continuam saindo daqui, de um lugar só.
METAS = {
    "precos": {"pt": (f"Preços — {MARCA}", "A ferramenta no navegador é gratuita e sempre será: não há custo de servidor."),
               "en": (f"Pricing — {MARCA}", "The browser tool is free and always will be: there is no server cost."),
               "es": (f"Precios — {MARCA}", "La herramienta del navegador es gratuita y siempre lo será: no hay coste de servidor."),
              "de": (f"Preise — Walkstamp", "Was im Browser kostenlos bleibt und was die bezahlten Pläne enthalten: Konto, eigenes Logo im Dokument und Einstellungen für das Team."),
              "fr": (f"Tarifs — Walkstamp", "Ce qui reste gratuit dans le navigateur et ce que contiennent les offres payantes : compte, logo du client dans le document et réglages d’équipe.")},
    "privacidade": {"pt": (f"Política de Privacidade — {MARCA}", f"O {MARCA} não coleta dados pessoais e não recebe seus vídeos."),
                    "en": (f"Privacy Policy — {MARCA}", f"{MARCA} collects no personal data and never receives your videos."),
                    "es": (f"Política de Privacidad — {MARCA}", f"{MARCA} no recoge datos personales y no recibe tus vídeos."),
                   "de": (f"Datenschutzerklärung — Walkstamp", "Walkstamp erhebt keine personenbezogenen Daten und erhält Ihre Videos nicht: was im Browser bleibt und welche einzige Verbindung nach außen geht."),
                   "fr": (f"Politique de confidentialité — Walkstamp", "Walkstamp ne collecte aucune donnée personnelle et ne reçoit pas vos vidéos : ce qui reste dans le navigateur et la seule connexion sortante.")},
    "ajuda": {"pt": (f"Base de conhecimento — {MARCA}",
                     "Como cada parte funciona, por tema: gravar, transcrever, revisar os quadros, gerar o documento, e o que fazer quando dá errado."),
              "en": (f"Knowledge base — {MARCA}",
                     "How each part works, by topic: recording, transcribing, reviewing frames, building the document, and what to do when something goes wrong."),
              "es": (f"Base de conocimiento — {MARCA}",
                     "Cómo funciona cada parte, por tema: grabar, transcribir, revisar los fotogramas, generar el documento y qué hacer cuando algo falla."),
             "de": (f"Wissensdatenbank — Walkstamp", "Wie jeder Teil funktioniert, nach Thema: aufnehmen, transkribieren, Screenshots prüfen, Dokument erzeugen und was bei Fehlern zu tun ist."),
             "fr": (f"Base de connaissances — Walkstamp", "Le fonctionnement de chaque partie, par thème : enregistrer, transcrire, vérifier les captures, générer le document et que faire en cas d’erreur.")},
    "termos": {"pt": (f"Termos de Uso — {MARCA}", f"Condições de uso do {MARCA}, ferramenta gratuita que roda inteira no seu navegador."),
               "en": (f"Terms of Use — {MARCA}", f"Terms for {MARCA}, a free tool that runs entirely in your browser."),
               "es": (f"Términos de Uso — {MARCA}", f"Condiciones de uso de {MARCA}, herramienta gratuita que funciona entera en tu navegador."),
              "de": (f"Nutzungsbedingungen — Walkstamp", "Bedingungen für Walkstamp, ein kostenloses Werkzeug, das vollständig in Ihrem Browser läuft: Rechte, Haftung und Grenzen der Nutzung."),
              "fr": (f"Conditions d’utilisation — Walkstamp", "Conditions d’usage de Walkstamp, outil gratuit qui fonctionne entièrement dans votre navigateur : droits, responsabilité et limites d’emploi.")},
    "seguranca": {"pt": (f"Segurança da informação — {MARCA}",
                         "Como funciona sem servidor, o que sai da sua máquina, e a lista honesta das certificações que não temos."),
                  "en": (f"Information security — {MARCA}",
                         "How it works with no server, what leaves your machine, and the honest list of certifications we do not hold."),
                  "es": (f"Seguridad de la información — {MARCA}",
                         "Cómo funciona sin servidor, qué sale de tu equipo y la lista honesta de las certificaciones que no tenemos."),
                 "de": (f"Informationssicherheit — Walkstamp", "Wie es ohne Server funktioniert, was Ihren Rechner verlässt und die ehrliche Liste der Zertifizierungen, die wir nicht haben."),
                 "fr": (f"Sécurité de l’information — Walkstamp", "Comment cela fonctionne sans serveur, ce qui sort de votre poste et la liste honnête des certifications que nous n’avons pas.")},
    "comparativo": {"pt": (f"Comparativo — {MARCA} e as alternativas",
                           "FlowShare, Scribe, Tosca, Steps Recorder: o que cada um faz, o preço de tabela e onde cada um ganha — inclusive da gente."),
                    "en": (f"Compare — {MARCA} and the alternatives",
                           "FlowShare, Scribe, Tosca, Steps Recorder: what each does, list prices, and where each one wins — including against us."),
                    "es": (f"Comparativa — {MARCA} y las alternativas",
                           "FlowShare, Scribe, Tosca, Steps Recorder: qué hace cada uno, el precio de tarifa y dónde gana cada uno — incluso a nosotros."),
                   "de": (f"Vergleich — Walkstamp und die Alternativen", "FlowShare, Scribe, Tosca, Steps Recorder: was jedes davon leistet, der Listenpreis und wo jedes gewinnt — auch gegen uns."),
                   "fr": (f"Comparatif — Walkstamp et les alternatives", "FlowShare, Scribe, Tosca, Steps Recorder : ce que fait chacun, le prix catalogue et le terrain où chacun gagne — y compris contre nous.")},
    "verificar": {"pt": (f"Conferir uma evidência — {MARCA}",
                         "Arraste o zip ou o json e confira, no seu próprio navegador, se as imagens continuam as mesmas."),
                  "en": (f"Check a piece of evidence — {MARCA}",
                         "Drop the zip or the json and check, in your own browser, whether the images are still the same."),
                  "es": (f"Comprobar una evidencia — {MARCA}",
                         "Arrastra el zip o el json y comprueba, en tu propio navegador, si las imágenes siguen siendo las mismas."),
                 "de": (f"Nachweis prüfen — Walkstamp", "Ziehen Sie das ZIP oder das JSON hierher und prüfen Sie im eigenen Browser über die Prüfsumme, ob die Bilder unverändert sind."),
                 "fr": (f"Vérifier une preuve — Walkstamp", "Déposez le zip ou le json et vérifiez dans votre propre navigateur, par l’empreinte, que les images sont restées identiques.")},
    "link": {"pt": (f"Link pronto para o seu sistema de teste — {MARCA}",
                    "Monte um link que abre o Walkstamp com o caso, o chamado e o sistema já preenchidos. Cole no Zephyr, no Jira, no TestRail ou numa planilha. Grátis, sem integração e sem cadastro."),
             "en": (f"A ready-made link for your test management tool — {MARCA}",
                    "Build a link that opens Walkstamp with the case, the ticket and the system already filled in. Paste it into Zephyr, Jira, TestRail or a spreadsheet. Free, no integration, no sign-up."),
             "es": (f"Un enlace listo para tu sistema de pruebas — {MARCA}",
                    "Arma un enlace que abre Walkstamp con el caso, el ticket y el sistema ya rellenados. Pégalo en Zephyr, Jira, TestRail o una hoja de cálculo. Gratis, sin integración y sin registro."),
            "de": (f"Fertiger Link für Ihr Testmanagement — Walkstamp", "Ein Link öffnet Walkstamp mit Testfall, Ticket und System bereits ausgefüllt. Zum Einfügen in Zephyr, Jira, TestRail oder eine Tabelle."),
            "fr": (f"Un lien prêt pour votre outil de tests — Walkstamp", "Un lien ouvre Walkstamp avec le cas, le ticket et le système déjà remplis. À coller dans Zephyr, Jira, TestRail ou un tableur. Sans inscription.")},
    "casoEv": {"pt": (f"Evidência de teste que a auditoria aceita — {MARCA}",
                      "Grave o teste e saia com o PDF: uma tela por passo, hora de relógio, cabeçalho de identificação e verificação de integridade. Grátis, no navegador, sem instalar nada."),
               "en": (f"Test evidence an auditor will accept — {MARCA}",
                      "Record the test and walk away with the PDF: one screen per step, clock time, identification header and integrity verification. Free, in the browser, nothing to install."),
               "es": (f"Evidencia de prueba que la auditoría acepta — {MARCA}",
                      "Graba la prueba y sal con el PDF: una pantalla por paso, hora de reloj, cabecera de identificación y comprobación de integridad. Gratis, en el navegador, sin instalar nada."),
              "de": (f"Testnachweis, den Auditoren akzeptieren — Walkstamp", "Test aufnehmen, PDF erhalten: ein Screenshot pro Schritt, Uhrzeit, Kopfzeile zur Identifikation und Prüfsumme. Im Browser, ohne Installation."),
              "fr": (f"Preuve de test acceptée en audit — Walkstamp", "Enregistrez le test et repartez avec le PDF : une capture par étape, l’heure, un en-tête d’identification et l’empreinte. Sans rien installer.")},
    "casoIn": {"pt": (f"Instrução de trabalho sem colar prints à mão — {MARCA}",
                      "O passo a passo do key user gerado de uma gravação: sua narração vira o texto de cada passo, sem carimbo de data e sem instalar programa."),
               "en": (f"Work instructions without pasting screenshots by hand — {MARCA}",
                      "The key user's step-by-step produced from one recording: your narration becomes the text of each step, with no date stamp and nothing to install."),
               "es": (f"Instrucción de trabajo sin pegar capturas a mano — {MARCA}",
                      "El paso a paso del key user generado de una grabación: tu narración se vuelve el texto de cada paso, sin sello de fecha y sin instalar nada."),
              "de": (f"Arbeitsanweisung ohne Screenshots von Hand — Walkstamp", "Die Schritt-für-Schritt-Anleitung des Key Users aus einer Aufnahme: Ihre Erzählung wird zum Text jedes Schritts, ohne Datumsstempel."),
              "fr": (f"Mode opératoire sans coller les captures — Walkstamp", "Le pas à pas du key user produit à partir d’un seul enregistrement : votre narration devient le texte de chaque étape, sans horodatage.")},
    "casoAta": {"pt": (f"Ata de reunião com as telas do que foi mostrado — {MARCA}",
                       "A gravação da reunião vira um documento com os momentos que importam, a tela de cada um e a fala pareada. O arquivo não sai do seu computador."),
                "en": (f"Meeting minutes with the screens of what was shown — {MARCA}",
                       "The meeting recording becomes a document with the moments that matter, the screen of each one and the speech paired to it. The file never leaves your computer."),
                "es": (f"Acta de reunión con las pantallas de lo que se mostró — {MARCA}",
                       "La grabación de la reunión se vuelve un documento con los momentos que importan, la pantalla de cada uno y el habla emparejada. El archivo no sale de tu ordenador."),
               "de": (f"Besprechungsprotokoll mit den gezeigten Screenshots — Walkstamp", "Die Aufnahme der Besprechung wird ein Dokument mit den Momenten, die zählen, dem Screenshot zu jedem und der zugehörigen Aussage."),
               "fr": (f"Compte rendu de réunion avec les écrans montrés — Walkstamp", "L’enregistrement de la réunion devient un document : les moments qui comptent, la capture de chacun et la parole associée. Rien ne sort du poste.")},
    "casoIa": {"pt": (f"Um vídeo que a IA consegue ler inteiro — {MARCA}",
                      "~60 telas em vez de 3.600, cada uma pareada com a fala daquele trecho, e o prompt pronto. Cabe em qualquer modelo, inclusive nos que recusam vídeo."),
               "en": (f"A video the AI can actually read end to end — {MARCA}",
                      "~60 screens instead of 3,600, each paired with the speech of that stretch, plus a ready-made prompt. Fits any model, including the ones that refuse video."),
               "es": (f"Un vídeo que la IA sí puede leer entero — {MARCA}",
                      "~60 pantallas en vez de 3.600, cada una emparejada con el habla de ese tramo, y el prompt listo. Cabe en cualquier modelo, incluidos los que rechazan vídeo."),
              "de": (f"Ein Video, das die KI ganz lesen kann — Walkstamp", "~60 Screenshots statt 3.600, jeder mit der Aussage dieses Abschnitts, dazu der fertige Prompt. Passt in jedes Modell, auch ohne Video-Eingang."),
              "fr": (f"Une vidéo que l’IA peut lire en entier — Walkstamp", "~60 captures au lieu de 3 600, chacune associée à la parole du passage, et le prompt prêt. Tient dans tout modèle, même sans entrée vidéo.")},
    "casoUx": {"pt": (f"Sessão de teste de usabilidade que vira relatório — {MARCA}",
                      "Moderador e participante separados, momentos marcados durante a sessão e tarja para anonimizar. A gravação do participante não sai do seu computador."),
               "en": (f"A usability session that turns into a report — {MARCA}",
                      "Moderator and participant kept apart, moments marked during the session, and redaction to anonymise. The participant's recording never leaves your computer."),
               "es": (f"Una sesión de usabilidad que se convierte en informe — {MARCA}",
                      "Moderador y participante separados, momentos marcados durante la sesión y tapado para anonimizar. La grabación del participante no sale de tu ordenador."),
              "de": (f"Usability-Test, der zum Bericht wird — Walkstamp", "Moderator und Teilnehmer getrennt, Momente während der Sitzung markiert und Balken zum Anonymisieren. Die Aufnahme bleibt auf Ihrem Rechner."),
              "fr": (f"Test d’utilisabilité qui devient un rapport — Walkstamp", "Modérateur et participant séparés, moments marqués pendant la session et bandeau d’anonymisation. L’enregistrement reste sur votre poste.")},
    "time": {"pt": (f"Plano Time: receba seu link por e-mail — {MARCA}",
                    "Informe seu e-mail e receba um link que ativa o plano Time no navegador do seu time. Teste de 14 dias, sem cadastro, sem senha e sem cartão."),
             "en": (f"Team plan: get your link by email — {MARCA}",
                    "Enter your email and get a link that switches on the Team plan in your team's browser. 14-day trial, no sign-up, no password, no card."),
             "es": (f"Plan Equipo: recibe tu enlace por correo — {MARCA}",
                    "Escribe tu correo y recibe un enlace que activa el plan Equipo en el navegador de tu equipo. Prueba de 14 días, sin registro, sin contraseña y sin tarjeta."),
            "de": (f"Plan Team: Link per E-Mail erhalten — Walkstamp", "Geben Sie Ihre E-Mail-Adresse an und erhalten Sie einen Link, der den Plan Team im Browser Ihres Teams aktiviert. 14 Tage, ohne Karte."),
            "fr": (f"Offre Équipe : recevez votre lien par e-mail — Walkstamp", "Indiquez votre adresse e-mail et recevez un lien qui active l’offre Équipe dans le navigateur de votre équipe. Essai de 14 jours, sans carte.")},
    "steps": {"pt": (f"O Steps Recorder acabou — o que usar no lugar | {MARCA}",
                     "O Gravador de Etapas do Windows foi descontinuado e nada que a Microsoft indica gera documento de passos. O que fazer."),
              "en": (f"Steps Recorder is gone — what to use instead | {MARCA}",
                     "Windows Steps Recorder was deprecated and none of Microsoft's suggested replacements produce a step document. What to do."),
              "es": (f"Steps Recorder se acabó — qué usar en su lugar | {MARCA}",
                     "La Grabadora de Acciones de Windows fue descontinuada y nada de lo que Microsoft sugiere genera un documento de pasos. Qué hacer."),
             "de": (f"Steps Recorder eingestellt — der Ersatz | Walkstamp", "Die Windows-Schrittaufzeichnung wurde eingestellt, und keiner der von Microsoft genannten Ersatzwege erzeugt ein Dokument mit Schritten."),
             "fr": (f"Fin de Steps Recorder — par quoi le remplacer | Walkstamp", "L’Enregistreur d’actions de Windows est abandonné et aucune des solutions citées par Microsoft ne produit un document d’étapes. Que faire.")},
}


LEMBRAR = """<script>
/* Só registra a escolha; quem está em /en ou /es chegou por link ou por
   redirecionamento, e nos dois casos a detecção já fez o trabalho dela. */
(function(){
  try{
    var q = new URLSearchParams(location.search).get('lang');
    if (['pt','en','es','de','fr'].indexOf(q) >= 0) localStorage.setItem('walkstamp.lang', q);
  }catch(e){}
})();
</script>"""


def _switcher(lang, paginas_por_idioma, pagina):
    """Seletor de idioma: links diretos para a mesma página nos outros idiomas."""
    itens = []
    for L in IDIOMAS:
        destino = paginas_por_idioma[L][pagina]
        # `?lang=` em TODOS: é o sinal explícito que a home registra para não
        # mandar a pessoa de volta pelo idioma do sistema na próxima visita
        destino += ("&" if "?" in destino else "?") + "lang=" + L
        atual = ' style="color:var(--ink);font-weight:600"' if L == lang else ""
        itens.append(f'<a href="{destino}"{atual}>{L.upper()}</a>')
    return ('<span style="display:inline-flex;gap:9px;border-left:1px solid var(--line);padding-left:16px">'
            + "".join(itens) + "</span>")


def escrever_marca(root: pathlib.Path) -> None:
    """Despeja a identidade num JSON para o Next.js ler.

    O site saiu do Python e virou Next.js, mas a identidade NÃO saiu daqui: duas
    fontes de verdade para o nome da marca é exatamente o problema que este
    arquivo foi escrito para acabar. O build continua mandando — ele só passou a
    publicar o que sabe num formato que o TypeScript lê.

    `src/marca.json` é gerado, não editado. Quem precisa trocar o domínio troca a
    constante lá em cima e roda o build, como sempre foi.
    """
    import json
    dados = {
        "marca": MARCA, "marcaA": MARCA_A, "marcaB": MARCA_B,
        "site": SITE, "iconV": ICON_V,
        "empresa": EMPRESA, "cnpj": CNPJ, "contato": CONTATO,
        "encarregado": ENCARREGADO,
        "supaUrl": SUPA_URL, "supaKey": SUPA_KEY,
        "analytics": ANALYTICS,
        "licPub": LIC_PUB, "licPubAuto": LIC_PUB_AUTO,
    }
    arq = root / "src" / "marca.json"
    arq.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{arq.relative_to(root)}  (identidade para o Next)")

    # E o mapa de endereços, pelo mesmo motivo: o slug de cada página em cada
    # idioma decide o canonical, o hreflang, o sitemap e o seletor de idioma. Se
    # o Next tivesse a própria cópia, o dia em que um slug mudasse seria o dia em
    # que o sitemap passaria a mentir — em silêncio, que é o pior jeito.
    def so_o_js(bloco: str) -> str:
        """Tira o <script> de fora. No HTML antigo ele ia no <head> como texto;
        no Next quem escreve a tag é o React, e ele quer só o miolo."""
        return re.sub(r"^\s*<script>|</script>\s*$", "", bloco)

    # Quais idiomas têm vídeo do tour. Sai daqui, do lado que OLHA O DISCO, e não
    # de uma lista escrita à mão nos dois lugares que precisam da resposta. Foi
    # assim que o alemão e o francês ficaram meses vendo o tour em inglês depois
    # de o vídeo deles existir: o build.py conferia o arquivo e o lib/site.ts
    # tinha ['pt','en','es'] escrito dentro.
    com_tour = [L for L in IDIOMAS if (root / "public" / "demo" / f"tour.{L}.webm").exists()]
    # As sub-rotas do painel da conta, traduzidas. Elas são lidas pelo
    # `next.config.mjs` (que monta a ponte de reescrita) E pelo `lib/conta/nav.ts`
    # (que monta o menu). Duas tabelas para a mesma coisa é exatamente como o
    # alemão ficou sem hreflang e depois vendo o tour em inglês — então a tabela
    # mora aqui, e os dois lados leem.
    # O endereço da área do cliente em cada idioma.
    #
    # Ele existia escrito à mão em TRÊS lugares: no `lib/conta/textos.ts`, no
    # `next.config.mjs` e no `lib/site.ts`. Os dois primeiros tinham cinco
    # idiomas; o terceiro tinha três — e por isso o link "Sua conta" do rodapé
    # saía `undefined` nas páginas em alemão e em francês, num site que fala
    # cinco idiomas há semanas. Ninguém viu porque `undefined` num `href` não
    # quebra nada: só leva a lugar nenhum.
    sub_conta = {
        "roteiro":  {"pt": "roteiro",  "en": "cases",    "es": "casos",       "de": "testfaelle", "fr": "cas-de-test"},
        "faturas":  {"pt": "faturas",  "en": "invoices", "es": "facturas",    "de": "rechnungen", "fr": "factures"},
        "chamados": {"pt": "chamados", "en": "tickets",  "es": "incidencias", "de": "tickets",    "fr": "tickets"},
        "time":     {"pt": "time",     "en": "team",     "es": "equipo",      "de": "team",       "fr": "equipe"},
        "modelos":  {"pt": "modelos",  "en": "templates","es": "plantillas",  "de": "vorlagen",   "fr": "modeles"},
        "negocio":  {"pt": "negocio",  "en": "business", "es": "negocio",     "de": "geschaeft",  "fr": "activite"},
    }
    # As abas do back-office. Elas NÃO são traduzidas, e isto é uma decisão:
    # o `/negocio` é o escritório de UMA pessoa — o dono, checado pelo
    # WALKSTAMP_DONO. Traduzir "cobranças" para cinco idiomas que ninguém vai
    # abrir seria manutenção paga em cinco lugares para uma tela que tem um
    # leitor. O que é traduzido é o item do MENU (`navNegocio`), porque ele
    # divide a barra com itens que clientes leem.
    #
    # A lista mora aqui pelo mesmo motivo de todas as outras: o
    # `next.config.mjs` precisa dela para montar a ponte de reescrita de
    # `/conta/negocio/<aba>`, e o `lib/conta/negocio.ts` precisa dela para
    # montar a faixa de abas. Escrita nos dois, é uma aba que existe no menu e
    # dá 404 no clique.
    abas_negocio = ["contas", "cobrancas", "chamados", "interesse", "blog"]
    # OS ITENS DA BARRA LATERAL, na ordem em que aparecem.
    #
    # Eles moravam no `lib/conta/nav.ts`, e isso bastava enquanto a barra
    # existia num lugar só. Agora ela existe em DOIS: no painel, desenhado pelo
    # Next no servidor, e dentro da própria ferramenta, desenhada em JavaScript
    # no navegador. Duas listas para o mesmo menu é este projeto de novo: foi
    # assim que o alemão ficou sem `hreflang` e depois vendo o tour em inglês.
    #
    # `rotulo` é a CHAVE do dicionário (`src/i18n-conta.json`), nunca o texto.
    # Duas palavras diferentes, e a diferença é a estratégia inteira:
    #
    #   `exige`   o item APARECE para todo mundo, com cadeado para quem não tem.
    #             Um recurso escondido não é desejado: quem nunca viu o roteiro
    #             de casos no menu não tem por que querer o plano que o libera.
    #             Clicar leva a uma tela que explica o recurso e leva aos preços.
    #
    #   `quando`  o item NÃO EXISTE para quem não se encaixa. É só o `negocio`, e
    #             é outra coisa: uma aba de administração com cadeado anuncia a
    #             todo visitante que ela existe, e isso é o contrário de uma
    #             trava. Esconder ali não é venda, é segurança.
    # `icone` é `path` de SVG 24×24, separado por " M" quando tem mais de um.
    menu_conta = [
        {"slug": "", "rotulo": "navInicio",
         "icone": "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"},
        {"slug": "roteiro", "rotulo": "navRoteiro", "exige": "plano",
         "icone": "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5"},
        {"slug": "faturas", "rotulo": "navFaturas",
         "icone": "M6 2h12v20l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6"},
        {"slug": "chamados", "rotulo": "navChamados",
         "icone": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"},
        {"slug": "modelos", "rotulo": "navModelos", "exige": "time",
         "icone": "M4 4h9l4 4v12H4z M13 4v5h4 M8 13h6 M8 16h6"},
        {"slug": "time", "rotulo": "navTime", "exige": "time",
         "icone": "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"},
        {"slug": "negocio", "rotulo": "navNegocio", "quando": "dono",
         "icone": "M3 3v18h18 M7 15l4-4 3 3 5-6"},
    ]
    rotas = {"idiomas": IDIOMAS, "demoLangs": com_tour, "subConta": sub_conta,
             "abasNegocio": abas_negocio, "menuConta": menu_conta,
             "caminhoConta": CAMINHO_CONTA, "slugs": SLUGS,
             "metas": {pg: {L: {"titulo": m[L][0], "desc": m[L][1]} for L in IDIOMAS}
                       for pg, m in METAS.items()},
             "scripts": {"detectarIdioma": so_o_js(REDIRECT),
                         "lembrarIdioma": so_o_js(LEMBRAR)}}
    figs = {pg: figura_documento(c) for pg, c in CENARIO_DA_PAGINA.items()}
    figs["fluxo"] = figura_fluxo()
    figs["dobra"] = figura_dobra()
    (root / "src" / "figuras.json").write_text(
        json.dumps(figs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("src/figuras.json  (as figuras dos casos de uso, sem uma palavra dentro)")

    arq = root / "src" / "rotas.json"
    arq.write_text(json.dumps(rotas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{arq.relative_to(root)}  (endereços para o Next)")


def build_site(root: pathlib.Path) -> None:
    """Os arredores do site — o que não é página e precisa existir como arquivo.

      sitemap.xml   os hreflang de 45 endereços, que os testes leem do disco
      robots.txt    aponta para o sitemap
      manifest.webmanifest
      sw.js         precisa estar na raiz, senão o escopo do service worker encolhe
      support.js    a aba lateral, com os tokens já trocados

    As PÁGINAS saíram daqui. Quem as monta é o Next, a partir dos mesmos
    `src/site/*.html` e `src/i18n-site.json`. Durante a migração este arquivo
    ainda sabia gerá-las, para o `migracao.mjs` comparar as duas saídas página a
    página — 405 comparações, todas iguais. Feita a comparação, manter dois
    geradores em sincronia virou o custo sem o benefício: a primeira coisa que o
    Next passou a montar sozinho (a tabela de planos) já não teria par aqui, e um
    gerador que só quase acompanha é pior que nenhum.
    """
    import json
    dic = json.loads((root / "src" / "i18n-site.json").read_text(encoding="utf-8"))
    gerar_og(root, {L: dic[L] for L in IDIOMAS})
    modelo = (root / "src" / "site" / "home.html").read_text(encoding="utf-8")

    pre = {L: ("" if L == "pt" else "/" + L) for L in IDIOMAS}
    caminhos = {
        # o ?lang vai nos três: quem escolheu o idioma do site escolheu o do app.
        # Sem ele, um navegador em inglês abria o app em inglês mesmo vindo da
        # página em português — e a pessoa achava que era defeito.
        L: dict({"home": pre[L] or "/", "app": "/app?lang=" + L,
                 "root": "/",
                 # a área do cliente tem endereço traduzido como o resto do
                 # site: quem lê em espanhol não deveria ter que reconhecer a
                 # palavra "conta" para achar a própria fatura
                 # A área do cliente agora fala os cinco idiomas, como o resto.
                 "conta": CAMINHO_CONTA[L],
                 # `blog` é a mesma palavra nos cinco idiomas, então ele não
                 # entra na tabela de slugs traduzidos — ela existe para os
                 # casos em que a palavra muda.
                 "blog": (pre[L] or "") + "/blog"},
                **{pg: pre[L] + "/" + sl[L] for pg, sl in SLUGS.items()})
        for L in IDIOMAS
    }
    paginas = {L: dict({"home": caminhos[L]["home"]},
                       **{pg: caminhos[L][pg] for pg in SLUGS})
               for L in IDIOMAS}

    for lang in IDIOMAS:
        t = dict(dic[lang])
        t.update(caminhos[lang])
        t["site"] = SITE
        t["marca"] = MARCA
        t["marcaA"], t["marcaB"] = MARCA_A, MARCA_B
        t["ICONV"] = ICON_V
        t["analytics"] = ANALYTICS
        t["supaUrl"] = SUPA_URL
        t["supaKey"] = SUPA_KEY
        t["empresa"] = EMPRESA
        t["cnpj"] = CNPJ
        t["contato"] = CONTATO
        t["encarregado"] = ENCARREGADO
        t["selfPath"] = caminhos[lang]["home"]
        t["switcher"] = _switcher(lang, paginas, "home")
        # o link do comparativo vai montado aqui: colocar <a> dentro do JSON de
        # tradução quebraria o dia em que alguém trocar o caminho da página
        t["duoCompLinked"] = t["duoComp"].replace(
            "{0}", f'<a href="{caminhos[lang]["comparativo"]}" style="color:var(--accent)">').replace("{1}", "</a>")
        t["lang"] = lang
        # O vídeo do tour e o de exemplo existem em pt, en e es. Alemão e
        # francês entraram no site e NÃO no estúdio — e um `<video>` apontando
        # para um arquivo que não existe não é um vídeo faltando: é uma caixa
        # preta vazia no alto da home, que é a primeira coisa que a pessoa vê.
        # Cai no inglês até os dois serem gravados.
        t["demoLang"] = lang if (ROOT / "public" / "demo" / f"tour.{lang}.webm").exists() else "en"
        t["redirect"] = REDIRECT if lang == "pt" else LEMBRAR
        # A figura do fluxo, na home. Ela não tem uma palavra dentro; o que
        # muda por idioma é o rótulo de acessibilidade e a legenda.
        t["figuraFluxo"] = (figura_fluxo()
                            .replace("__ALT__", t.get("fluxoAlt", ""))
                            .replace("__LEG__", t.get("fluxoLeg", "")))
        # A figura da dobra principal. Sem legenda de propósito — ver o docstring
        # de `figura_dobra`.
        t["figuraDobra"] = figura_dobra().replace("__ALT__", t.get("dobraAlt", ""))

        html = modelo
        for k, v in t.items():
            html = html.replace("{{" + k + "}}", str(v))

        # `- chaves_do_render()` como na verificação das páginas internas, vinte
        # linhas abaixo. Sem isto, a home acusava `jsonld` — que é escrito pelo
        # `lib/site.ts` na hora de renderizar, e não pelo dicionário — e o build
        # PARAVA. As duas verificações fazem a mesma pergunta e precisavam já
        # estar fazendo do mesmo jeito; a de baixo já subtraía, a de cima não.
        faltando = set(re.findall(r"\{\{(\w+)\}\}", html)) - chaves_do_render()
        if faltando:
            print(f"AVISO: chaves sem tradução em {lang}: {sorted(faltando)}", file=sys.stderr)
            return 1


    # páginas internas: mesmo cabeçalho e rodapé, corpo escrito por idioma
    doc = (root / "src" / "site" / "doc.html").read_text(encoding="utf-8")
    for pagina, metas in METAS.items():
        for lang in IDIOMAS:
            corpo_arq = root / "src" / "site" / "bodies" / f"{pagina}.{lang}.html"
            if not corpo_arq.exists():
                print(f"AVISO: falta {corpo_arq.relative_to(root)}", file=sys.stderr)
                continue
            t = dict(dic[lang]); t.update(caminhos[lang])
            t["site"] = SITE
            t["marca"] = MARCA
            t["marcaA"], t["marcaB"] = MARCA_A, MARCA_B
            t["ICONV"] = ICON_V
            t["analytics"] = ANALYTICS
            t["supaUrl"] = SUPA_URL
            t["supaKey"] = SUPA_KEY
            t["empresa"] = EMPRESA
            t["cnpj"] = CNPJ
            t["contato"] = CONTATO
            t["encarregado"] = ENCARREGADO
            t["lang"] = lang
            t["docTitle"], t["docDesc"] = metas[lang]
            t["selfPath"] = caminhos[lang][pagina]
            t["ptPath"] = paginas["pt"][pagina]
            t["enPath"] = paginas["en"][pagina]
            t["esPath"] = paginas["es"][pagina]
            t["switcher"] = _switcher(lang, paginas, pagina)
            # A figura do documento, nas cinco páginas de caso de uso. Ela não
            # tem uma palavra dentro: serve aos cinco idiomas sem tradução.
            #
            # Esta volta NÃO escreve arquivo — quem serve estas páginas é o
            # Next, com o `lib/site.ts`. Ela existe só para conferir se falta
            # tradução, e por isso precisa montar as mesmas chaves que o Next
            # monta: faltando a `figura`, o conferente reclamava dela em quinze
            # linhas a cada build, e quinze linhas de aviso falso escondem o
            # aviso verdadeiro que aparecer no meio.
            if pagina in CENARIO_DA_PAGINA:
                t["figura"] = (figura_documento(CENARIO_DA_PAGINA[pagina])
                               .replace("__ALT__", t.get("figAlt", ""))
                               .replace("__LEG__", t.get("figLegenda", "")))

            corpo = corpo_arq.read_text(encoding="utf-8")
            for k, v in t.items():
                corpo = corpo.replace("{{" + k + "}}", str(v))
            t["body"] = corpo
            html = doc
            for k, v in t.items():
                html = html.replace("{{" + k + "}}", str(v))
            sobrando = set(re.findall(r"\{\{(\w+)\}\}", html)) - chaves_do_render()
            if sobrando:
                print(f"AVISO: chaves sem valor em {pagina}.{lang}: {sorted(sobrando)}", file=sys.stderr)

    # ---- O MAPA DAS PÁGINAS FIXAS ----
    #
    # A página do Steps Recorder só serve se for encontrada, e um site sem mapa
    # deixa o buscador adivinhar. As alternativas de idioma vão declaradas em
    # cada URL, senão as cinco versões competem entre si.
    #
    # ELE MUDOU DE NOME: era `sitemap.xml`, e virou `sitemap-paginas.xml`.
    #
    # O motivo é o blog. Um post publicado hoje precisa entrar no mapa hoje, e
    # este arquivo só é escrito quando alguém faz um deploy — um post publicado
    # pelo painel ficava fora do mapa até a próxima subida de código, que pode
    # ser semanas. Então `/sitemap.xml` passou a ser um ÍNDICE servido pelo
    # Next, apontando para dois mapas: este, que é fixo e nasce aqui, e o do
    # blog, que é lido do banco a cada rastreio.
    #
    # Um arquivo em `public/` chamado `sitemap.xml` sombrearia a rota — no Next
    # o estático ganha —, e por isso o nome mudou em vez de o índice ter outro.
    # E ele continua sendo um arquivo em disco de propósito: quatro testes o
    # leem sem subir servidor nenhum, e ler do disco é o que os mantém rápidos.
    #
    # `lastmod` entrou junto: sem ele o rastreador não tem como priorizar o que
    # mudou, e reprocessa quarenta e cinco páginas iguais toda vez. A data é a
    # do BUILD, que é literalmente quando estas páginas mudaram pela última vez.
    hoje = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    urls = []
    for pagina in ["home"] + list(SLUGS):
        for lang in IDIOMAS:
            alt = "".join(
                f'\n    <xhtml:link rel="alternate" hreflang="{L if L != "pt" else "pt-BR"}" '
                f'href="{SITE}{paginas[L][pagina]}"/>'
                for L in IDIOMAS)
            urls.append(f'  <url>\n    <loc>{SITE}{paginas[lang][pagina]}</loc>\n'
                        f'    <lastmod>{hoje}</lastmod>{alt}\n'
                        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{paginas["en"][pagina]}"/>\n'
                        f'  </url>')
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
               'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
               + "\n".join(urls) + "\n</urlset>\n")
    (root / "public" / "sitemap-paginas.xml").write_text(sitemap, encoding="utf-8")
    # O nome antigo sai do disco: enquanto ele existir, o Next serve o estático
    # e o índice nunca é alcançado — um defeito que não dá erro, só deixa o blog
    # fora do mapa em silêncio.
    antigo = root / "public" / "sitemap.xml"
    if antigo.exists():
        antigo.unlink()
    print(f"public/sitemap-paginas.xml  {len(sitemap)/1024:.1f} KB")

    # ---- PWA ----
    # "Instalar sem instalar": o atalho vai para a área de trabalho sem que a TI
    # precise aprovar um executável, e o cache resolve rede instável no meio de
    # uma gravação. O service worker é REDE-PRIMEIRO para as páginas: um app que
    # serve HTML velho de cache é pior que um app que não instala.
    manifest = {
        "name": MARCA, "short_name": MARCA,
        "description": {"pt": "Grave a tela e receba um documento com hora por passo.",
                        "en": "Record the screen and get a document with a time on every step.",
                        "es": "Graba la pantalla y recibe un documento con hora en cada paso."}["pt"],
        "start_url": "/app?lang=pt", "scope": "/", "display": "standalone",
        "background_color": "#f7f8fb", "theme_color": "#3A3F9E", "lang": "pt-BR",
        "icons": [
            {"src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
            {"src": f"/apple-touch-icon.png?v={ICON_V}", "sizes": "180x180", "type": "image/png"}
        ]
    }
    (root / "public" / "manifest.webmanifest").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("public/manifest.webmanifest")

    sw = """/* Service worker do %s.
   Rede primeiro para documentos: uma ferramenta que abre a versão de ontem
   depois de um deploy é pior do que uma que não instala. O cache existe para o
   caso de a rede cair no meio do trabalho, e para os arquivos estáticos.
   Ele NÃO guarda vídeo, áudio, transcrição nem documento gerado: nada disso
   passa por aqui, porque nada disso é uma requisição de rede. */
const CACHE = 'walkstamp-v%s';
const ESSENCIAIS = ['/app', '/site.css', '/favicon.svg', '/logo.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ns =>
    Promise.all(ns.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // CDN e modelo não passam por aqui
  e.respondWith(
    fetch(req).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('/app')))
  );
});
""" % (MARCA, ICON_V)
    (root / "public" / "sw.js").write_text(sw, encoding="utf-8")
    print("public/sw.js")

    robots = f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n"
    (root / "public" / "robots.txt").write_text(robots, encoding="utf-8")
    print("public/robots.txt")


    # support.js: o único texto do site que não vinha de template — e foi
    # exatamente onde o nome antigo sobreviveu à troca. Agora ele mora em src
    # com o token {{marca}} e é estampado aqui, como todo o resto.
    sup = (root / "src" / "site" / "support.js").read_text(encoding="utf-8")
    sup = sup.replace("{{marca}}", MARCA)
    (root / "public" / "support.js").write_text(sup, encoding="utf-8")
    print(f"public/support.js  {len(sup)/1024:.1f} KB")

    # A trava da troca de nome: nome antigo em qualquer página que não seja o
    # aviso histórico (termos e privacidade citam o ClipContext de propósito,
    # explicando a mudança) derruba o build em vez de ir parar no ar.
    #
    # A trava passou a olhar a FONTE, não só o que sai. Enquanto as 46 páginas
    # eram geradas aqui, varrer `public/` pegava tudo. Agora quem as monta é o
    # Next, e o que ele monta não existe em disco na hora do build — então a
    # varredura tem que ir onde o texto de verdade mora.
    permitidos = {"termos", "privacidade"}
    alvos = [*(root / "public").rglob("*"),
             *(root / "src" / "site").rglob("*"),
             *(root / "app").rglob("*"),
             *(root / "lib").rglob("*"),
             root / "src" / "i18n-site.json"]
    for arq in sorted(set(alvos)):
        if not arq.is_file():
            continue
        if arq.suffix not in (".html", ".js", ".mjs", ".ts", ".tsx", ".xml", ".txt", ".css", ".json"):
            continue
        if any(arq.name.startswith(p) for p in permitidos):
            continue
        if "clipcontext" in arq.read_text(encoding="utf-8", errors="ignore").lower():
            print(f"o nome antigo sobrou em {arq} — corrija a fonte", file=sys.stderr)
            return 1

    # A trava do token esquecido. Um __TOKEN__ que sobrevive ao build vira texto
    # literal na tela ou, pior, uma credencial que não existe e um botão que
    # falha só em produção. Barato de checar, caro de descobrir depois.
    saidas = [root / "public" / "app.html", root / "offline" / "walkstamp-offline.html"]
    for arq in saidas:
        sobrou = sorted(set(re.findall(r"__[A-Z][A-Z0-9_]*__", arq.read_text(encoding="utf-8"))))
        sobrou = [x for x in sobrou if x != "__JSPDF__"]
        if sobrou:
            print(f"token não substituído em {arq.relative_to(root)}: {', '.join(sobrou)}",
                  file=sys.stderr)
            return 1
    return 0


# ---------------------------------------------------------------------------
# A paleta das figuras.
#
# Eram sete cores escritas à mão — `#fff` para a folha, `#EEF0F7` para o
# preenchimento, e por aí. Isso funcionava enquanto ninguém olhava o site no
# modo escuro: lá as figuras viravam cartões brancos ACESOS num fundo quase
# preto, que é o defeito clássico de ilustração feita só à luz do dia.
#
# Agora vêm das mesmas variáveis do resto do site. Como o SVG é embutido no
# HTML — e não carregado por `<img>` — a variável de CSS alcança ele.
#
# Cuidado ao mexer: o gerador de og:image logo abaixo NÃO pode usar isto. Lá o
# PIL desenha pixel, não entende `var()`, e a imagem sairia em branco.
# ---------------------------------------------------------------------------
FIG_A = "var(--accent)"
FIG_PAPEL = "var(--panel)"
FIG_LIN = "var(--line)"
FIG_INK = "var(--ink)"
FIG_MUT = "var(--muted)"
FIG_ESC = "color-mix(in srgb, var(--ink) 8%, transparent)"
FIG_TXT = "color-mix(in srgb, var(--ink) 22%, transparent)"
FIG_TXT2 = "color-mix(in srgb, var(--ink) 42%, transparent)"
FIG_VERM = "#EF6E6E"


def figura_selo(cx: float, cy: float, r: float) -> str:
    """O selo de relógio da marca, do tamanho que pedirem.

    O anel de fora é da cor da folha, e não transparente: ele existe para abrir
    um buraco quando o selo cai em cima de outra coisa.
    """
    h = r * .46
    return (f'<circle cx="{cx}" cy="{cy}" r="{r + r * .26}" fill="{FIG_PAPEL}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{FIG_A}"/>'
            f'<path d="M{cx} {cy - h} V{cy} l{h * .68:.1f} {h * .45:.1f}" '
            f'stroke="{FIG_PAPEL}" stroke-width="{max(1.4, r * .2):.1f}" '
            f'stroke-linecap="round" stroke-linejoin="round" fill="none"/>')


def figura_dobra() -> str:
    """A dobra principal da home: a página que sai, e não o caminho até ela.

    O vídeo do tour logo abaixo já mostra o PROCESSO, e o desenho de fluxo lá no
    "#como" também. O que ninguém consegue ver antes de abrir a ferramenta é o
    RESULTADO — e é o resultado que faz querer. Por isso aqui é uma página
    pronta: três passos numerados, cada um com a imagem, o texto e a hora, uma
    tarja no segundo, e embaixo a linha do hash com o selo.

    A folha de trás não é enfeite: é o que diz "isto é um documento de várias
    páginas" sem precisar escrever a palavra em cinco idiomas.

    Não tem legenda, ao contrário das outras figuras. Numa dobra principal a
    legenda compete com a subida do texto e com o botão — o rótulo de
    acessibilidade basta.
    """
    p = []
    add = p.append

    add(f'<rect x="30" y="26" width="250" height="372" rx="10" fill="{FIG_PAPEL}" '
        f'stroke="{FIG_LIN}" opacity=".55"/>')
    add(f'<rect x="18" y="14" width="250" height="372" rx="10" fill="{FIG_PAPEL}" '
        f'stroke="{FIG_LIN}"/>')

    # o cabeçalho: marca, título, "válido a partir de"
    add(f'<rect x="38" y="34" width="15" height="15" rx="4" fill="{FIG_A}"/>')
    add(f'<rect x="59" y="37" width="62" height="6" rx="3" fill="{FIG_TXT2}"/>')
    add(f'<rect x="38" y="60" width="150" height="9" rx="4.5" fill="{FIG_TXT2}"/>')
    add(f'<rect x="38" y="76" width="96" height="6" rx="3" fill="{FIG_TXT}"/>')
    add(f'<line x1="38" y1="94" x2="248" y2="94" stroke="{FIG_LIN}"/>')

    y = 108
    for n, largura in enumerate([88, 70, 82], start=1):
        add(f'<circle cx="46" cy="{y + 8}" r="8" fill="{FIG_A}"/>')
        add(f'<text x="46" y="{y + 11.5}" font-family="system-ui,sans-serif" font-size="9" '
            f'font-weight="700" fill="{FIG_PAPEL}" text-anchor="middle">{n}</text>')
        add(f'<rect x="62" y="{y + 2}" width="{largura}" height="6" rx="3" fill="{FIG_TXT2}"/>')
        add(f'<rect x="62" y="{y + 16}" width="104" height="52" rx="5" fill="{FIG_ESC}" '
            f'stroke="{FIG_LIN}"/>')
        add(f'<rect x="70" y="{y + 24}" width="42" height="7" rx="2" fill="{FIG_TXT}"/>')
        # o segundo passo leva a tarja: é a marcação que a ferramenta faz, e ela
        # tem que aparecer na dobra, porque é metade do motivo de existir
        add(f'<rect x="70" y="{y + 38}" width="{38 if n == 2 else 52}" '
            f'height="{9 if n == 2 else 7}" rx="2" '
            f'fill="{FIG_TXT2 if n == 2 else FIG_TXT}"/>')
        add(f'<rect x="70" y="{y + 52}" width="30" height="7" rx="2" fill="{FIG_TXT}"/>')
        for i, w in enumerate([64, 58, 44]):
            add(f'<rect x="176" y="{y + 18 + i * 12}" width="{w}" height="5" rx="2.5" '
                f'fill="{FIG_TXT}"/>')
        # a hora, que é o que transforma uma captura de tela em prova
        add(f'<rect x="176" y="{y + 56}" width="40" height="12" rx="6" fill="{FIG_A}" '
            f'opacity=".14"/>')
        add(f'<rect x="182" y="{y + 60}" width="28" height="4" rx="2" fill="{FIG_A}"/>')
        y += 82

    add(f'<line x1="38" y1="{y - 2}" x2="248" y2="{y - 2}" stroke="{FIG_LIN}"/>')
    for i, w in enumerate([116, 92]):
        add(f'<rect x="38" y="{y + 10 + i * 11}" width="{w}" height="5" rx="2.5" '
            f'fill="{FIG_TXT}"/>')
    add(figura_selo(224, y + 16, 15))

    return ('<figure class="figDobra"><svg viewBox="0 0 300 412" role="img" '
            'aria-labelledby="figDobraT"><title id="figDobraT">__ALT__</title>'
            + "".join(p) + '</svg></figure>')


def figura_documento(cenario: str) -> str:
    """A página do documento, desenhada. Muda com o cenário, porque o documento muda.

    Sem uma palavra dentro: o que distingue um cenário do outro aqui é o que
    APARECE — a evidência tem hora de relógio e impressão digital, a instrução de
    trabalho tem passos numerados e nenhuma data, a ata tem duas vozes. Dizer
    isso em texto exigiria traduzir cinco vezes; mostrar não exige nada.
    """
    A, ESC, LIN, TXT = FIG_A, FIG_ESC, FIG_LIN, FIG_TXT
    p = []
    add = p.append

    # a banda da marca, no alto — o que mudou no PDF nesta rodada
    add(f'<rect x="24" y="22" width="16" height="16" rx="4" fill="{A}"/>')
    add(f'<rect x="27" y="25" width="10" height="6" rx="1.4" fill="{FIG_PAPEL}"/>')
    add(f'<rect x="27" y="33" width="10" height="1.6" rx=".8" fill="{FIG_PAPEL}"/>')
    add(f'<rect x="47" y="24.5" width="56" height="5.5" rx="2.75" fill="{A}"/>')
    add(f'<rect x="47" y="33" width="34" height="3.5" rx="1.75" fill="{TXT}"/>')
    add(f'<line x1="24" y1="48" x2="416" y2="48" stroke="{LIN}"/>')

    # o título do caso
    add(f'<rect x="24" y="60" width="186" height="9" rx="4.5" fill="{FIG_INK}"/>')

    # a identificação: linhas de rótulo e valor. A evidência tem quatro; o
    # contexto para IA não tem nenhuma — e é essa a diferença que se vê.
    linhas = {"evidencia": 4, "instrucao": 2, "ata": 2, "ux": 3, "ia": 0}.get(cenario, 3)
    y = 80
    for i in range(linhas):
        add(f'<rect x="24" y="{y}" width="46" height="4" rx="2" fill="{TXT}"/>')
        add(f'<rect x="78" y="{y}" width="{92 - (i % 3) * 16}" height="4" rx="2" fill="{FIG_MUT}"/>')
        y += 11
    if linhas:
        add(f'<line x1="24" y1="{y + 2}" x2="416" y2="{y + 2}" stroke="{LIN}"/>')
        y += 14
    else:
        y = 80

    # os passos: a tela, e ao lado a hora, a fala e a impressão digital
    passos = 2
    for n in range(passos):
        add(f'<rect x="24" y="{y}" width="150" height="86" rx="5" fill="{ESC}" stroke="{LIN}"/>')
        # dentro da tela, uma janelinha qualquer — só para não ser um bloco morto
        add(f'<rect x="34" y="{y + 10}" width="130" height="12" rx="2.5" fill="{FIG_PAPEL}"/>')
        add(f'<rect x="34" y="{y + 28}" width="58" height="48" rx="3" fill="{FIG_PAPEL}"/>')
        add(f'<rect x="98" y="{y + 28}" width="66" height="20" rx="3" fill="{FIG_PAPEL}"/>')
        add(f'<rect x="98" y="{y + 54}" width="66" height="22" rx="3" fill="{A}" opacity=".16"/>')

        # o número do passo, no canto
        add(f'<circle cx="34" cy="{y + 10}" r="9" fill="{A}"/>')
        add(f'<text x="34" y="{y + 13.6}" font-family="system-ui,sans-serif" font-size="10" '
            f'font-weight="700" fill="{FIG_PAPEL}" text-anchor="middle">{n + 1}</text>')

        # a coluna da direita
        yy = y + 4
        if cenario in ("evidencia", "ux", "ata"):
            # hora de relógio: um selo, porque é o que faz a evidência valer
            add(f'<rect x="188" y="{yy}" width="52" height="12" rx="6" fill="{A}" opacity=".12"/>')
            add(f'<rect x="196" y="{yy + 4.5}" width="36" height="3.5" rx="1.75" fill="{A}"/>')
            yy += 20
        for w in (196, 168, 140):
            add(f'<rect x="188" y="{yy}" width="{w}" height="4" rx="2" fill="{TXT}"/>')
            yy += 9
        if cenario in ("ata", "ux"):
            # duas vozes: a fala marcada com quem falou
            add(f'<rect x="188" y="{yy + 3}" width="10" height="4" rx="2" fill="{A}"/>')
            add(f'<rect x="202" y="{yy + 3}" width="150" height="4" rx="2" fill="{FIG_MUT}"/>')
            yy += 14
        else:
            add(f'<rect x="188" y="{yy + 3}" width="164" height="4" rx="2" fill="{FIG_MUT}"/>')
            yy += 14
        if cenario == "evidencia":
            # a impressão digital, em fonte de máquina
            add(f'<rect x="188" y="{yy + 2}" width="112" height="9" rx="2" fill="{ESC}"/>')
            add(f'<rect x="193" y="{yy + 5}" width="102" height="3" rx="1.5" fill="{TXT}"/>')
        y += 96

    # o rodapé da página
    add(f'<line x1="24" y1="{y + 6}" x2="416" y2="{y + 6}" stroke="{LIN}"/>')
    add(f'<rect x="24" y="{y + 12}" width="80" height="4" rx="2" fill="{TXT}"/>')
    add(f'<rect x="404" y="{y + 12}" width="12" height="4" rx="2" fill="{TXT}"/>')

    # A folha tem a altura do que coube dentro dela, e não um número fixo: a
    # evidência leva quatro linhas de identificação e o contexto para IA não
    # leva nenhuma, então uma altura só cortaria uma e sobraria na outra.
    alt = y + 28
    folha = (f'<rect x="1" y="1" width="438" height="{alt - 2}" rx="10" '
             f'fill="{FIG_PAPEL}" stroke="{FIG_LIN}"/>')
    # `__ALT__` e `__LEG__`, e não `{{...}}`: a troca de tokens é uma passada só
    # por chave, então um `{{figAlt}}` que só aparece DEPOIS de `{{figura}}` ser
    # trocada nunca seria alcançado. Quem monta a legenda é quem sabe o idioma.
    return (f'<figure class="figDoc"><svg viewBox="0 0 440 {alt}" role="img" '
            'aria-labelledby="figDocT"><title id="figDocT">__ALT__</title>'
            + folha + "".join(p) + '</svg><figcaption>__LEG__</figcaption></figure>')


def figura_fluxo() -> str:
    """Gravação → quadros e fala → documento, desenhada.

    A home explica isso em três parágrafos numerados, e a explicação é boa — mas
    a coisa é espacial: uma tela entra de um lado e uma página sai do outro, e
    entre as duas alguém joga fora o que não mudou. Um parágrafo conta; um
    desenho mostra em meio segundo.

    Sem uma palavra dentro, pelo mesmo motivo da figura do documento: cinco
    idiomas, um desenho.
    """
    A, ESC, LIN, TXT = FIG_A, FIG_ESC, FIG_LIN, FIG_TXT
    p = []
    add = p.append

    def seta(x):
        add(f'<path d="M{x} 62 h26 m-7 -6 l7 6 -7 6" stroke="{TXT}" stroke-width="2" '
            f'fill="none" stroke-linecap="round" stroke-linejoin="round"/>')

    # 1. a tela sendo gravada — o ponto vermelho é o que diz "isto está correndo"
    add(f'<rect x="6" y="18" width="132" height="88" rx="8" fill="{FIG_PAPEL}" stroke="{LIN}"/>')
    add(f'<rect x="6" y="18" width="132" height="16" rx="8" fill="{ESC}"/>')
    add(f'<rect x="6" y="26" width="132" height="8" fill="{ESC}"/>')
    add(f'<circle cx="18" cy="26" r="4" fill="{FIG_VERM}"/>')
    add(f'<rect x="30" y="23.5" width="30" height="5" rx="2.5" fill="{TXT}"/>')
    add(f'<rect x="18" y="44" width="52" height="34" rx="4" fill="{ESC}"/>')
    add(f'<rect x="78" y="44" width="48" height="15" rx="4" fill="{ESC}"/>')
    add(f'<rect x="78" y="65" width="48" height="13" rx="4" fill="{A}" opacity=".18"/>')
    add(f'<rect x="18" y="86" width="80" height="5" rx="2.5" fill="{ESC}"/>')
    seta(144)

    # 2. o que sobra da gravação: alguns quadros, e a fala embaixo. Dois ficam,
    #    um é descartado — é essa a decisão que a ferramenta toma sozinha.
    for i, (x, fora) in enumerate([(184, False), (232, True), (280, False)]):
        cor = FIG_PAPEL if not fora else ESC
        tr = ' opacity=".45"' if fora else ''
        add(f'<g{tr}><rect x="{x}" y="26" width="40" height="30" rx="4" fill="{cor}" stroke="{LIN}"/>')
        add(f'<rect x="{x + 5}" y="31" width="30" height="8" rx="2" fill="{ESC}"/>')
        add(f'<rect x="{x + 5}" y="43" width="18" height="8" rx="2" fill="{ESC}"/></g>')
        if fora:
            # o X do descarte, no quadro que não mudou o bastante
            add(f'<path d="M{x + 12} 34 l16 14 m0 -14 l-16 14" stroke="{TXT}" '
                f'stroke-width="2" stroke-linecap="round"/>')
    # a onda da fala, e a linha de transcrição embaixo dela
    ondas = [5, 11, 7, 14, 9, 6, 12, 8, 15, 7, 10, 6, 13, 9, 5, 11, 8, 6]
    for i, h in enumerate(ondas):
        add(f'<rect x="{184 + i * 7}" y="{78 - h / 2}" width="3" height="{h}" rx="1.5" '
            f'fill="{A}" opacity=".55"/>')
    add(f'<rect x="184" y="92" width="120" height="4" rx="2" fill="{TXT}"/>')
    add(f'<rect x="184" y="100" width="86" height="4" rx="2" fill="{TXT}"/>')
    seta(322)

    # 3. a página que sai
    add(f'<rect x="362" y="14" width="106" height="96" rx="7" fill="{FIG_PAPEL}" stroke="{LIN}"/>')
    add(f'<rect x="374" y="26" width="9" height="9" rx="2.5" fill="{A}"/>')
    add(f'<rect x="388" y="28" width="30" height="4" rx="2" fill="{A}"/>')
    add(f'<line x1="374" y1="42" x2="456" y2="42" stroke="{LIN}"/>')
    yy = 50
    for _ in range(2):
        add(f'<rect x="374" y="{yy}" width="34" height="22" rx="3" fill="{ESC}"/>')
        add(f'<rect x="414" y="{yy + 2}" width="42" height="3.5" rx="1.75" fill="{TXT}"/>')
        add(f'<rect x="414" y="{yy + 9}" width="34" height="3.5" rx="1.75" fill="{TXT}"/>')
        add(f'<rect x="414" y="{yy + 16}" width="42" height="3.5" rx="1.75" fill="{FIG_MUT}"/>')
        yy += 28
    return ('<figure class="figFluxo"><svg viewBox="0 0 474 124" role="img" '
            'aria-labelledby="figFluxoT"><title id="figFluxoT">__ALT__</title>'
            + "".join(p) + '</svg><figcaption>__LEG__</figcaption></figure>')


# ---------------------------------------------------------------------------
# A imagem de compartilhamento.
#
# Não existia nenhuma. Quem colava walkstamp.com no LinkedIn, no Slack ou no
# WhatsApp postava um retângulo cinza com o endereço embaixo — e um link sem
# imagem, numa linha do tempo, é um link que ninguém clica. Cada compartilhamento
# desperdiçado é o canal de crescimento de um produto sem cadastro sendo jogado
# fora.
#
# É PNG, e não SVG: LinkedIn e WhatsApp não renderizam SVG em prévia. É gerada
# no build, com a mesma marca e as mesmas cores do resto — e o texto vem do
# mesmo `i18n-site.json`, então ela fala o idioma da página compartilhada.
# ---------------------------------------------------------------------------

OG_FONTE_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
OG_FONTE_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _quebrar(desenho, texto, fonte, largura):
    """Quebra o texto na largura disponível. Sem isto, uma frase alemã sai pela
    borda da imagem — e alemão é onde as palavras são mais compridas."""
    linhas, atual = [], ""
    for palavra in texto.split():
        tenta = (atual + " " + palavra).strip()
        if desenho.textlength(tenta, font=fonte) <= largura:
            atual = tenta
        else:
            if atual:
                linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def gerar_og(root: pathlib.Path, textos_por_idioma: dict) -> None:
    """As imagens de compartilhamento, uma por idioma.

    Elas são PNG, e PNG não sai de f-string: precisa do Pillow. O Pillow está
    na máquina de quem escreve e NÃO está na máquina que publica — o Vercel
    monta com `python3 build.py && next build` e o que ele tem é o Python
    pelado. A primeira publicação depois de isto existir morreu com
    `ModuleNotFoundError: No module named 'PIL'`, e o site inteiro deixou de
    subir por causa de cinco imagens que já estavam no repositório.

    Então: os PNG são artefato COMMITADO, e esta função só os REFAZ. Sem
    Pillow ela confere se os cinco continuam lá e segue em frente.

    O que ela não faz é deixar passar em silêncio o caso que importa —
    Pillow ausente E imagem faltando —, porque aí a etiqueta `og:image`
    apontaria para um 404 e o link compartilhado abriria sem cartão, que é
    exatamente o defeito que estas imagens existem para não ter.
    """
    destino = root / "public" / "og"
    faltam = [L for L in textos_por_idioma if not (destino / f"og.{L}.png").exists()]
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ModuleNotFoundError:
        if faltam:
            print("ERRO: sem Pillow e sem as imagens de compartilhamento de "
                  + ", ".join(faltam)
                  + ". Instale com `pip install pillow` e monte de novo, ou traga "
                    "os PNG para public/og/.", file=sys.stderr)
            raise
        print("public/og/*.png  (mantidos: este ambiente não tem Pillow)")
        return

    destino.mkdir(parents=True, exist_ok=True)
    A = (58, 63, 158)
    INK = (31, 36, 48)
    MUTED = (92, 100, 115)
    LINHA = (230, 232, 238)

    for lang, t in textos_por_idioma.items():
        im = Image.new("RGB", (1200, 630), (247, 248, 250))
        d = ImageDraw.Draw(im)

        # a faixa de cima, como o cabeçalho do site
        d.rectangle([0, 0, 1200, 8], fill=A)

        # a marca: o símbolo e o nome, do mesmo desenho das outras telas —
        # inclusive o selo do relógio, que é o "stamp" do nome
        d.rounded_rectangle([76, 68, 148, 140], radius=17, fill=A)
        d.rounded_rectangle([91, 81, 133, 104], radius=4, fill=(255, 255, 255))
        d.rounded_rectangle([91, 111, 133, 116], radius=3, fill=(255, 255, 255))
        d.rounded_rectangle([91, 120, 116, 125], radius=3, fill=(190, 192, 226))
        d.ellipse([122, 114, 143, 135], fill=(255, 255, 255))
        d.ellipse([124, 116, 141, 133], fill=A)
        d.line([132, 120, 132, 125], fill=(255, 255, 255), width=2)
        d.line([132, 125, 136, 128], fill=(255, 255, 255), width=2)
        f_marca = ImageFont.truetype(OG_FONTE_B, 44)
        d.text((166, 78), MARCA_A, font=f_marca, fill=INK)
        larg_a = d.textlength(MARCA_A, font=f_marca)
        d.text((166 + larg_a, 78), MARCA_B, font=f_marca, fill=A)

        # a frase: o mesmo `h1` da home daquele idioma, sem as tags dentro —
        # o `h1` traz um `<br>` para quebrar a linha na home, e ele apareceria
        # escrito no meio da imagem
        frase = re.sub(r"<[^>]+>", " ", t.get("h1", MARCA))
        frase = re.sub(r"\s+", " ", frase).strip()
        f_h1 = ImageFont.truetype(OG_FONTE_B, 62)
        linhas = _quebrar(d, frase, f_h1, 1010)
        # com quatro linhas a frase encosta na tira de baixo; encolhe antes disso
        if len(linhas) > 3:
            f_h1 = ImageFont.truetype(OG_FONTE_B, 50)
            linhas = _quebrar(d, frase, f_h1, 1010)
        y = 214
        for ln in linhas[:4]:
            d.text((76, y), ln, font=f_h1, fill=INK)
            y += f_h1.size + 14

        # a linha de apoio, e o endereço
        f_sub = ImageFont.truetype(OG_FONTE_R, 27)
        sub = re.sub(r"<[^>]+>", " ", t.get("ogDesc") or t.get("desc") or "")
        sub = re.sub(r"\s+", " ", sub).strip()
        for ln in _quebrar(d, sub, f_sub, 1010)[:2]:
            d.text((76, y + 12), ln, font=f_sub, fill=MUTED)
            y += 38
        d.line([76, 546, 1124, 546], fill=LINHA, width=2)
        f_dom = ImageFont.truetype(OG_FONTE_B, 25)
        d.text((76, 566), SITE.split("//")[-1], font=f_dom, fill=A)

        im.save(destino / f"og.{lang}.png", "PNG", optimize=True)
    print(f"public/og/  ({len(textos_por_idioma)} imagens de compartilhamento)")


def sobras_que_tapam_o_site(root: pathlib.Path) -> list[str]:
    """Arquivos em `public/` que a Vercel serve ANTES das rotas do Next.

    O site já foi HTML estático gerado por este mesmo script, e naquele tempo a
    home morava em `public/index.html`. Quando ele virou Next.js esses arquivos
    deixaram de ser gerados — mas quem atualiza a pasta descompactando um zip
    por cima NUNCA os apaga, porque descompactar acrescenta e sobrescreve, não
    remove.

    O sintoma é cruel de diagnosticar: a home em português abre a versão de dois
    meses atrás, e /en, /es, /de e /fr abrem a nova. A pessoa publica, confere o
    /en, vê que está certo, e continua com uma home velha no ar. Arquivo estático
    ganha de rota, e ganha em silêncio.

    Por isso isto DERRUBA o build em vez de avisar: um build que passa e publica
    a página errada é pior do que um que para e diz qual arquivo apagar.
    """
    pub = root / "public"
    if not pub.is_dir():
        return []
    achados = []
    # `app.html` é a ferramenta, e é para ser servida assim mesmo.
    for f in sorted(pub.rglob("*.html")):
        if f.name == "app.html" and f.parent == pub:
            continue
        achados.append(str(f.relative_to(root)))
    # e as pastas por idioma, que tapariam /en, /es, /de, /fr inteiros
    for L in IDIOMAS:
        if L != "pt" and (pub / L).is_dir():
            achados.append(str((pub / L).relative_to(root)) + "/")
    return achados


def main() -> int:
    template = ROOT / "src" / "template.html"
    vendor = ROOT / "vendor" / "jspdf.umd.min.js"

    sobras = sobras_que_tapam_o_site(ROOT)
    if sobras:
        print("", file=sys.stderr)
        print("ERRO: há arquivo estático em public/ tapando uma rota do site.", file=sys.stderr)
        print("", file=sys.stderr)
        for f in sobras:
            print("   " + f, file=sys.stderr)
        print("", file=sys.stderr)
        print("Isto é sobra do tempo em que o site era HTML gerado. A Vercel serve", file=sys.stderr)
        print("arquivo antes de rota, então a página velha ganha da nova — e ganha", file=sys.stderr)
        print("calada. Apague os arquivos acima e publique de novo.", file=sys.stderr)
        print("", file=sys.stderr)
        return 1

    for path in (template, vendor):
        if not path.exists():
            print(f"faltando: {path}", file=sys.stderr)
            return 1

    src = template.read_text(encoding="utf-8")
    src = src.replace("__MARCA__", MARCA)
    src = src.replace("__CONTATO__", CONTATO)
    src = src.replace("__EMPRESA__", EMPRESA).replace("__CNPJ__", CNPJ)
    src = src.replace("__MARCAA__", MARCA_A).replace("__MARCAB__", MARCA_B)
    src = src.replace("__SITE__", SITE)                      # domínio público, definido no topo
    src = src.replace("__SITEDOM__", SITE.split("//")[-1])  # o mesmo, sem o esquema, para exibir
    src = src.replace("__ICONV__", ICON_V)
    # O carimbo da versão. Ele entra no app e no offline pelo mesmo caminho de
    # todo o resto: um token no template, trocado aqui.
    VER = versao_do_build(ROOT)
    src = src.replace("__VERSAO__", VER)
    print(f"versão do build: {VER}")

    # ---- O RODAPÉ DA FERRAMENTA, igual ao do site ----
    #
    # A ferramenta tinha um rodapé de UMA linha com três links, enquanto o site
    # e a área do cliente tinham três colunas com dezesseis. São a mesma marca e
    # o pulo entre elas acontece o tempo todo — o site é onde se lê e a
    # ferramenta é onde se faz.
    #
    # Os endereços e os rótulos são INJETADOS aqui, e não escritos no template:
    # a ferramenta é um arquivo só que abre de `file://` e troca de idioma sem
    # recarregar, então ela precisa da tabela inteira dentro dela. Escrita à mão
    # lá, seria a enésima cópia — e a que existia tinha QUATRO páginas das
    # dezesseis, todas as outras apontando para o português em qualquer idioma.
    rotas_app = {}
    for pg, sl in SLUGS.items():
        rotas_app[pg] = {L: (("" if L == "pt" else "/" + L) + "/" + sl[L]) for L in IDIOMAS}
    rotas_app["blog"] = {L: (("" if L == "pt" else "/" + L) + "/blog") for L in IDIOMAS}
    # A home não tem slug — ela É a raiz do idioma —, e por isso ficava de fora
    # da tabela. O cabeçalho da ferramenta precisa dela: "Como funciona" é uma
    # âncora dentro da home, e sem esta linha o link nascia vazio.
    rotas_app["home"] = {L: ("/" if L == "pt" else "/" + L) for L in IDIOMAS}
    rotas_app["conta"] = dict(CAMINHO_CONTA)
    src = src.replace("__ROTAS_SITE__", json.dumps(rotas_app, ensure_ascii=False))

    # Os rótulos do rodapé saem do dicionário do SITE, para as duas telas
    # dizerem as mesmas palavras. Só as chaves usadas — mandar o dicionário
    # inteiro seriam dezenas de KB dentro de um arquivo que já tem 900.
    # `navHow`, `navComp` e `navPrice` entraram aqui pelo mesmo motivo que o
    # rodapé entrou: o CABEÇALHO da ferramenta também passou a ser o do site, e
    # as palavras dele não podem ser uma segunda tradução escrita à mão dentro
    # do template. Um menu que diz "Preços" no site e "Planos" na ferramenta é
    # a mesma marca falando duas línguas.
    CHAVES_RODAPE = ["fColProduto", "fColCasos", "fColConfianca",
                     "navHow", "navComp",
                     "navApp", "navPrice", "fAjuda", "fBlog", "fComp", "fConta",
                     "casoEvT", "casoInT", "casoAtaT", "casoUxT", "casoIaT",
                     "fSec", "fVerif", "fPriv", "fTerms", "fPsr"]
    i18n_site = json.loads((ROOT / "src" / "i18n-site.json").read_text(encoding="utf-8"))
    rodape_txt = {L: {k: i18n_site[L].get(k, k) for k in CHAVES_RODAPE} for L in IDIOMAS}
    src = src.replace("__RODAPE_TXT__", json.dumps(rodape_txt, ensure_ascii=False))
    # a chave PÚBLICA da licença vale nos dois builds: ela só confere assinatura
    src = src.replace("__LICPUB__", LIC_PUB)
    src = src.replace("__LICPUBAUTO__", LIC_PUB_AUTO)
    if MARKER not in src:
        print(f"marcador {MARKER} não encontrado em src/template.html", file=sys.stderr)
        return 1

    # build web: metadados de SEO + jsPDF do CDN + medição
    web = src.replace(MARKER, f'<script src="{CDN}"></script>')
    if PLAIN_TITLE in web:
        web = web.replace(PLAIN_TITLE, META)
    web = web.replace("__SUPAURL__", SUPA_URL).replace("__SUPAKEY__", SUPA_KEY)
    web = (web.replace("__GCLIENT__", G_CLIENT)
              .replace("__GKEY__", G_KEY)
              .replace("__GAPP__", G_APP))
    web = web.replace("<!--__ANALYTICS__-->", ANALYTICS)
    out_web = ROOT / "public" / "app.html"
    out_web.parent.mkdir(exist_ok=True)
    out_web.write_text(web, encoding="utf-8")

    # build offline: biblioteca embutida, sem nenhuma dependência de rede para o
    # PDF — e sem endereço de medição nenhum. As strings vazias fazem o `medir()`
    # sair pelo primeiro `if` e o snippet do Vercel simplesmente não existir.
    lib = vendor.read_text(encoding="utf-8")
    offline = src.replace(MARKER, f"<script>{lib}</script>")
    offline = offline.replace("__SUPAURL__", "").replace("__SUPAKEY__", "")
    for tok in ("__GCLIENT__", "__GKEY__", "__GAPP__"):
        offline = offline.replace(tok, "")
    offline = offline.replace("<!--__ANALYTICS__-->", "")
    # o arquivo único é aberto de file://: manifesto e service worker não têm
    # origem para existir ali, e um <link> apontando para /manifest.webmanifest
    # só produziria um 404 no console de quem o abrir
    offline = offline.replace('<link rel="manifest" href="/manifest.webmanifest">\n', "")
    out_off = ROOT / "offline" / "walkstamp-offline.html"
    out_off.parent.mkdir(exist_ok=True)
    out_off.write_text(offline, encoding="utf-8")

    # Trava, não conferência: se um dia alguém colar um endereço direto no
    # template, o build quebra em vez de publicar um "offline" que telefona.
    for proibido in ("supabase.co", "_vercel/insights"):
        if proibido in offline:
            print(f"o build offline contém {proibido!r} — ele tem que ser mudo", file=sys.stderr)
            return 1

    for path in (out_web, out_off):
        print(f"{path.relative_to(ROOT)}  {len(path.read_text(encoding='utf-8')) / 1024:.1f} KB")

    escrever_marca(ROOT)

    return build_site(ROOT) or 0


if __name__ == "__main__":
    raise SystemExit(main())
