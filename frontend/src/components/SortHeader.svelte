<script>
  import { store, setTableSort } from '../store.svelte.js';

  let { table, key, label, alignClass = '' } = $props();

  const sort = $derived(store.tableSorts[table]);
  const active = $derived(!!sort && sort.key === key);
  const dir = $derived(active ? sort.dir : '');
  const ariaSort = $derived(active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const indicator = $derived(active ? (dir === 'asc' ? '▲' : '▼') : '');
</script>

<th class="{`${alignClass} sortable`.trim()}" aria-sort={ariaSort}>
  <button
    type="button"
    class="sort-btn"
    aria-label="Sort by {label}"
    onclick={(e) => {
      e.stopPropagation();
      setTableSort(table, key);
    }}
  >
    <span>{label}</span><span class="sort-indicator" aria-hidden="true">{indicator}</span>
  </button>
</th>
