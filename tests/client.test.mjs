import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

/** Load the browser half exactly as the DSH module loader does. */
async function loadClient() {
  const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  const module = {exports: {}};
  const sandbox = {window: {__ModuleLoader__: {load: ({factory}) => { module.exports = factory(() => ({createElement: () => ({})})); }}}, console: {warn() {}}};
  vm.runInNewContext(code, sandbox, {filename: 'client.js'});
  return module.exports;
}

test('browser half registers sidebar entry, main view and right pane tab', async () => {
  const plugin = await loadClient();
  assert.equal(plugin.name, 'dsh-product-previs');
  assert.equal(plugin.isPlugin, true);
  const seen = [];
  const ctx = {
    slots: {inject: (name, fn) => { seen.push(['inject', name]); fn(); }, register: (definition) => { seen.push(['register', definition.name]); return () => {}; }},
    effect: (fn) => { fn(); return () => {}; },
    inject: (deps, fn) => { seen.push(['deps', ...deps]); fn({sidebarRightTabs: {register: (definition) => { seen.push(['rightTab', definition.id]); return () => {}; }}}); },
  };
  plugin.apply(ctx);
  for (const expected of [['register', 'sidebar.panellist'], ['register', 'main'], ['rightTab', 'product-previs']]) {
    assert.ok(seen.some((row) => row[0] === expected[0] && row[1] === expected[1]), `missing ${expected.join(' ')}`);
  }
});

test('a host without the right pane still gets the sidebar entry and main view', async () => {
  const plugin = await loadClient();
  const seen = [];
  const ctx = {
    slots: {inject: (name, fn) => { fn(); }, register: (definition) => { seen.push(definition.name); return () => {}; }},
    effect: (fn) => { fn(); return () => {}; },
    inject: () => { throw new Error('sidebarRightTabs unavailable'); },
  };
  assert.doesNotThrow(() => plugin.apply(ctx));
  assert.ok(seen.includes('sidebar.panellist'));
  assert.ok(seen.includes('main'));
});
