<script>
  import { store, toggleTheme } from '../store.svelte.js';

  // The toggle flips to the opposite theme; its label describes the destination,
  // matching the former applyTheme() wiring.
  const nextTheme = $derived(store.theme === 'dark' ? 'light' : 'dark');
  const label = $derived(nextTheme === 'light' ? 'Switch to light theme' : 'Switch to dark theme');
</script>

<button
  type="button"
  class="theme-toggle"
  id="themeToggle"
  data-next-theme={nextTheme}
  aria-label={label}
  title={label}
  onclick={toggleTheme}
>
  <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2"></path>
    <path d="M12 20v2"></path>
    <path d="m4.93 4.93 1.41 1.41"></path>
    <path d="m17.66 17.66 1.41 1.41"></path>
    <path d="M2 12h2"></path>
    <path d="M20 12h2"></path>
    <path d="m6.34 17.66-1.41 1.41"></path>
    <path d="m19.07 4.93-1.41 1.41"></path>
  </svg>
  <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
  </svg>
</button>
