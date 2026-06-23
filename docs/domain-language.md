# Domain Language

Project-specific canonical terms used in code, tests, and docs.

## Terms

**Session**: A single imported agent transcript from one source system, such as Codex or Claude Code, associated with a project and containing one or more billable LLM calls grouped by human requests.
_Avoid_: Conversation, chat

**Human request**: One user-authored instruction or prompt within a Session, used as the unit for grouping the LLM calls that were triggered while handling that request.
_Avoid_: Prompt, turn, message

**LLM call**: One recorded model invocation within a Session, with its model, timestamp, token buckets, context-window usage, and estimated cost.
_Avoid_: Turn, response, completion

**Estimated cost**: The app's USD approximation of what recorded token usage would cost at configured per-token model rates; it is not an invoice, subscription charge, or authoritative provider bill.
_Avoid_: Spend, bill, charge

**Token bucket**: One of the mutually exclusive categories of tokens recorded for an LLM call: fresh input, output, cache read, or cache write. Token buckets are summed for token totals and multiplied by their own rates for Estimated cost.
_Avoid_: Token type, usage type
