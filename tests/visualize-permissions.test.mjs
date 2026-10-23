import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { prepareVisualize } from '../tools/prepare-visualize.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const originalPaths = 'In helper commands, `$SKILL_DIR` means the absolute directory containing this installed `SKILL.md`. Resolve it from the host\'s skill location; set it in the shell and quote it (`"$SKILL_DIR"`), or substitute the quoted absolute path. Hosts do not necessarily export it.';
const source = [
  '---', 'name: visualize', 'version: 0.8.0', 'allowed-tools:',
  '  - Bash(node */visualize/scripts/detect.mjs*)',
  'description: Test fixture', '---', '', '# Visualize', '', originalPaths,
  '', '## Commands', '', 'Keep the rest of the workflow unchanged.', '',
].join('\n');
const withoutRules = text => text.replace(/^allowed-tools:\n(?:  - .+\n)+/m, '');
const withoutPaths = text => text.replace(/^In helper commands,.+$/m, '');

test('only the preapproval block and helper-path paragraph change', () => {
  const actual = prepareVisualize(source);
  assert.equal(withoutPaths(withoutRules(actual)), withoutPaths(withoutRules(source)));
  assert.match(actual, /substitute the quoted absolute path/);
  assert.equal(prepareVisualize(source), actual);
});

test('every grant names a bundled script with a quoted plugin-root path', () => {
  const actual = prepareVisualize(source);
  const rules = [...actual.matchAll(/^  - 'Bash\((.+)\)'$/gm)].map(match => match[1]);
  assert.equal(rules.length, 11);
  for (const rule of rules) {
    const match = rule.match(/^(?:(node|bash) )?"\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/visualize\/scripts\/([a-z-]+\.(?:mjs|sh))":\*$/);
    assert(match, rule);
    assert(existsSync(join(root, 'skills/visualize/scripts', match[2])), rule);
  }
  assert(!actual.includes('*/visualize'));
});

test('source contract drift requires review instead of a partial adaptation', () => {
  assert.throws(() => prepareVisualize(withoutRules(source)), /allowed-tools shape changed/);
  assert.throws(() => prepareVisualize(source.replace(originalPaths, 'Changed path contract.')), /helper-path guidance changed/);
});

test('the bundled entrypoint contains the maintained plugin adaptation', () => {
  const bundled = readFileSync(join(root, 'skills/visualize/SKILL.md'), 'utf8');
  assert.match(bundled, /Do not leave `\$SKILL_DIR` as a shell variable/);
  assert.match(bundled, /Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/visualize\/scripts\/detect\.mjs":\*\)/);
});
