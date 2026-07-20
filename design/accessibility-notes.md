# Accessibility Notes

## Scope

The product is desktop-only, but desktop-only does not remove keyboard, semantic, contrast, or assistive technology requirements.

## Navigation

- Primary navigation should expose the active page.
- Page changes should not trap focus.
- Hash navigation should remain predictable for reloads and browser history expectations.

## Tables

- Human request and LLM call data should remain in real table structures.
- Column headers must describe numeric buckets clearly.
- Sortable column headers should expose their current sort direction and remain keyboard reachable.
- Numeric columns should be aligned consistently.
- Long text should be accessible in full outside truncated table previews.
- Expanded LLM call details should remain associated with their triggering row and should not change table column semantics.

## Dialog

- LLM Call Dialog should use modal dialog semantics.
- Dialog title should identify the current Human request.
- Dialog header should expose model context below the title.
- Prompt text blocks should have visible labels such as Initial session prompt and Request prompt.
- Opening the dialog should move focus to a reliable control or heading.
- Escape should close the dialog.
- Closing should return focus to the triggering Human request row when feasible.
- Background content should not be interactive while the dialog is open.

## Keyboard Interaction

- Page tabs must be keyboard reachable.
- Filter controls must be keyboard reachable in logical order.
- Session rows should be activatable without pointer input for selection.
- Parent Session expansion should use a dedicated keyboard-reachable chevron button with an accessible name and `aria-expanded`; whole-row activation should not toggle subagent visibility.
- Human request rows should be activatable with Enter and Space.
- LLM call rows should be expandable and collapsible with keyboard activation.
- Close controls must have accessible names.

## Status And Feedback

- Live/offline refresh status should not rely on visual treatment alone.
- Empty states should use text, not only absence of content.
- High-cost Human request and LLM call emphasis should not rely on color alone.
- Selected Session and keyboard focus should be distinguishable from each other.

## Content

- Preserve canonical domain terms from `docs/domain-language.md`.
- Avoid language that implies authoritative billing. Use Estimated cost.
- Avoid language that implies cloud upload or account-backed analytics.

## Current Implementation Gaps

- **Unscrollable UI:** On the Sessions page, a large number of expanded
  subagent rows can push the detail table out of view with no way to scroll it
  back into view.
- Session rows and Top Session items are click-only; they do not yet expose a
  keyboard selection action or programmatic selected state.
- The dialog focuses its close button on open, but it does not trap focus,
  mark the background inert, or restore focus to the triggering Human request
  row on close.
- The backdrop click target is a non-interactive `div` with a suppressed Svelte
  semantics warning; the nested dialog itself does have `role="dialog"` and
  `aria-modal="true"`.
- The click-only rows and backdrop also appear in the Svelte build warnings.
  All listed gaps should remain explicit here until the interaction code
  changes.
