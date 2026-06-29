<script>
  import { fmtTokens, fmtTokensFull } from '../lib/index.js';

  let { n } = $props();
</script>

<td title="{fmtTokensFull(n)} tokens">{fmtTokens(n)}</td>
