# display.dev plugin for Claude

Publish HTML or Markdown from Claude to [display.dev](https://display.dev), choose who can view it, and act on reviewer comments. One install gives Claude:

- the **display.dev skill**: publish, browse, search, read, edit, copy, and share artifacts with public, private, or company access;
- **Visualize**: create, explore, refine, and review on-brand HTML reports, plans, diagrams, decks, and dashboards; reference design systems load when selected;
- the **display.dev MCP server** (`https://api.display.dev/v1/mcp`);
- **`/display-dev:feedback`**: lists your artifacts with open comments, shows a plan for each thread, and after you approve it, edits the artifact, replies, and resolves the threads. With no comments, it offers to ask a reviewer or to wait for comments;
- a **publish guard** hook that scans a publish for secrets (API keys, tokens, private keys). It blocks a public publish and asks before any other publish;
- a **comment note** hook that tells you at session start which of your artifacts have new comments. It reads only open-thread counts, never comment text.

## Install

**Claude Code**

```sh
/plugin marketplace add display-dev/skill
/plugin install display-dev@display-dev
```

Then run `/mcp` and complete OAuth for `plugin:display-dev:display-dev`.

**Claude.ai, Claude Desktop, and Cowork**: add the plugin from the directory, or under Customize › Plugins. Claude.ai loads the skills and the command but not the hooks. Connect the display.dev connector there for the tools.

The hooks run in Claude Code and in Cowork on your own computer. The comment note needs the [`dsp` CLI](https://www.npmjs.com/package/@displaydev/cli).

## What this plugin runs and sends

| Part | Runs | Sends or fetches | Stores |
|---|---|---|---|
| display.dev skill | The bundled helper scripts, the installed `dsp` CLI, and a bundled `jq` binary for JSON | Requests to `api.display.dev` for the actions you ask for. An anonymous publish sends the file to `https://api.display.dev/v1/public/artifacts`. | Nothing. `dsp` keeps its own sign-in. |
| Visualize | The bundled scripts (Node) for catalog retrieval, palette, contrast, diagram, and image checks | Selected reference files from `raw.githubusercontent.com/display-dev/visualize` at the immutable catalog revision in `skills/visualize/design-systems/catalog-source.json`. Clean is bundled; previews are fetched only when requested. Image generation calls only the provider you configure. | Created artifacts in your project; downloaded reference files in a local catalog cache (`VISUALIZE_CATALOG_CACHE_DIR` can relocate it) |
| MCP server | Nothing on your machine | Tool calls to `https://api.display.dev/v1/mcp` after you sign in with OAuth, with the header `X-Client-Source: display-dev-claude-plugin@<version>` | Nothing |
| Publish guard hook | `hooks/publish-guard.sh` before each Bash command and each display.dev `publish` tool call | Nothing. It reads only the files named in a publish command, or the `content` of an MCP publish, and checks them for secrets on your machine. | Nothing |
| Comment note hook | `hooks/comment-digest.sh` at session start, only when `dsp` is installed | One request through `dsp` to `api.display.dev`: your 100 most recently updated artifacts with their names and open-thread counts. It never fetches comment text. | The open-thread count and name of each of your artifacts with open threads, in Claude Code's plugin data folder (`open-thread-counts.json`) |
| `/display-dev:feedback` | `dsp` commands or MCP tool calls | Reads the metadata, open comments, and source of the artifact you choose. After you approve the plan, publishes the new version and posts replies and resolves to `api.display.dev`. | A temporary copy of the artifact source while it edits |

## Maintaining

`skills/display-dev/` is a copy of a pinned commit of [display-dev/skill](https://github.com/display-dev/skill), and `skills/visualize/` of the [canonical Visualize skill](https://github.com/display-dev/visualize/tree/main/skills/visualize). Never edit them here. Change a skill in its own repository, then update `sources.lock` and run:

```sh
tools/sync.sh           # copy the pinned skills into skills/
tools/sync.sh --check   # CI: fail when skills/ has drifted
bash tests/hooks.sh   # offline hook tests
```

Raise `version` in `.claude-plugin/plugin.json` with every release, together with the `X-Client-Source` suffix there and in `commands/feedback.md`. CI checks that they match.

Visualize is copied unchanged from its single authored skill directory. It bundles the catalog index and Clean fallback; `scripts/catalog.mjs` retrieves other selected references from the separately pinned catalog revision and caches them locally. The Visualize source pin in `sources.lock` and its catalog revision serve different purposes; neither follows a moving branch at runtime.

The bundled skill is now named `visualize` (previously `visualize-lite`). In Claude Code, use `/display-dev:visualize` in place of `/display-dev:visualize-lite`.

Display's privacy policy: https://display.dev/privacy

## License

MIT
