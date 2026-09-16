# Deciml MVP PRD

## 1. Product

**Name:** Deciml  
**MVP form:** Pi extension + Pi skill  
**Primary language:** TypeScript / JavaScript  
**Purpose:** Validate whether layered semantic code indexing can reduce source-code context usage without harming an agent's ability to plan and implement a task.

Deciml is a progressive code-navigation layer for coding agents.

Instead of allowing Pi to read entire source files during discovery, Deciml gives the agent increasingly detailed representations:

```text
PROJECT INDEX
    ↓
FILE SEMANTIC DESCRIPTOR
    ↓
SYMBOL
    ↓
CANONICAL SOURCE RANGE
```

The agent should only read canonical source after it has identified the specific symbols required for the task.

## 2. MVP Hypothesis

> Pi can plan and execute a code change while reading materially less canonical source if it first navigates a deterministic project index and reusable semantic pseudo-code descriptors.

The MVP exists only to validate or reject this hypothesis.

Do not expand scope until this has been measured.

## 3. MVP Success Question

Given the same repository, model, task, and starting commit:

**Can a warm Deciml run use the project index and semantic descriptors to identify the correct functions/components, read only those canonical source ranges, and successfully complete the task using less source context than normal Pi?**

## 4. Thin Vertical Slice

The MVP includes only the minimum functionality required for this experiment.

```text
Repository
   ↓
Deterministic index
   ↓
Project index
   ↓
Pi selects file
   ↓
Descriptor exists?
   ├─ NO → full source read → generate descriptor
   └─ YES → return descriptor
   ↓
Pi selects symbols
   ↓
Return canonical source ranges
   ↓
Pi plans / edits normal repository source
   ↓
Measure source and token usage
```

## 5. Core Layers

### 5.1 Layer 0 - Project Index

Deciml maintains one lightweight project index.

Example:

```text
PROJECT

@D01 API
  External and internal API communication.

@D02 Components
  Shared presentation components.

@D03 Subscription Management
  Subscription lifecycle, provider actions, pause,
  cancellation, reactivation, and verification.

@D04 Watchlists
  Watchlist management and viewing progress.

@D05 Authentication
  Authentication, session state, tokens,
  persistence, and protected navigation.
```

A directory/domain entry expands to relevant files:

```text
@D03 Subscription Management

@F18 AtomicSandboxScreen.tsx
  Atomic sandbox UI and orchestration for account connection,
  subscription synchronization, pause/cancel actions,
  and verification.

@F19 atomic.ts
  Atomic API client and subscription-management requests.

@F20 atomicTransact.ts
  Launches Atomic connection and management flows.

@F21 AtomicSandboxScreen.test.tsx
  Coverage for Atomic sandbox behavior.
```

The project index answers:

> Which files are likely relevant?

It does not attempt to explain implementation details.

### 5.2 Layer 1 - File Semantic Descriptor

The first time an indexed file is meaningfully read, Deciml allows the full canonical read and generates a reusable semantic descriptor.

The descriptor uses verbose pseudo-SQL-like semantic text.

Example:

```text
FILE @F18
PATH src/screens/AtomicSandboxScreen.tsx

ROLE
  Atomic sandbox UI for:
  CATALOG synchronization
  COMPANY selection
  BILLING manager selection
  ACCOUNT connection
  SUBSCRIPTION synchronization
  PAUSE action
  CANCEL action
  ACTION verification

FN @S101 verified
SOURCE L55-L65

INPUT
  subscription AtomicSubscription?
  action CANCEL | PAUSE

RETURN boolean

BEHAVIOR
  IF subscription MISSING
    RETURN false

  IF action = CANCEL
    RETURN state IN [
      CANCELLED,
      CANCELLATION_SCHEDULED
    ]

  IF action = PAUSE
    RETURN state IN [
      PAUSED,
      PAUSE_SCHEDULED
    ]

FN @S107 recordFinish
SOURCE L213-L289

BEHAVIOR
  FLOW -> FINISHED

  IF taskId EXISTS
    POLL task state
    STOP ON FAILED | COMPLETED

  IF expected action MISSING
    REFRESH subscriptions
    RETURN

  POLL Atomic accounts
  FIND expected subscription
  VERIFY requested CANCEL | PAUSE state

  IF verified
    STATUS verified
  ELSE
    STATUS verification pending

COMPONENT @S111 StateBadge
SOURCE L517-L521

ROLE
  Render normalized subscription state.

BEHAVIOR
  REPLACE "_" WITH " "
  UPPERCASE
  RENDER state badge
```

The descriptor answers:

