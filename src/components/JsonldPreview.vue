<template>
  <div>
    <h3>JSON-LD preview</h3>
    <pre style="white-space:pre-wrap; background:#f6f6f6; padding:8px; height:400px; overflow:auto">{{ pretty }}</pre>
  </div>
</template>

<script>
export default {
  props: ['jsonld'],
  computed: {
    pretty(){
      try { return JSON.stringify(this.jsonld, null, 2) }
      catch(e){ return '' }
    }
  }
}
</script>