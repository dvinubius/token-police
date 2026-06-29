<script>
  import { store, setFilter, clearFilters } from '../store.svelte.js';

  // Project options derive from the loaded sessions, matching the former
  // populateProjectFilter().
  const projects = $derived(
    [...new Set(store.sessions.map((c) => c.project))].sort((a, b) => a.localeCompare(b)),
  );
</script>

<div class="filters">
  <input
    type="search"
    id="searchInput"
    placeholder="Search title or project…"
    value={store.filters.search}
    oninput={(e) => setFilter('search', e.currentTarget.value)}
  />
  <select
    id="sourceFilter"
    value={store.filters.source}
    onchange={(e) => setFilter('source', e.currentTarget.value)}
  >
    <option value="">All sources</option>
    <option value="claude-code">Claude Code</option>
    <option value="codex">Codex</option>
  </select>
  <select
    id="projectFilter"
    value={store.filters.project}
    onchange={(e) => setFilter('project', e.currentTarget.value)}
  >
    <option value="">All projects</option>
    {#each projects as p (p)}
      <option value={p}>{p}</option>
    {/each}
  </select>
  <label class="date-label"
    >From <input
      type="date"
      id="fromDate"
      value={store.filters.from}
      onchange={(e) => setFilter('from', e.currentTarget.value)}
    /></label
  >
  <label class="date-label"
    >To <input
      type="date"
      id="toDate"
      value={store.filters.to}
      onchange={(e) => setFilter('to', e.currentTarget.value)}
    /></label
  >
  <button id="clearFilters" class="ghost-btn" onclick={clearFilters}>Clear</button>
</div>
