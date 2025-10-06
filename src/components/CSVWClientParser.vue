<template>
  <div>
    <h3 class="mb-3">CSVW Client-side parser</h3>

    <div class="d-flex gap-2 mb-3 align-items-center">
      <button class="btn btn-primary btn-sm" @click="generateRDF" :disabled="running || !csvText">Generate JSON-LD & TTL</button>
      <button class="btn btn-secondary btn-sm" @click="validateMetadata" :disabled="validating">Validate JSON-LD</button>
      <button class="btn btn-outline-secondary btn-sm" @click="extractHeaders" :disabled="!csvHeaders || !csvHeaders.length">Extract headers</button>
      <div v-if="running" class="ms-2 text-muted">⏳ Running...</div>
      <div v-if="error" class="ms-2 text-danger">{{ error }}</div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <h4>CSV-W metadata (JSON-LD)</h4>
        <Codemirror v-model="metadataText" :extensions="cmExtensions" class="border rounded" style="height:420px;" />
      </div>
      <div class="col-md-6">
        <h4>Output</h4>
        <div class="mb-3">
          <strong>JSON-LD</strong>
          <pre class="bg-light p-2 border rounded small" style="max-height:180px; overflow:auto">{{ prettyJsonld }}</pre>
        </div>
        <div>
          <strong>Turtle</strong>
          <pre class="bg-light p-2 border rounded small" style="max-height:120px; overflow:auto">{{ ttl || 'No TTL yet' }}</pre>
        </div>
      </div>
    </div>

    <div v-if="quadCount !== null" class="mt-2 text-muted">Triples produced: {{ quadCount }}</div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import jsonld from 'jsonld'
import Papa from 'papaparse'

export default defineComponent({
  name: 'CSVWClientParser',
  components: { Codemirror },
  props: {
    csvRows: { type: Array, default: () => [] },
    csvHeaders: { type: Array, default: () => [] },
    csvText: { type: String, default: '' },
    initialContext: { type: Object, default: () => ({ '@context': {} }) }
  },
  data() {
    return {
      metadataText: JSON.stringify(this.initialContext, null, 2),
      jsonldOut: null,
      ttl: '',
      error: null,
      running: false,
      validating: false,
      quadCount: null,
      cmExtensions: [json(), oneDark]
    }
  },
  computed: {
    prettyJsonld() {
      try { return JSON.stringify(this.jsonldOut, null, 2) } catch(e) { return '' }
    }
  },
  methods: {
    extractHeaders() {
      if (!this.csvHeaders.length) {
        this.error = 'No headers to extract.'
        return
      }
      const context = { '@vocab': 'http://example.org/vocab#' }
      const columns = this.csvHeaders.map(h => ({ titles: h }))
      this.csvHeaders.forEach(h => { context[h] = `http://example.org/vocab#${h.replace(/[^a-zA-Z0-9_]/g,'_')}` })
      const metadata = { '@context': context, url: 'data.csv', tableSchema: { columns } }
      this.metadataText = JSON.stringify(metadata, null, 2)
      this.error = null
    },

    async validateMetadata() {
      this.validating = true
      this.error = null
      try {
        const metadata = JSON.parse(this.metadataText)
        await jsonld.toRDF(metadata, { format: 'application/n-quads' })
      } catch(e) {
        this.error = 'Invalid JSON-LD: ' + e.message
      } finally {
        this.validating = false
      }
    },

    async generateRDF() {
      this.running = true
      this.error = null
      this.jsonldOut = null
      this.ttl = ''
      this.quadCount = null

      try {
        const metadata = JSON.parse(this.metadataText)
        const rows = Papa.parse(this.csvText, { header: true }).data

        // Build JSON-LD manually
        const graph = rows.map(row => {
          const obj = {}
          this.csvHeaders.forEach(h => {
            const key = metadata['@context'][h] ? h : h
            obj[key] = row[h]
          })
          return obj
        })

        const jsonldDoc = { '@context': metadata['@context'], '@graph': graph }
        this.jsonldOut = jsonldDoc

        // Convert JSON-LD to N-Quads / TTL
        const nquads = await jsonld.toRDF(jsonldDoc, { format: 'application/n-quads' })
        this.ttl = nquads
        this.quadCount = graph.length
      } catch(e) {
        this.error = e.message || String(e)
      } finally {
        this.running = false
      }
    }
  }
})
</script>

<style scoped>
.font-monospace { font-family: monospace; }
</style>
