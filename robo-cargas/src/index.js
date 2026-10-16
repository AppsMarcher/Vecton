#!/usr/bin/env node
// Uso:
//   node src/index.js run                       roda as cargas cujo horario venceu (Agendador de Tarefas, a cada 15 min)
//   node src/index.js vendas --dry-run          simula: extrai do Protheus, mostra o resumo e NAO grava no Vecton
//   node src/index.js vendas                    carrega agora (se a carga estiver ligada)
//   node src/index.js vendas --mes=2026-10      mes especifico (manual)
//   node src/index.js relatorio --dry-run      monta o Painel de Vendas e salva o html em logs/ (NAO envia)
//   node src/index.js relatorio --force        envia o Painel agora, ignorando dia, horario e "ativo"
//   --force                                     ignora a protecao de queda anormal
import { loadConfig } from "./config.js";
import { executar, conectar } from "./runner.js";
import { executarPainelVendas } from "./relatorios/painelVendas.js";

const args = process.argv.slice(2);
const comando = args.find((a) => !a.startsWith("--"));
const flag = (n) => args.includes(`--${n}`);
const mesArg = args.find((a) => a.startsWith("--mes="))?.split("=")[1];

if (!comando) {
  console.error("Informe o comando: run | vendas  (veja o cabecalho de src/index.js)");
  process.exit(2);
}

try {
  const cfg = loadConfig();
  let mes = null;
  if (mesArg) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(mesArg);
    if (!m) throw new Error("--mes deve ser AAAA-MM");
    mes = { ano: +m[1], mes: +m[2] };
  }
  let resultados = [];
  if (comando !== "relatorio") {
    resultados = await executar(cfg, {
      jobNome: comando === "run" ? null : comando,
      agenda: comando === "run",
      dryRun: flag("dry-run"),
      force: flag("force"),
      mes
    });
  }
  // Envio semanal do Painel de Vendas (agenda e destinatarios na tela Parametros > Notificacoes): junto da rodada
  // agendada ou sob demanda. Uma falha aqui nao interfere nas cargas acima, mas faz a tarefa terminar com erro.
  if (comando === "run" || comando === "relatorio") {
    try {
      const ctx = await conectar(cfg);
      const r = await executarPainelVendas(cfg, ctx, { dryRun: flag("dry-run"), force: flag("force") });
      resultados.push({ job: "relatorio_painel_vendas", ...r });
    } catch (e) {
      console.error(`relatorio_painel_vendas: ${e.message}`);
      resultados.push({ job: "relatorio_painel_vendas", status: "erro", mensagem: e.message });
    }
  }
  // exitCode (em vez de exit): deixa o Node fechar as conexoes sozinho; process.exit derruba o libuv no Windows.
  process.exitCode = resultados.some((r) => r.status === "erro" || r.status === "bloqueada") ? 1 : 0;
} catch (e) {
  console.error(`ERRO: ${e.message}`);
  process.exitCode = 1;
}
