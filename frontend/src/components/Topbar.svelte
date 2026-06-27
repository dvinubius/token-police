<script>
  import { store, setPage } from '../store.svelte.js';
  import ThemeToggle from './ThemeToggle.svelte';

  const tabs = [
    { target: 'stats', label: 'Stats' },
    { target: 'sessions', label: 'Sessions' },
  ];
</script>

<header class="topbar">
  <div class="brand">
    <span class="logo" aria-hidden="true">
      <svg class="logo-badge" viewBox="0 0 32 36" focusable="false">
        <path class="logo-shell" d="M16 1.9c2.4 2 5.8 2.8 10.6 2.1-.3 3.5.8 6 3.4 8-2.5 2.7-2.8 8.9-4.7 13-1.7 3.8-5.1 6.6-9.3 8.9-4.2-2.3-7.6-5.1-9.3-8.9C4.8 20.9 4.5 14.7 2 12c2.6-2 3.7-4.5 3.4-8C10.2 4.7 13.6 3.9 16 1.9Z" />
        <path class="logo-inset" d="M16 5.4c2.1 1.5 4.8 2.2 8.3 1.9.1 2.5 1 4.4 2.6 5.9-1.8 2.8-2.1 7.5-3.6 10.5-1.4 2.7-4 5-7.3 6.9-3.3-1.9-5.9-4.2-7.3-6.9-1.5-3-1.8-7.7-3.6-10.5 1.6-1.5 2.5-3.4 2.6-5.9 3.5.3 6.2-.4 8.3-1.9Z" />
        <path class="logo-crest" d="M10.7 10.2c1.9.5 3.7.2 5.3-.8 1.6 1 3.4 1.3 5.3.8" />
        <text class="logo-glyph" x="16" y="20">$</text>
      </svg>
    </span>
    <div class="brand-copy">
      <h1>Token Police</h1>
      <span class="brand-tagline">AGENTIC SURVEILLANCE</span>
    </div>
  </div>
  <nav class="page-nav" aria-label="Primary">
    {#each tabs as tab (tab.target)}
      <button
        type="button"
        class="page-tab"
        class:active={store.page === tab.target}
        data-page-target={tab.target}
        aria-current={store.page === tab.target ? 'page' : undefined}
        onclick={() => setPage(tab.target)}
      >{tab.label}</button>
    {/each}
  </nav>
  <div class="topbar-actions">
    <ThemeToggle />
    <div class="refresh" id="refreshIndicator" title="Auto-refreshes every 30s">
      <span class="dot"></span><span id="refreshText">{store.refreshStatus}</span>
    </div>
  </div>
</header>
