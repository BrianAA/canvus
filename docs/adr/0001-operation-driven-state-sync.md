# 1. Operation-Driven State Synchronization

To prevent state desynchronization in complex host environments (like a custom CMS or code editors like Monaco with their own undo stacks), we decided to expose discrete **Operation** delta payloads from visual gestures instead of managing a private, internal undo/redo history stack. This allows host applications to integrate visual layout modifications directly into a single, unified global transaction lifecycle, while providing a public `applyOperation` replay API to execute undo/redo actions programmatically.
