# @aotterclam/clam-mantle-runtime

Runtime engine for clam-mantle.

This package owns the adapter-agnostic CMS core: dispatcher, content operations,
render pipeline, auth/session abstractions, MCP JSON-RPC dispatch, and the
runtime ports implemented by platform adapters.

For a fresh adapter implementation, start with
[`docs/adapter-guide.md`](../../docs/adapter-guide.md) and
[`docs/adr/0011-adapter-port-spec.md`](../../docs/adr/0011-adapter-port-spec.md).

`0.0.7-alpha` is an early prerelease for the agent-provisioning proof. The API
surface remains in flux until `v0.1.0`.
