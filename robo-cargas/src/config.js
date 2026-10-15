import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(path = process.env.ROBO_CONFIG || join(ROOT, "config.json")) {
  if (!existsSync(path)) {
    throw new Error(`Arquivo de configuracao nao encontrado: ${path} (copie config.example.json para config.json)`);
  }
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  const pass = (envName) => (envName ? process.env[envName] || "" : "");
  cfg.supabase.password = pass(cfg.supabase.passwordEnv);
  cfg.protheus.password = pass(cfg.protheus.passwordEnv);
  cfg.timezone ||= "America/Sao_Paulo";
  if (!cfg.supabase.password) throw new Error(`Variavel de ambiente ${cfg.supabase.passwordEnv} (senha do usuario do Vecton) nao definida`);
  if (cfg.protheus.auth === "sql" && !cfg.protheus.password) throw new Error(`Variavel de ambiente ${cfg.protheus.passwordEnv} (senha do SQL Server) nao definida`);
  return cfg;
}

export const ROOT_DIR = ROOT;
