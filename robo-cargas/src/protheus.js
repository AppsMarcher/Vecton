// Acesso somente-leitura ao SQL Server do Protheus.
// auth "windows": usa a conta do Windows que roda o robo (msnodesqlv8 + driver ODBC).
// auth "sql": usuario/senha (tedious).
import sql from "mssql";

export async function consultar(cfg, queryText) {
  const p = cfg.protheus;
  const timeout = (p.timeoutSeconds || 600) * 1000;
  let pool;
  if (p.auth === "windows") {
    const msnode = await import("mssql/msnodesqlv8.js").then((m) => m.default || m).catch(() => {
      throw new Error("Autenticacao Windows requer o pacote msnodesqlv8 (npm install) e o ODBC Driver for SQL Server.");
    });
    pool = await new msnode.ConnectionPool({
      connectionString: `Driver={${p.odbcDriver || "ODBC Driver 17 for SQL Server"}};Server=${p.server};Database=${p.database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`,
      requestTimeout: timeout
    }).connect();
  } else {
    pool = await new sql.ConnectionPool({
      server: p.server, database: p.database, user: p.user, password: p.password,
      options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true },
      requestTimeout: timeout
    }).connect();
  }
  try {
    const res = await pool.request().query(queryText);
    return res.recordset;
  } finally {
    await pool.close();
  }
}
