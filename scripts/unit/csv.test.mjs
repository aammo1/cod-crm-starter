import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "../test-source.mjs";

const { parseCsv, detectDelimiter, escapeCsvCell, toCsv, CsvError } = loadSource("@/lib/csv");

test("parses quoted fields, escaped quotes, embedded newlines and CRLF", () => {
  const { rows } = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "z"]]);
});

test("auto-detects semicolon and ignores delimiters inside quotes", () => {
  assert.equal(detectDelimiter('code;montant\nA;1'), ";");
  assert.equal(detectDelimiter('"a;b",c\n1,2'), ",");
  assert.deepEqual(parseCsv("code;montant\nA1;1 234,00\n").rows, [["code", "montant"], ["A1", "1 234,00"]]);
});

test("strips BOM and skips blank lines", () => {
  const { rows } = parseCsv("﻿code,montant\n\nA,1\n\n");
  assert.deepEqual(rows, [["code", "montant"], ["A", "1"]]);
});

test("enforces row, column and quote caps", () => {
  assert.throws(() => parseCsv("a\n1\n2\n3", { maxRows: 2 }), CsvError);
  assert.equal(parseCsv("a\n1\n2", { maxRows: 2 }).rows.length, 3);
  assert.throws(() => parseCsv("a,b,c\n1,2,3", { maxColumns: 2 }), CsvError);
  assert.throws(() => parseCsv('a\n"open'), CsvError);
});

test("writer neutralizes formula injection and quotes when needed", () => {
  for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
    assert.ok(escapeCsvCell(v).replace(/^"/, "").startsWith("'"), JSON.stringify(v));
  }
  assert.equal(escapeCsvCell(-5), "-5");
  assert.equal(escapeCsvCell("safe"), "safe");
  assert.equal(escapeCsvCell('a,"b"'), '"a,""b"""');
  assert.equal(escapeCsvCell(null), "");
  assert.equal(toCsv([["a", "=x"], [1, "b;c"]], ";"), "a;'=x\r\n1;\"b;c\"\r\n");
});

test("writer output round-trips through the parser", () => {
  const rows = [["n", "t"], ["Dupont, Jean", 'say "x"'], ["l1\nl2", "ok"]];
  assert.deepEqual(parseCsv(toCsv(rows)).rows, rows);
});
