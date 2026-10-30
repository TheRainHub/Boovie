/**
 * The English interface is complete: every `t("…")` / `pl(n, "…")` has an English entry, and no Russian text is
 * shown without going through them. Lines that hold Russian on purpose (words the parsers look for in file names,
 * book text) carry an `i18n-ignore` comment.
 * Run: npm test
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { EN } from "../src/lib/i18n/en";

const root = join(process.cwd(), "src");
const CYR = /[А-Яа-яЁё]/;
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !p.endsWith(join("i18n", "en.ts"))) files.push(p);
  }
})(root);

const missing = new Map<string, string>();
const untranslated: string[] = [];
const used = new Set<string>();

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const where = (node: ts.Node) => `${relative(process.cwd(), file)}:${src.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const ignored = (node: ts.Node) => {
    const { line } = src.getLineAndCharacterOfPosition(node.getStart());
    return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
  };
  const keyArg = (node: ts.Node): boolean => {
    const call = node.parent;
    if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
    const fn = call.expression.text;
    return (fn === "t" && call.arguments[0] === node) || (fn === "pl" && call.arguments[1] === node);
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (keyArg(node)) {
        used.add(node.text);
        if (!(node.text in EN)) missing.set(node.text, where(node));
      } else if (CYR.test(node.text) && !ignored(node) && !ts.isImportDeclaration(node.parent)) {
        untranslated.push(`${where(node)}  ${JSON.stringify(node.text).slice(0, 90)}`);
      }
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => CYR.test(p)) && !ignored(node)) untranslated.push(`${where(node)}  \`${parts.join("${…}").slice(0, 90)}\``);
    } else if (ts.isJsxText(node)) {
      if (CYR.test(node.text) && !ignored(node)) untranslated.push(`${where(node)}  ${JSON.stringify(node.text.trim()).slice(0, 90)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

const unused = Object.keys(EN).filter((k) => !used.has(k));
let failed = false;
if (untranslated.length) {
  failed = true;
  console.log(`Russian text outside t() (${untranslated.length}):\n  ${untranslated.join("\n  ")}`);
}
if (missing.size) {
  failed = true;
  console.log(`No English for (${missing.size}):\n  ${[...missing].map(([k, w]) => `${w}  ${JSON.stringify(k)}`).join("\n  ")}`);
}
if (unused.length) console.log(`English entries no longer used (${unused.length}): ${unused.slice(0, 20).map((k) => JSON.stringify(k)).join(", ")}`);
console.log(failed ? "\ni18n check failed" : `i18n: ${used.size} strings, all translated`);
process.exit(failed ? 1 : 0);