> What behaviors exist in this file, and which symbols are likely relevant?

It does not replace canonical source for implementation.

### 5.3 Layer 2 - Symbol Source

Once Pi determines that a symbol is relevant, it requests the real source only for that symbol.

Example:

```text
SOURCE @S111
```

returns:

```text
FILE src/screens/AtomicSandboxScreen.tsx
LINES 517-L521

<canonical source lines 517-L521>
```

Canonical source must always come from the real repository.

Deciml does not create an editable shadow file or minified mirror in MVP.

## 6. Deterministic Index

Use existing deterministic code-intelligence tooling rather than asking the LLM to discover file/symbol locations.

For the MVP, use `scip-typescript` / SCIP where practical.

The deterministic index only needs enough information to associate:

```text
@F18
→ src/screens/AtomicSandboxScreen.tsx

@S111
→ StateBadge
→ @F18
→ source range L517-L521
```

MVP-required deterministic data:

```text
file path
file ID
symbol ID
symbol name
symbol kind
source range
signature when available
file → symbol relationship
```

Anything beyond that is optional for this validation slice.

## 7. Lazy Semantic Descriptors

Descriptors are created only when a file is first read.

### Cold access

```text
Pi requests @F18
    ↓
No descriptor
    ↓
Allow full canonical file read
    ↓
Generate semantic descriptor
    ↓
Persist descriptor
```

### Warm access

```text
Pi requests @F18
    ↓
Descriptor exists
    ↓
Return descriptor instead of full file
```

The descriptor must be reusable for later tasks.

The descriptor generator must not receive the current task when producing the descriptor.

It describes the file itself, not why the current user cares about it.

## 8. Descriptor Freshness - MVP Version

For the first vertical slice, use a simple file-content hash.

Store:

```text
fileId
path
sourceHash
descriptor
descriptorSourceHash
```

A descriptor is valid when:

```text
sourceHash = descriptorSourceHash
```

If the file changes:

```text
sourceHash != descriptorSourceHash
```

mark the descriptor stale.

For MVP, stale descriptors may be regenerated from the whole file on the next descriptor access.

Symbol-level partial invalidation is deferred until after the hypothesis is validated.

## 9. Pi Integration

Deciml consists of:

```text
Pi extension
+
Pi skill
```

### Extension responsibilities

Expose only the tools required for the experiment:

```text
deciml_project
deciml_open
deciml_source
```

#### `deciml_project`

Return the lightweight project/domain index.

#### `deciml_open <reference>`

For a directory/domain:

```text
return child file entries
```

For a file:

```text
descriptor valid
→ return semantic descriptor

descriptor missing/stale
→ allow/generate cold read descriptor
```

#### `deciml_source <symbol>`

Resolve the deterministic symbol range and return canonical source for that range.

## 10. Pi Skill

The Pi skill teaches one workflow:

```text
INDEX → DESCRIPTOR → SYMBOL → SOURCE → EDIT
```

Core instruction:

```text
Use Deciml for repository discovery before reading full files.

1. Start from the Deciml project index.
2. Open only likely file descriptors.
3. Identify the specific symbols relevant to the task.
4. Read canonical source only for those symbols.
5. Never edit from semantic descriptors alone.
6. Apply all edits to the normal repository source files.
```

Do not tell Pi that the goal is to minimize tokens. That would contaminate the benchmark.

## 11. Warm Full-File Read Handling

For a warm descriptor hit, Deciml should prevent an ordinary Pi read from automatically returning the entire indexed file.

Conceptually:

```text
Pi:
read AtomicSandboxScreen.tsx

Deciml:
A valid descriptor exists.

Return:
@F18 semantic descriptor

Canonical source is available through
deciml_source <symbol>.
```

For the MVP benchmark, enforce this through the Pi extension where practical.

The purpose is to test Deciml, not Pi's willingness to follow a suggestion.

## 12. Benchmark

The MVP is validated using three runs.

All runs must use:

```text
same repository commit
same task
same model
same reasoning level
same Pi configuration
same candidate files
```

### 12.1 Run A - Control

Deciml disabled.

```text
READ complete candidate files
→ determine relevant symbols
→ plan task
→ execute task
```

Measure normal source/context usage.

### 12.2 Run B - Deciml Cold

Deciml enabled with no semantic descriptors.

```text
READ same candidate files
→ generate descriptors
→ determine relevant symbols
→ plan task
→ execute task
```

This measures descriptor-generation cost.

Snapshot the generated descriptors before source modifications for use in Run C.

### 12.3 Run C - Deciml Warm

Reset repository source to the same starting commit.

Restore the descriptors generated before Run B modified source.

