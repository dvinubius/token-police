<script>
  // Placeholder shell for the Svelte + Vite migration. The full Stats /
  // Sessions UI is assembled in later issues; this confirms the build, dev
  // proxy, and serve pipeline are wired up.
  const apiBase = '/api';
</script>

<main class="migration-placeholder">
  <h1>Token Police</h1>
  <p class="tagline">Agentic surveillance — Svelte + Vite migration in progress.</p>
  <p class="dim">UI is being rebuilt as declarative components. The API at <code>{apiBase}</code> is unchanged.</p>
</main>

<style>
  .migration-placeholder {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 40rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
    line-height: 1.5;
  }
  h1 {
    margin: 0 0 0.25rem;
  }
  .tagline {
    margin: 0 0 1rem;
    font-weight: 600;
  }
  .dim {
    opacity: 0.7;
  }
  code {
    font-family: ui-monospace, monospace;
  }
</style>
