# Visual Direction

## Intent

This package intentionally does not define a finished visual style. Claude Design should use this as a structural starting point for exploring alternate visual systems.

## Do Not Prescribe

- Color palette.
- Typography family or scale.
- Spacing scale.
- Border radius.
- Shadows or elevation model.
- Icon style.
- Illustration or imagery style.
- Final chart aesthetics.

## Preserve These Semantic Signals

The visual direction should still make these distinctions clear:

- App identity and primary navigation.
- Active page.
- Live, refreshing, offline, or failed refresh status.
- Claude Code source versus Codex source.
- Selected Session.
- Empty detail state versus loaded detail state.
- Filtered list state.
- Estimated cost as a key metric.
- Total tokens as a key metric.
- High-cost Human requests inside a Session and high-cost LLM calls inside a Human request.
- Sortable analytical table headers and visible sort state.
- Keyboard focus.
- Modal/dialog active state.

## Desktop Constraints

The app is desktop-only. Visual exploration should assume enough horizontal space for:

- A top navigation bar.
- Overview metric and chart sections.
- A Sessions page with a left list/filter pane and right detail pane.
- Tables with multiple numeric columns.
- A large LLM call inspection dialog.

## Output Expectation

Any design exploration should keep the screen inventory, component inventory, and flows in this package intact unless a product decision explicitly changes them.
