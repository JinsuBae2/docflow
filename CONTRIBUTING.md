# Contributing

Use Node.js 24 and `npm ci`. Run `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:e2e` before proposing changes. The UI suite launches Electron and uses only temporary example data and a fixture provider; never include real documents, credentials, user databases, or account output in a commit.

Keep renderer access behind the validated preload bridge. AI output must remain a proposal until explicitly accepted; preserve source IDs, base revisions, rejection history, and recovery guarantees. Add focused tests for behavior changes. Real-account tests are opt-in and consume subscription quota.

This repository has not selected a public distribution license yet. Resolve licensing and signing before distributing releases. The workflows prepare artifacts but do not publish them automatically.
