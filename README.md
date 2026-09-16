# deciml

Deciml is an experimental progressive code-navigation layer for Pi. This first slice indexes one frozen TypeScript benchmark and exposes its lightweight project overview.

## Setup

Requirements: Node.js 22.19 or newer and Pi 0.85.x.

```bash
npm install
npm run typecheck
npm run build
```

Deciml is intentionally local for this experiment. There is no global installation or configuration flow.

## Frozen benchmark

The only supported benchmark is `dudley-codes/rewind` at commit:

```text
45b7b2711b6f7aa1da54a330016c9f1495c620d2
```

Use a clean checkout at that commit. Deciml rejects another commit or changes to the eight benchmark files.

## Build the index

From this repository, after building:

```bash
npm exec -- deciml index /path/to/clean/rewind
```

The command writes two files without removing other Deciml state:

- `.deciml/index.json` — benchmark metadata, deterministic file and symbol references, hashes, and source ranges.
- `.deciml/project.md` — short, task-independent descriptions of the eight indexed files.

Running the command repeatedly against the same source produces byte-identical output.

## Use the Pi extension

Start Pi from the indexed Rewind checkout and load the Deciml extension from this repository:

```bash
cd /path/to/clean/rewind
pi -e /path/to/deciml/src/extension/index.ts
```

Pi can then call `deciml_project` to retrieve `.deciml/project.md`.

## Extraction policy

File references are allocated from lexically sorted benchmark paths. Symbol references are allocated by file and source order. The TypeScript compiler API extracts syntax-defined declarations, nested named functions, `useCallback` handlers, and Jest suites, hooks, and tests. Ranges are inclusive, one-based canonical source lines.

This slice does not provide descriptors, symbol-source retrieval, read interception, telemetry, domain grouping, generalized configuration, or multi-repository indexing.
