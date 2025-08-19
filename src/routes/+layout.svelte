<script lang="ts">
  import "../app.css";
</script>

<main>
  <slot />
</main>

<style>
  :global(html) {
    font-family: Inter, system-ui, sans-serif;
  }

  :global(body) {
    margin: 0;
    background-color: #fafafa;
    line-height: 1.6;
  }
</style>
