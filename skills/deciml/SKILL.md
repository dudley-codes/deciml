---
name: deciml
description: Navigate source in a repository with a .deciml index using project entries, semantic file descriptors, and exact indexed symbols. Use for repository discovery and implementation work when Deciml tools are available.
---

# Deciml navigation

Follow this sequence exactly:

```text
INDEX → DESCRIPTOR → SYMBOL → SOURCE → EDIT
```

1. **INDEX** — Call `deciml_project` before repository discovery. Choose only likely `@F` files from the project overview.
2. **DESCRIPTOR** — Call `deciml_open` for those files.
   - On `HIT`, use the persisted semantic descriptor to identify relevant behavior.
   - On `MISS`, inspect the returned canonical file, produce the requested task-independent descriptor, and submit it with `deciml_save_descriptor` before continuing.
3. **SYMBOL** — Select the smallest set of indexed `@S` symbols required for the task from the descriptors.
4. **SOURCE** — Call `deciml_source` for every selected symbol before planning or implementing its changes.
5. **EDIT** — Apply changes only to the normal repository files with the standard editing tools. Do not edit `.deciml` artifacts directly.

Never implement from a semantic descriptor alone. Descriptors support navigation; `deciml_source` provides the canonical implementation text.
