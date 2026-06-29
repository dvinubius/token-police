<script>
  // Expandable per-call insight panel, mirroring the former llmCallInsightPanel()
  // + detailField() markup. The hot rows surface two extra cost-attribution
  // fields. Every field passes a non-empty fallback, so the "Not captured"
  // dim branch from detailField never applies here.
  let { call, hot } = $props();

  const assistantTitle = $derived(call.assistant_full_text || call.assistant_preview || undefined);
</script>

<div class="llm-insights">
  <div class="insight-field">
    <div class="insight-label">Activity</div>
    <div class="insight-value">{call.activity_summary || 'No tool activity captured'}</div>
  </div>
  <div class="insight-field">
    <div class="insight-label">Assistant preview</div>
    <div class="insight-value" title={assistantTitle}>
      {call.assistant_preview || 'No assistant text captured'}
    </div>
  </div>
  <div class="insight-field">
    <div class="insight-label">Outcome</div>
    <div class="insight-value">{call.outcome || 'LLM call recorded'}</div>
  </div>
  {#if hot}
    <div class="insight-field">
      <div class="insight-label">Cost driver</div>
      <div class="insight-value">{call.cost_driver || 'No single dominant driver detected'}</div>
    </div>
    <div class="insight-field">
      <div class="insight-label">Tool / command hint</div>
      <div class="insight-value">{call.tool_hint || 'No tool hint captured'}</div>
    </div>
  {/if}
</div>
