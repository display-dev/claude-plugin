#!/usr/bin/env node
// The Display plugin's only two adaptations of the pinned Visualize entrypoint.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helpers = ['detect.mjs', 'browser-contrast.mjs', 'browser-diagram.mjs',
  'render-mermaid.mjs', 'palette.mjs', 'teach.mjs', 'catalog.mjs',
  'generate-image.mjs', 'record-image.mjs'];
const scriptRoot = '${CLAUDE_PLUGIN_ROOT}/skills/visualize/scripts';
const rules = helpers.map(name => `Bash(node "${scriptRoot}/${name}":*)`);
rules.push(`Bash(bash "${scriptRoot}/publish.sh":*)`, `Bash("${scriptRoot}/publish.sh":*)`);
const originalPaths = 'In helper commands, `$SKILL_DIR` means the absolute directory containing this installed `SKILL.md`. Resolve it from the host\'s skill location; set it in the shell and quote it (`"$SKILL_DIR"`), or substitute the quoted absolute path. Hosts do not necessarily export it.';
const pluginPaths = 'In helper commands, `$SKILL_DIR` means the absolute directory containing this installed `SKILL.md`. Resolve it from the host\'s skill location and substitute the quoted absolute path, including quotes around each script path. Do not leave `$SKILL_DIR` as a shell variable: the plugin\'s narrow preapprovals match resolved script paths.';

export function prepareVisualize(content) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter || !/^allowed-tools:\n(?:  - .+\n)+/m.test(frontmatter[1] + '\n')) {
    throw new Error('Visualize allowed-tools shape changed; review the plugin adaptation');
  }
  if (!content.includes(originalPaths)) {
    throw new Error('Visualize helper-path guidance changed; review the plugin adaptation');
  }
  const block = 'allowed-tools:\n' + rules.map(rule => `  - '${rule}'\n`).join('');
  const adapted = frontmatter[0].replace(/^allowed-tools:\n(?:  - .+\n)+/m, block);
  return (adapted + content.slice(frontmatter[0].length)).replace(originalPaths, pluginPaths);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) throw new Error('usage: node tools/prepare-visualize.mjs <skill-directory>');
  for (const helper of [...helpers, 'publish.sh']) {
    if (!existsSync(join(directory, 'scripts', helper))) throw new Error(`Missing Visualize helper: ${helper}`);
  }
  const file = join(directory, 'SKILL.md');
  writeFileSync(file, prepareVisualize(readFileSync(file, 'utf8')));
}
