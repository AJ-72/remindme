# Knowledge repo

The single entry point to this codebase, for **agents** and for **humans**.

Read this page first. Then go to the one file that answers your question.
Every page is self-contained: it repeats the facts you need, so you do not
have to open source files to get oriented.

## What this is not

This is a **map**, not the source of truth for status.
- Run/operate rules live in [`CLAUDE.md`](../../CLAUDE.md).
- Open work lives in [`backlog.md`](../../backlog.md).
- Shipped work lives in [`docs/shipped.md`](../shipped.md).
- Capability status lives in [`docs/features.md`](../features.md).

If a page here disagrees with one of those four files, **those four win**.

## Pages

| Page | Answers |
| --- | --- |
| [01 — What the app is](01-what-it-is.md) | What does the product do, and for whom? |
| [02 — Architecture](02-architecture.md) | How do the parts fit together? (diagrams) |
| [03 — Code map](03-code-map.md) | Which directory or file holds what? |
| [04 — Key flows](04-key-flows.md) | How does one action move through the code? (diagrams) |
| [05 — Local development](05-local-dev.md) | How do I run, test, and build it locally? |
| [06 — Features and plans](06-features.md) | What works today, and what comes next? |
| [07 — Agent brief](07-agent-brief.md) | Dense rules and invariants. Read before you edit code. |

## Fast routing

| Your question | Go to |
| --- | --- |
| "What is this repo?" | [01](01-what-it-is.md) |
| "Draw me the system." | [02](02-architecture.md) |
| "Where is the notification code?" | [03](03-code-map.md) |
| "What happens when a user taps a notification?" | [04](04-key-flows.md) |
| "How do I run the tests?" | [05](05-local-dev.md) |
| "Is dark mode built?" | [06](06-features.md) → [`docs/features.md`](../features.md) |
| "What must I not break?" | [07](07-agent-brief.md) |

## Maintenance rule

When you change architecture, add a screen, add a service, or change a
command, update the matching page here **in the same commit**. A stale map
costs more than no map.
