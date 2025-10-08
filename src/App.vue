<template>
  <div class="container py-4">
    <h2 class="mb-3">CSVW editor</h2>
    <p>Select one or more CSV files, which are published on the web. Mind that the remote webserver should support 
    <a href="https://en.wikipedia.org/wiki/Cross-origin_resource_sharing">CORS</a>. Then run the `extract headers`
    command to extract metadata from the CSV's. Then update the metadata to your needs and run `process CSV` to generate
    RDF (as json-ld, other serialisations are supported by the API)</p>

    <CSVUploader @csvs-changed="onCsvsChanged" />
    <ExcelUploader @csvs-changed="onCsvsChanged" />

    <CSVWClientParser
      v-if="combinedHeaders.length"
      :csvFiles="csvFiles"
    />
  </div>
</template>

<script>
import CSVUploader from './components/CSVUploader.vue'
import CSVWClientParser from './components/CSVWClientParser.vue'

export default {
  name: 'App',
  components: { CSVUploader, CSVWClientParser },
  data() {
    return {
      csvFiles: [] // array of { url, rows, headers, text }
    }
  },
  computed: {
    combinedHeaders() {
      const seen = new Set()
      this.csvFiles.forEach(f => (f.headers || []).forEach(h => seen.add(h)))
      return Array.from(seen)
    },
    // combined rows: concatenate rows from all files, normalizing keys
    combinedRows() {
      const rows = []
      for (const f of this.csvFiles) {
        for (const r of (f.rows || [])) {
          rows.push(r)
        }
      }
      return rows
    }
  },
  methods: {
    onCsvsChanged(payload) {
        // payload may be a single entry or an array
        if (Array.isArray(payload)) {
        for (const e of payload) this.csvFiles.push(e)
        } else if (payload && payload.url) {
        this.csvFiles.push(payload)
        }
    } 
  },
}
</script>
