<template>
  <div>
    <h3>CSV-W Context Editor</h3>
    <div>
      <small>Edit the JSON-LD context (JSON). The result will be merged into the JSON-LD document.</small>
      <textarea v-model="text" style="width:100%; height:320px; margin-top:8px; font-family:monospace; font-size:12px"></textarea>
    </div>
    <div style="margin-top:8px;">
      <button @click="apply">Apply</button>
      <button @click="reset">Reset</button>
    </div>
  </div>
</template>

<script>
export default {
  props: ['initialContext'],
  data(){
    return { text: JSON.stringify(this.initialContext, null, 2) }
  },
  methods: {
    apply(){
      this.$emit('context-changed', this.text)
    },
    reset(){
      this.text = JSON.stringify(this.initialContext, null, 2)
      this.apply()
    }
  }
}
</script>