// Native Claude permission matching, without model inference or credentials.
// Positive cases intentionally fail inside real helpers, proving execution:
// render-time errors include their output and stop before an API call.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const work = mkdtempSync(join(tmpdir(), 'display-permissions-'));
const plugin = join(work, 'plugin with spaces');
const skill = join(plugin, 'skills/visualize');
const executable = process.env.CLAUDE_EXECUTABLE;
assert(executable, 'Set CLAUDE_EXECUTABLE to the native Claude executable');
const cases = [
  { name: 'detector', script: 'detect.mjs', args: '--strict --json', expected: 'a11y/missing-lang' },
  { name: 'catalog', script: 'catalog.mjs', args: 'permissions-probe-not-a-theme', expected: 'Unknown catalog package' },
  { name: 'neighbor', script: 'not-approved.mjs', denied: true },
  { name: 'prefix-neighbor', script: 'detect.mjs-extra.mjs', denied: true },
];

try {
  cpSync(join(root, 'skills/visualize'), skill, { recursive: true });
  mkdirSync(join(plugin, '.claude-plugin'));
  writeFileSync(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({
    name: 'display-permissions-test', version: '0.0.0', description: 'Disposable permissions fixture',
  }));
  const entrypoint = readFileSync(join(skill, 'SKILL.md'), 'utf8');
  const bad = join(work, 'bad fixture.html');
  writeFileSync(bad, '<html><body><p>Permission fixture</p></body></html>');
  const marker = join(work, 'unexpected-execution');
  for (const scenario of cases.filter(scenario => scenario.denied)) {
    writeFileSync(join(skill, 'scripts', scenario.script),
      'import {writeFileSync} from "node:fs";writeFileSync(' + JSON.stringify(marker) + ',"unexpected");');
  }
  for (const scenario of cases) {
    const home = join(work, scenario.name);
    mkdirSync(home);
    const env = {};
    for (const key of ['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'CLAUDE_CODE_GIT_BASH_PATH']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    Object.assign(env, {
      HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, 'config'),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
    });
    const script = '${CLAUDE_PLUGIN_ROOT}/skills/visualize/scripts/' + scenario.script;
    let command = 'node "' + script + '" ' + (scenario.args ?? '');
    if (scenario.name === 'detector') command += ' "' + bad.replaceAll('\\', '/') + '"';
    writeFileSync(join(skill, 'SKILL.md'), entrypoint + '\n!\x60' + command + '\x60\n');
    const { stdout } = await run(executable, [
      '--bare', '--print', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--plugin-dir', plugin, '/display-permissions-test:visualize',
    ], { cwd: work, env, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    const events = stdout.trim().split('\n').map(line => JSON.parse(line));
    const init = events.find(event => event.subtype === 'init');
    const result = events.find(event => event.type === 'result');
    const toolOutput = events.filter(event => event.type === 'user').map(event => event.message.content).join('\n');
    console.log(JSON.stringify({ scenario: scenario.name, version: init?.claude_code_version, toolOutput, result }));
    assert(init?.plugins.some(item => item.name === 'display-permissions-test'), 'Test plugin was not loaded');
    assert.equal(result?.total_cost_usd, 0);
    assert.equal(result?.num_turns, 0, 'Permission checks must stop before model inference');
    if (scenario.denied) {
      assert.match(toolOutput, /Shell command permission check failed/);
      assert(!existsSync(marker), 'An unlisted script executed');
    } else {
      assert.match(toolOutput, /Shell command failed for pattern/);
      assert(!toolOutput.includes('permission check failed'), toolOutput);
      assert(toolOutput.includes(scenario.expected), 'Real helper output missing: ' + toolOutput);
    }
    console.log('PASS native permission case: ' + scenario.name);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