```text
READ project index
→ identify relevant files
→ READ semantic descriptors
→ identify relevant symbols
→ READ only selected canonical symbol ranges
→ plan task
→ execute task
```

This is the primary experiment.

## 13. Required Benchmark Telemetry

Keep telemetry intentionally small.

Record:

```text
full_file_reads
descriptor_reads
symbol_source_reads

canonical_source_lines_read
canonical_source_bytes_read
estimated_canonical_source_tokens

descriptor_bytes_read
estimated_descriptor_tokens

provider_input_tokens
provider_cache_read_tokens
provider_output_tokens

task_completed
existing_validation_passed
```

If provider-level token counts are unavailable, clearly label estimates.

## 14. Primary MVP Metrics

### Canonical Source Avoidance

```text
1 - (
  warm canonical source tokens read
  /
  control canonical source tokens read
)
```

Example:

```text
Control canonical source: 30,000 tokens
Warm canonical source:     8,000 tokens

Source avoidance = 73.3%
```

### Descriptor Leverage

```text
canonical source tokens avoided
/
descriptor tokens consumed
```

Example:

```text
22,000 canonical tokens avoided
5,000 descriptor tokens consumed

Descriptor leverage = 4.4x
```

### Planning Selection

Before implementation, record the symbols Pi identifies as relevant.

After implementation, compare against the symbols actually needed.

Simple output is sufficient:

```text
Planned relevant symbols:
@S101
@S107
@S111

Actually required:
@S107
@S111

Unnecessary selection:
@S101
```

## 15. Success Criteria

The MVP is successful enough to continue if the warm Deciml condition:

1. completes the same task successfully;
2. reads materially less canonical source than control;
3. identifies the correct implementation area from the project/file descriptors;
4. executes using targeted symbol reads rather than full-file reads for most indexed files.

Initial directional target:

```text
≥ 40% reduction in canonical source tokens read
```

Provider cost reduction is desirable but is not required to validate the initial hypothesis.

## 16. Failure Criteria

The hypothesis needs revision if warm Deciml consistently:

- requires full-file fallbacks;
- selects the wrong symbols;
- misses necessary behavior;
- produces lower-quality implementations;
- consumes roughly the same canonical source as control;
- spends more descriptor tokens than the source tokens it avoids.

## 17. Explicitly Out of Scope

Do not build these in the first vertical slice:

```text
multi-agent support
Claude Code support
Codex support
languages beyond TypeScript / JavaScript
symbol-level descriptor invalidation
advanced rename tracking
automatic feature clustering
context-window eviction
conversation compression
tool-output compression
provider proxies
B-tree / DAG context memory
source minification
editable virtual files
cloud storage
team sharing
dashboard UI
comprehensive test suite
large edge-case matrix
production hardening
performance optimization
```

Only add them after the central experiment produces useful results.

## 18. Minimal Implementation Shape

```text
deciml/
  src/
    extension/
      index.ts
      tools.ts
    index/
      scip.ts
      references.ts
    descriptors/
      generate.ts
      store.ts
    source/
      resolve.ts
    telemetry/
      session.ts
  skills/
    deciml/
      SKILL.md
  package.json
```

Avoid abstractions that are not required for the benchmark.

## 19. Minimal Persistence

Use the simplest reliable local persistence mechanism.

Minimum file record:

```text
id
path
sourceHash
shortDescription
```

Minimum symbol record:

```text
id
fileId
name
kind
startLine
endLine
```

Minimum descriptor record:

```text
fileId
descriptor
descriptorSourceHash
```

Minimum session measurements:

```text
mode
fullFileReads
descriptorReads
symbolReads
sourceLinesRead
sourceBytesRead
descriptorBytesRead
```

Do not design the full future schema during MVP.

## 20. Vertical Slice Definition of Done

The MVP is done when one real TypeScript repository demonstrates:

```text
1. Deterministically index the repository.

2. Produce a project index containing:
   @D → @F references
   short file descriptions.

3. Access an @F file with no descriptor.

4. Allow the cold full-file read.

5. Generate and persist its verbose semantic descriptor.

6. Start a fresh Pi session.

7. Access the same @F file.

8. Return the semantic descriptor instead of full source.

9. Pi identifies specific @S symbols needed for the task.

10. Deciml resolves those symbols to canonical source ranges.

11. Pi reads only those canonical ranges.

12. Pi plans and completes the task against normal source files.

13. Deciml reports source/context measurements.

14. Compare Control vs Cold vs Warm results.
```

If this experiment works, Deciml has validated its core premise.

Everything else is follow-on work.
