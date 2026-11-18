// Carrega sob demanda as bibliotecas pesadas (planilhas e PDF), só quando alguém importa
// ou exporta. Antes iam todas no <head> e custavam ~2 MB em toda abertura do app.
// Cada arquivo tem versão fixa + SRI (o navegador recusa se o conteúdo mudar).
// Ao atualizar uma biblioteca: trocar a versão em `src` e recalcular o hash com
//   openssl dgst -sha384 -binary arquivo | openssl base64 -A
// Uso: await window.VectonLibs.ensure("xlsx" | "exceljs" | "pdfjs");
(function (global) {
  const LIBS = {
    xlsx: {
      globalName: "XLSX",
      label: "leitura de planilhas",
      src: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      integrity: "sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"
    },
    exceljs: {
      globalName: "ExcelJS",
      label: "geração de Excel",
      src: "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
      integrity: "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz"
    },
    pdfjs: {
      globalName: "pdfjsLib",
      label: "leitura de PDF",
      src: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
      integrity: "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e"
    }
  };

  const pending = new Map();

  function ensure(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error(`Biblioteca desconhecida: ${name}`));
    // Já presente (carregada antes, ou injetada por um teste): não baixa de novo.
    if (global[lib.globalName]) return Promise.resolve(global[lib.globalName]);
    if (pending.has(name)) return pending.get(name);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = lib.src;
      script.integrity = lib.integrity;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = () => {
        if (global[lib.globalName]) resolve(global[lib.globalName]);
        else { pending.delete(name); reject(new Error(`A biblioteca de ${lib.label} carregou, mas não ficou disponível.`)); }
      };
      script.onerror = () => {
        pending.delete(name); // permite tentar de novo depois
        script.remove();
        reject(new Error(`Não foi possível carregar a biblioteca de ${lib.label}. Verifique a conexão e tente de novo.`));
      };
      document.head.appendChild(script);
    });
    pending.set(name, promise);
    return promise;
  }

  global.VectonLibs = { ensure };
})(window);
