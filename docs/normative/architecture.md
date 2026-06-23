# Architecture

## System Context

| Actor or external system | Direction | Broad interaction | Interface or boundary | Detailed source |
|---|---|---|---|---|
| `<actor or system>` | `<inbound, outbound, or bidirectional>` | `<high-level interaction>` | `<UI, API, queue, client, adapter, or other boundary>` | `<integration contract, schema, or code path>` |

## System Shape

| Component or area | Responsibility | Owns | Must not own |
|---|---|---|---|
| `<name or path>` | `<primary responsibility>` | `<data, behavior, or decisions>` | `<responsibility kept elsewhere>` |

## Internal Dynamics

- `<important flow>`: `<how control, data, or side effects move through the relevant components>`.

## Dependency Rules

- `<source area>` may depend on `<target area>` for `<purpose>`.
- `<source area>` must not depend on `<prohibited area>`.
- Shared interfaces belong in `<path or package>`.

## Placement And Ownership

| Concern | Canonical location | Boundary rule |
|---|---|---|
| `<concern>` | `<path>` | `<where related behavior must enter or remain>` |

## Cross-Cutting Boundaries

- Validation: `<where input is validated and where trusted data begins>`.
- Authorization: `<where access decisions are made and enforced>`.
- Data access: `<which layer owns persistence and transaction boundaries>`.
- Side effects: `<where network, filesystem, messaging, or external calls occur>`.
- Error handling: `<where errors are translated, logged, or exposed>`.

## Public And Internal Interfaces

- Public or externally consumed interfaces: `<paths, packages, APIs, or none>`.
- Internal interfaces callers should use: `<paths or packages>`.
- Implementation details callers must not depend on: `<paths or modules>`.

## Exceptions And Transitional States

- None.
