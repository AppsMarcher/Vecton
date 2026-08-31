import fs from "node:fs";

const sqlPath = "supabase/139_seed_kpi_actuals_jan_jul_2026.sql";
const catalogPath = "tools/strategic-a3-catalog-2026.json";
const sql = fs.readFileSync(sqlPath, "utf8");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const rowPattern = /^  \('([^']+)', '([^']+)', '([^']+)', array\[([^\]]*)\]::numeric\[\], (?:null|'(?:[^']|'')*')\)[,;]$/gm;
const rows = [...sql.matchAll(rowPattern)].map((match) => ({
  code: match[1],
  sheet: match[2],
  range: match[3],
  values: match[4].split(",").map((value) => {
    const trimmed = value.trim();
    return trimmed === "null" ? null : Number(trimmed);
  }),
}));

const failures = [];
if (rows.length !== 57) failures.push(`expected 57 series, got ${rows.length}`);
if (new Set(rows.map((row) => row.code)).size !== rows.length) failures.push("duplicate KPI code");
if (rows.some((row) => row.values.length !== 7)) failures.push("series without exactly seven months");
if (rows.some((row) => row.values.some((value) => value !== null && !Number.isFinite(value)))) failures.push("invalid numeric value");

const actualCount = rows.reduce((count, row) => count + row.values.filter((value) => value !== null).length, 0);
if (actualCount !== 376) failures.push(`expected 376 actuals, got ${actualCount}`);

const catalogByCode = new Map(catalog.kpis.map((kpi) => [kpi.code, kpi]));
const missingCodes = rows.filter((row) => !catalogByCode.has(row.code)).map((row) => row.code);
if (missingCodes.length) failures.push(`codes missing from catalog: ${missingCodes.join(", ")}`);

const percentOutOfRange = rows
  .filter((row) => catalogByCode.get(row.code)?.unit === "percent")
  .flatMap((row) => row.values
    .map((value, index) => ({ code: row.code, month: index + 1, value }))
    .filter(({ value }) => value !== null && (value < -1 || value > 1)));
if (percentOutOfRange.length) failures.push(`percent values outside -1..1: ${JSON.stringify(percentOutOfRange)}`);

if ((sql.match(/^begin;$/gm) || []).length !== 1) failures.push("expected one begin");
if ((sql.match(/^commit;$/gm) || []).length !== 1) failures.push("expected one commit");
if ((sql.match(/^do \$\$$/gm) || []).length !== 2) failures.push("expected two validation blocks");

console.log(JSON.stringify({
  series: rows.length,
  actuals: actualCount,
  catalogKpis: catalog.kpis.length,
  omittedKpis: catalog.kpis.length - rows.length,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
