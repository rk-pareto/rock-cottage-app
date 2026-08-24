#!/usr/bin/env node
// Usage: node _planning/task.mjs status T003 done ["optional note"]
//        node _planning/task.mjs list [phase|status]
import { readFileSync, writeFileSync } from "node:fs";
const FILE = new URL("./tasks.jsonl", import.meta.url);
const rows = readFileSync(FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "status") {
  const [id, status, note] = args;
  const ids = id.split(",");
  for (const row of rows) {
    if (ids.includes(row.id)) {
      row.status = status;
      if (note) row.notes = note;
    }
  }
  writeFileSync(FILE, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`updated ${ids.join(", ")} -> ${status}`);
} else {
  const filter = args[0];
  const shown = filter ? rows.filter((r) => r.phase.includes(filter) || r.status === filter) : rows;
  for (const r of shown) console.log(`${r.status.padEnd(8)} ${r.id}  ${r.title}`);
  const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  console.log("\n" + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  ·  "));
}
