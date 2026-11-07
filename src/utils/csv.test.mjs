import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from './csv';

test('neutraliza fórmulas em células CSV', () => {
  assert.equal(csvCell('=HYPERLINK("https://evil.example","abrir")'), '"\'=HYPERLINK(""https://evil.example"",""abrir"")"');
  assert.equal(csvCell('  =1+1'), '"\'  =1+1"');
  assert.equal(csvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
});

test('mantém texto comum e escapa aspas CSV', () => {
  assert.equal(csvCell('LOLA Oficial'), '"LOLA Oficial"');
  assert.equal(csvCell('Brinco "Coração"'), '"Brinco ""Coração"""');
});
