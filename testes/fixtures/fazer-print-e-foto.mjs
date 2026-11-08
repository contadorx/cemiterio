// Renderiza um comprovante de Pix como um app de banco desenha, tira print no
// tamanho de um celular e comprime como o WhatsApp comprime.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
const { chromium } = pw;
const html = `<!doctype html><meta charset="utf-8">
<style>
 body{margin:0;font:400 15px/1.5 -apple-system,Roboto,Arial;background:#fff;color:#111;width:390px}
 .top{background:#8a05be;color:#fff;padding:18px 20px;font-weight:700;font-size:17px}
 .wrap{padding:20px}
 .v{font-size:28px;font-weight:700;margin:6px 0 2px}
 .lbl{color:#777;font-size:12.5px;text-transform:uppercase;letter-spacing:.4px;margin-top:18px}
 .val{font-size:15px}
 hr{border:0;border-top:1px solid #eee;margin:16px 0}
 .id{font-size:11.5px;color:#666;word-break:break-all}
</style>
<div class="top">Comprovante de transferência</div>
<div class="wrap">
  <div class="lbl">Valor</div>
  <div class="v">R$ 40,00</div>
  <div class="val">07 de novembro de 2026 - 14:32</div>
  <hr>
  <div class="lbl">Pagador</div>
  <div class="val">Katia Ferreira dos Santos</div>
  <div class="val">CPF ***.123.456-**</div>
  <div class="val">Banco Exemplo S.A.</div>
  <hr>
  <div class="lbl">Recebedor</div>
  <div class="val">Sureya Servicos de Limpeza</div>
  <div class="val">CNPJ **.345.678/0001-**</div>
  <hr>
  <div class="lbl">Data da transacao</div>
  <div class="val">07/11/2026</div>
  <div class="lbl">ID da transacao</div>
  <div class="id">E18236120202611071432abcdef012ab</div>
</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
await p.setContent(html);
// qualidade 62: o WhatsApp comprime forte, e a media dos 67 arquivos e 125 KB.
await p.screenshot({ path: "comprovante-print.jpg", type: "jpeg", quality: 62, fullPage: true });
await b.close();
// A FOTO DA TELA: quem nao sabe tirar print fotografa o celular com outro
// celular. Sai torta, com brilho irregular, reflexo e o moire da tela.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
const { chromium } = pw;
const recibo = `
 <div class="tela">
  <div class="top">Comprovante de transferência</div>
  <div class="wrap">
    <div class="lbl">Valor</div><div class="v">R$ 40,00</div>
    <div class="val">07 de novembro de 2026 - 14:32</div><hr>
    <div class="lbl">Pagador</div>
    <div class="val">Katia Ferreira dos Santos</div>
    <div class="val">CPF ***.123.456-**</div><hr>
    <div class="lbl">Recebedor</div>
    <div class="val">Sureya Servicos de Limpeza</div><hr>
    <div class="lbl">Data da transacao</div><div class="val">07/11/2026</div>
    <div class="lbl">ID da transacao</div>
    <div class="id">E18236120202611071432abcdef012ab</div>
  </div>
 </div>`;
const html = `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#2b2b2e;width:420px;height:820px;overflow:hidden;
      font:400 15px/1.5 -apple-system,Roboto,Arial}
 .tela{width:390px;background:#fff;color:#111;
   transform:rotate(-2.4deg) perspective(900px) rotateY(7deg) scale(.94);
   transform-origin:50% 40%;margin:30px 0 0 14px;box-shadow:0 0 40px #000}
 .top{background:#8a05be;color:#fff;padding:18px 20px;font-weight:700;font-size:17px}
 .wrap{padding:18px}
 .v{font-size:27px;font-weight:700;margin:6px 0 2px}
 .lbl{color:#777;font-size:12.5px;text-transform:uppercase;letter-spacing:.4px;margin-top:16px}
 .val{font-size:15px} hr{border:0;border-top:1px solid #eee;margin:14px 0}
 .id{font-size:11.5px;color:#666;word-break:break-all}
 /* reflexo da janela + brilho irregular da foto */
 .luz{position:fixed;inset:0;pointer-events:none;
   background:linear-gradient(118deg,rgba(255,255,255,.34) 0 16%,rgba(255,255,255,0) 34%),
              radial-gradient(60% 45% at 78% 22%,rgba(255,255,255,.22),rgba(0,0,0,.22) 70%)}
 /* o moire da tela fotografada */
 .moire{position:fixed;inset:0;pointer-events:none;opacity:.22;
   background:repeating-linear-gradient(0deg,rgba(0,0,0,.5) 0 1px,transparent 1px 3px)}
 .borrao{filter:blur(.7px) contrast(.93) saturate(.9)}
</style><div class="borrao">${recibo}</div><div class="luz"></div><div class="moire"></div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 1 });
await p.setContent(html);
await p.screenshot({ path: "comprovante-foto.jpg", type: "jpeg", quality: 48 });
await b.close();
