#!/usr/bin/env node
// Gate CI của ShopLite. Mỗi job trong .github/workflows/ci.yml gọi đúng một lệnh:
//   node scripts/ci/gate.mjs <lint|unit|e2e|bao-mat>
// Gate tất định: cùng code thì cùng kết quả. Exit 0 = xanh, khác 0 = đỏ.
// Ghi lại bằng chứng: gate-<job>.log (toàn bộ output) và gate-<job>.json (tóm tắt từng bước).
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const GATES = { lint, unit, e2e, "bao-mat": baoMat };

// Sàn coverage: đặt thấp hơn số đo thật ~1 điểm (đo ngày 2026-11-22: lines 96.35,
// statements 95.12, functions 92.6, branches 91.83). Chỉ được nâng, không hạ để cho xanh.
const COVERAGE_FLOOR = { lines: 95, statements: 94, functions: 91, branches: 90 };

const job = process.argv[2];
if (!GATES[job]) {
  console.error(`Cách dùng: node scripts/ci/gate.mjs <${Object.keys(GATES).join("|")}>`);
  process.exit(2);
}

const LOG = `gate-${job}.log`;
const SUMMARY = `gate-${job}.json`;
const steps = [];
writeFileSync(LOG, "");

function log(line = "") {
  process.stdout.write(`${line}\n`);
  appendFileSync(LOG, `${line}\n`);
}

function record(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  return ok;
}

