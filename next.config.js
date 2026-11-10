/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ---------------------------------------------------------------------------
  // O OCR PRECISA DE ARQUIVOS QUE O RASTREADOR NÃO VÊ (0166).
  //
  // O Next decide o que empacotar seguindo os `import`. O Tesseract carrega o
  // motor (.wasm) e os dados de português (.traineddata.gz) em tempo de
  // execução, por caminho montado na hora — nenhum `import` aponta para eles.
  // Sem estas linhas o build passa, o deploy sobe, e a primeira foto que
  // chegar falha em produção procurando um arquivo que ficou para trás.
  //
  // É o tipo de defeito que não aparece em teste nenhum daqui: só na função
  // já publicada, com o comprovante de uma família na mão.
  // ---------------------------------------------------------------------------
  outputFileTracingIncludes: {
    "/api/webhook/evolution": [
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/**",
      "./node_modules/@tesseract.js-data/por/4.0.0_best_int/**",
    ],
    "/api/comprovantes/ler": [
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/**",
      "./node_modules/@tesseract.js-data/por/4.0.0_best_int/**",
    ],
  },
};

module.exports = nextConfig;
