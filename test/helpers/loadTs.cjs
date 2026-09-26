const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();
module.exports = function loadTs(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => id.startsWith('.') ? loadTs(path.resolve(path.dirname(filename), id + '.ts')) : require(id),
    module, module.exports,
  );
  return module.exports;
};
