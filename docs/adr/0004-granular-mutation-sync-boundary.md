# 4. Granular Mutation Sync Boundary

To avoid the performance overhead and architectural complexity of building a DOM diffing and reconciliation engine inside the SDK, we decided to define the synchronization boundary between the host (Code View / AST) and the SDK (Visual Canvas) around granular mutation APIs. The host application is responsible for computing structure changes and calling specific SDK methods (`addNode`, `removeNode`, `reparentNode`, `updateMarkup`) to update the workspace.
