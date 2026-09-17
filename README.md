# deciml

Deciml is an experimental progressive code-navigation layer for Pi. It indexes one frozen TypeScript benchmark, exposes its lightweight project overview, and lets the visible Pi session create reusable semantic file descriptors.

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

Start Pi from the indexed Rewind checkout and load the Deciml extension from this repository with an explicit benchmark mode:

```bash
cd /path/to/clean/rewind
pi -e /path/to/deciml/src/extension/index.ts --deciml-mode Cold
```

Use `Cold` for a checkout with empty descriptors and `Warm` after restoring the pre-implementation descriptor snapshot. Use `Control` to keep the instrumented standard `read` tool while disabling Deciml's navigation tools and bundled skill:

```bash
pi -e /path/to/deciml/src/extension/index.ts --deciml-mode Control
pi -e /path/to/deciml/src/extension/index.ts --deciml-mode Warm
```

In Cold and Warm modes, Pi can use these tools:

- `deciml_project` retrieves `.deciml/project.md`.
- `deciml_open @Fxx` opens an indexed file. A descriptor miss returns the complete canonical file, its current source hash, the indexed symbols and ranges, and instructions for producing a descriptor. A fresh descriptor returns a `HIT` with semantic pseudo-code only.
- `deciml_source @Sxx` resolves one symbol through the persisted index and returns only its indexed range from the current canonical file.
- `deciml_save_descriptor @Fxx <descriptor>` validates the descriptor's file and symbol identity against the deterministic index before writing `.deciml/descriptors.json`.

The extension automatically loads its bundled Deciml skill, which directs Pi through `INDEX → DESCRIPTOR → SYMBOL → SOURCE → EDIT`. When an indexed file has a fresh descriptor, an ordinary full-file `read` returns that descriptor instead of canonical source and directs Pi to `deciml_source`. Reads with an offset or limit, reads of non-indexed files, and indexed reads with a missing or stale descriptor retain Pi's normal behavior.

Descriptor generation happens in the visible Pi/model session after a cold `deciml_open`; Deciml does not make a hidden model call. The descriptor must begin with the indexed file identity and pair each described symbol with its indexed source range:

```text
FILE @F02
PATH frontend/src/api/atomic.ts

ROLE
  Define Atomic API data and authenticated client operations.

FUNCTION @S027 prepareAtomicAction
SOURCE L168-L174

BEHAVIOR
  BUILD subscription-action preparation request
  SEND authenticated request
  RETURN prepared action flow
```

Only `@S` references listed by `deciml_open` are accepted, and each must belong to the selected `@F` file. Unknown symbols, symbols from another file, and altered ranges are rejected without changing descriptor state. A saved record contains both the current source hash and the descriptor source hash; a later source change makes it stale and causes the next open to follow the cold `MISS` path again.

## Session consumption

Each new benchmark session replaces `.deciml/consumption.json` with a fresh, human-readable artifact for its selected mode. A Pi runtime reload preserves the current session's counters. The artifact contains:

- `fullFileReads` — successful indexed full-file reads, including `deciml_open` misses.
- `descriptorReads` — successful descriptor hits, including ordinary reads redirected by warm navigation.
- `symbolSourceReads` — successful `deciml_source` operations.
- `canonicalSourceLinesRead` and `canonicalSourceBytesRead` — exact canonical source material returned by indexed full, partial, cold-open, and symbol reads.
- `descriptorBytesRead` — persisted descriptor text returned on hits, excluding Deciml's wrapper metadata.
- `descriptorGenerationSourceBytes` — canonical source supplied specifically by `deciml_open` misses for descriptor generation. These bytes also appear in the canonical-source totals.

Byte counts use UTF-8. Non-indexed reads, project overview text, response labels, and descriptor instructions are not counted. Concurrent tool calls serialize their aggregate updates so each qualifying operation changes the artifact once.

Pi provider input, cache-read, and output statistics are intentionally not collected here. Capture them separately during each benchmark and place them beside this artifact in the final comparison.

## Extraction policy

File references are allocated from lexically sorted benchmark paths. Symbol references are allocated by file and source order. The TypeScript compiler API extracts syntax-defined declarations, nested named functions, `useCallback` handlers, and Jest suites, hooks, and tests. Ranges are inclusive, one-based canonical source lines.

This slice does not provide provider telemetry, domain grouping, generalized configuration, or multi-repository indexing.