// Chạy một lệnh, đẩy output ra console và vào file log. Không bao giờ throw.
function run(cmd, args, { env = {} } = {}) {
  log(`\n$ ${[cmd, ...args].join(" ")}`);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    let out = "";
    const onData = (chunk) => {
      const s = chunk.toString();
      out += s;
      process.stdout.write(s);
      appendFileSync(LOG, s);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => {
      onData(`${err.message}\n`);
      resolve({ code: 127, out });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

async function step(name, cmd, args, opts) {
  const { code } = await run(cmd, args, opts);
  return record(name, code === 0, code === 0 ? "" : `exit ${code}`);
}

// ---------------------------------------------------------------------------
// lint: ESLint + TypeScript
// ---------------------------------------------------------------------------
async function lint() {
  await step("eslint", "npx", ["eslint", "."]);
  await step("typecheck", "npm", ["run", "typecheck"]);
}

// ---------------------------------------------------------------------------
// unit: Vitest + sàn coverage
// ---------------------------------------------------------------------------
async function unit() {
  const dir = "coverage";
  const ok = await step("vitest", "npx", [
    "vitest",
    "run",
    "--coverage",
    "--coverage.reporter=text-summary",
    "--coverage.reporter=json-summary",
    `--coverage.reportsDirectory=${dir}`,
  ]);
  const file = path.join(dir, "coverage-summary.json");
  if (!existsSync(file)) {
    record("coverage-floor", false, ok ? "không tìm thấy coverage-summary.json" : "vitest đỏ");
    return;
  }
  const total = JSON.parse(readFileSync(file, "utf8")).total;
  const below = Object.entries(COVERAGE_FLOOR)
    .filter(([k, floor]) => total[k].pct < floor)
    .map(([k, floor]) => `${k} ${total[k].pct}% < ${floor}%`);
  const actual = Object.keys(COVERAGE_FLOOR)
    .map((k) => `${k} ${total[k].pct}%`)
    .join(", ");
  record("coverage-floor", below.length === 0, below.length ? below.join("; ") : actual);
}

// ---------------------------------------------------------------------------
// e2e: Playwright, chạy lại 1 lần; test chập chờn (đỏ rồi xanh) vẫn tính là đỏ.
// ---------------------------------------------------------------------------
async function e2e() {
  const report = "gate-e2e.report.json";
  const { code } = await run("npx", ["playwright", "test", "--retries=1", "--reporter=line,json"], {
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: report },
  });
  record("playwright", code === 0, code === 0 ? "" : `exit ${code}`);
  if (!existsSync(report)) {
    record("flaky", false, "không có báo cáo JSON của Playwright");
    return;
  }
  const data = JSON.parse(readFileSync(report, "utf8"));
  const { stats } = data;
  const flaky = collectFlaky(data);
  record(
    "flaky",
    (stats?.flaky ?? 0) === 0,
    `expected ${stats?.expected ?? 0}, unexpected ${stats?.unexpected ?? 0}, flaky ${stats?.flaky ?? 0}` +
      (flaky.length ? ` [${flaky.join(" | ")}]` : ""),
  );
}

function collectFlaky(node, trail = []) {
  const found = [];
  for (const spec of node.specs ?? []) {
    for (const t of spec.tests ?? []) {
      if (t.status === "flaky") found.push([...trail, spec.title].join(" > "));
    }
  }
  for (const s of node.suites ?? []) found.push(...collectFlaky(s, [...trail, s.title]));
  return found;
}

// ---------------------------------------------------------------------------
// bao-mat: gitleaks (cả lịch sử) + npm audit + soát workflow + quét câu mồi
// ---------------------------------------------------------------------------
async function baoMat() {
  await step("gitleaks", "gitleaks", [
    "git",
    "--redact",
    "--no-banner",
    "--report-format",
    "json",
    "--report-path",
    "gate-bao-mat.gitleaks.json",
    ".",
  ]);
  await step("npm-audit", "npm", ["audit", "--audit-level=high"]);
  auditWorkflows();
  await scanPromptInjection();
}

// Mọi `uses:` phải ghim SHA 40 ký tự (trừ action cục bộ ./), không dùng write-all,
// không chèn dữ liệu do người viết PR kiểm soát thẳng vào lệnh (chỉ được đưa qua env).
function auditWorkflows() {
  const dir = path.join(".github", "workflows");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  const problems = [];
  const untrusted =
    /\$\{\{[^}]*github\.(head_ref\b|event\.(pull_request|issue|comment|review|review_comment|head_commit|commits|discussion)(\.[\w-]+)*\.(title|body|message|ref|label|name|email)\b)/;
  const envAssign = /^\s*[A-Z_][A-Z0-9_]*:\s*\$\{\{/;

  for (const f of files) {
    const lines = readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.replace(/\s+#.*$/, "");
      const where = `${f}:${i + 1}`;
      const uses = line.match(/^\s*-?\s*uses:\s*["']?([^\s"'#]+)/);
      if (uses && !uses[1].startsWith("./") && !uses[1].startsWith("docker://")) {
        const ref = uses[1].split("@")[1] ?? "";
        if (!/^[0-9a-f]{40}$/.test(ref)) problems.push(`${where} chưa ghim SHA: ${uses[1]}`);
      }
      if (/^\s*permissions:\s*write-all\b/.test(line)) problems.push(`${where} permissions: write-all`);
      if (untrusted.test(line) && !envAssign.test(line)) {
        problems.push(`${where} chèn dữ liệu của PR thẳng vào lệnh, hãy đưa qua env`);
      }
    });
  }
  record(
    "workflow-audit",
    problems.length === 0,
    problems.length ? problems.join("; ") : `${files.length} file`,
  );
}

// Câu mồi (prompt injection) nhắm vào job AI: quét tiêu đề, mô tả PR và các dòng thêm mới.
async function scanPromptInjection() {
  const patterns = [
    [/\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)/i, "lệnh bỏ qua chỉ dẫn (EN)"],
    [/\b(bỏ\s+qua|phớt\s+lờ|quên)\s+(hết\s+|mọi\s+|tất\s+cả\s+)?(các\s+)?(chỉ\s+dẫn|hướng\s+dẫn|yêu\s+cầu)\s+(trước|ở\s+trên)/i, "lệnh bỏ qua chỉ dẫn (VI)"],
    [/\byou\s+are\s+now\s+(a|an|the)\b/i, "đổi vai"],
    [/\b(reveal|print|show|leak)\s+(your\s+|the\s+)?(system\s+prompt|secrets?|api\s+keys?|tokens?)\b/i, "đòi lộ prompt/secret"],
    [/<\/?\s*(system|assistant)\s*>/i, "thẻ vai giả"],
    [/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/, "ký tự ẩn/đảo chiều"],
  ];
  const sources = [
    ["PR_TITLE", process.env.PR_TITLE ?? ""],
    ["PR_BODY", process.env.PR_BODY ?? ""],
  ];

  const base = process.env.BASE_SHA ?? "";
  if (base && !/^0+$/.test(base)) {
    // Bỏ qua chính thư mục gate (chứa các mẫu ở trên) để không tự báo động.
    const { code, out } = await runQuiet("git", [
      "diff",
      "--unified=0",
      "--no-color",
      `${base}...HEAD`,
      "--",
      ".",
      ":(exclude)scripts/ci/**",
      ":(exclude)package-lock.json",
    ]);
    if (code !== 0) {
      record("cau-moi", false, `không đọc được diff từ BASE_SHA ${base.slice(0, 7)}`);
      return;
    }
    let file = "";
    for (const l of out.split("\n")) {
      if (l.startsWith("+++ ")) file = l.slice(6);
      else if (l.startsWith("+") && !l.startsWith("+++")) sources.push([file, l.slice(1)]);
    }
  } else {
    log("cau-moi: không có BASE_SHA, chỉ quét tiêu đề và mô tả PR");
  }

  const hits = [];
  for (const [where, text] of sources) {
    for (const [re, label] of patterns) if (re.test(text)) hits.push(`${where}: ${label}`);
  }
  record("cau-moi", hits.length === 0, hits.length ? [...new Set(hits)].join("; ") : `${sources.length} nguồn`);
}

function runQuiet(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => appendFileSync(LOG, c));
    child.on("error", () => resolve({ code: 127, out }));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

// ---------------------------------------------------------------------------
await GATES[job]();
const ok = steps.length > 0 && steps.every((s) => s.ok);
writeFileSync(SUMMARY, `${JSON.stringify({ job, ok, steps }, null, 2)}\n`);
log(`\nGate ${job}: ${ok ? "XANH" : "ĐỎ"}`);
process.exit(ok ? 0 : 1);
