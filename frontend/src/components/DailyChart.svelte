<script>
  import { store } from '../store.svelte.js';
  import { fmtTokens, fmtTokensFull, fmtEstimatedCost } from '../lib/index.js';

  const TICKS = 4;

  // Pure CSS/flexbox chart: heights are percentages of a fixed-height container
  // and widths are distributed by flexbox, so it needs no pixel measurement and
  // renders correctly regardless of when layout settles. Mirrors the former
  // renderChart() exactly.
  const daily = $derived(store.summary?.daily ?? []);
  const max = $derived(Math.max(1, ...daily.map((d) => d['claude-code'].tokens + d.codex.tokens)));

  const yTicks = $derived(
    Array.from({ length: TICKS + 1 }, (_, i) => fmtTokens((max / TICKS) * (TICKS - i))),
  );
  const gridLines = $derived(
    Array.from({ length: TICKS + 1 }, (_, i) => (i / TICKS) * 100),
  );
  const bars = $derived(
    daily.map((d, i) => {
      const cc = d['claude-code'].tokens;
      const cx = d.codex.tokens;
      return {
        ccHeight: (cc / max) * 100,
        codexHeight: (cx / max) * 100,
        tip:
          `${d.date}\nClaude Code: ${fmtTokensFull(cc)} tok · ${fmtEstimatedCost(d['claude-code'].estimated_cost_usd)}` +
          `\nCodex: ${fmtTokensFull(cx)} tok · ${fmtEstimatedCost(d.codex.estimated_cost_usd)}`,
        // Sample x-axis labels: every 5th day plus the last.
        xLabel: i % 5 === 0 || i === daily.length - 1 ? d.date.slice(5) : '',
      };
    }),
  );
</script>

<div id="chart" class="chart">
  <div class="chart-grid">
    <div class="chart-y">
      {#each yTicks as label}
        <span class="y-tick">{label}</span>
      {/each}
    </div>
    <div class="chart-main">
      <div class="chart-bars">
        {#each gridLines as bottom}
          <div class="grid-line" style="bottom:{bottom}%"></div>
        {/each}
        {#each bars as bar}
          <div class="day-col" title={bar.tip}>
            <!-- codex on the bottom, claude-code stacked on top -->
            <div class="seg cc" style="height:{bar.ccHeight}%"></div>
            <div class="seg codex" style="height:{bar.codexHeight}%"></div>
          </div>
        {/each}
      </div>
      <div class="chart-x">
        {#each bars as bar}
          <span class="x-tick">{bar.xLabel}</span>
        {/each}
      </div>
    </div>
  </div>
</div>
