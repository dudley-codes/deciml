import type { BenchmarkDefinition } from "./index/types.js";

export const benchmark = {
  repository: "dudley-codes/rewind",
  commit: "45b7b2711b6f7aa1da54a330016c9f1495c620d2",
  taskPrompt:
    "Add scheduled pause support to Atomic Sandbox. Pausing requires a YYYY-MM-DD resume date, includes it in the pause preparation request and confirmation, and leaves cancellation unchanged.",
  candidates: [
    {
      path: "frontend/src/api/__tests__/atomic.test.ts",
      shortDescription:
        "Request-contract coverage for authenticated Atomic catalog, synchronization, connection, action, and management calls.",
    },
    {
      path: "frontend/src/api/atomic.ts",
      shortDescription:
        "Atomic API types and authenticated client operations for catalogs, subscriptions, account synchronization, actions, and flows.",
    },
    {
      path: "frontend/src/context/AtomicSubscriptionContext.tsx",
      shortDescription:
        "Maps Atomic subscription data into Rewind state and orchestrates connection, cancellation, management, polling, and status updates.",
    },
    {
      path: "frontend/src/context/__tests__/AtomicSubscriptionContext.test.tsx",
      shortDescription:
        "Behavior coverage for Atomic subscription mapping, connection and cancellation flows, polling, safeguards, and status labels.",
    },
    {
      path: "frontend/src/integrations/atomicTransact.ts",
      shortDescription:
        "React Native Atomic Transact launchers and callback adapters for connection, action, and management flows.",
    },
    {
      path: "frontend/src/integrations/atomicTransact.web.ts",
      shortDescription:
        "Web Atomic Transact launchers for connection, action, and management flows.",
    },
    {
      path: "frontend/src/screens/AtomicSandboxScreen.tsx",
      shortDescription:
        "Atomic sandbox UI and orchestration for catalog synchronization, account connection, subscription actions, and verification.",
    },
    {
      path: "frontend/src/screens/__tests__/AtomicSandboxScreen.test.tsx",
      shortDescription:
        "Interaction coverage for enabled subscription actions, explicit confirmation, billing-manager selection, and account refresh.",
    },
  ],
} as const satisfies BenchmarkDefinition;
