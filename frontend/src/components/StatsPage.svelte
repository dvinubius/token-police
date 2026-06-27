<script>
  import { store } from '../store.svelte.js';
  import GlobalStats from './GlobalStats.svelte';
  import DailyChart from './DailyChart.svelte';
  import TopSessions from './TopSessions.svelte';
</script>

<section class="page overview stats-page" id="statsPage" data-page="stats" hidden={store.page !== 'stats'}>
  <GlobalStats />
  <div class="card chart-card">
    <div class="card-head">
      <h2>Daily token usage — last <span class="num">30</span> days</h2>
      <div class="legend">
        <span class="legend-item"><i class="swatch cc"></i>Claude Code</span>
        <span class="legend-item"><i class="swatch codex"></i>Codex</span>
      </div>
    </div>
    <DailyChart />
  </div>
  <div class="card top-card">
    <div class="card-head"><h2>Top <span class="num">5</span> expensive sessions</h2></div>
    <TopSessions />
  </div>
</section>
