<template>
  <div class="container py-4">
  <div class="border rounded m-3 p-3">
    <h2 class="mb-3">CSVW editor</h2>
    <p>Select one or more CSV files, which are published on the web. Mind that the remote webserver should support 
    <a href="https://en.wikipedia.org/wiki/Cross-origin_resource_sharing">CORS</a>. Then run the `extract headers`
    command to extract metadata from the CSV's. Then update the metadata to your needs and run `process CSV` to generate
    RDF (as json-ld, other serialisations are supported by the API)</p>

    <!-- CSVUploader emits the whole csvFiles array on every change -->
    <CSVUploader @csvs-changed="onCsvsChanged" />


    <!-- pass the authoritative csvFiles array as prop -->
    <CSVWClientParser
      v-if="csvFiles.length"
      :csvFiles="csvFiles"
    />
  </div>
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
      csvFiles: [] // canonical array managed by parent
    }
  },
  methods: {
    // IMPORTANT: replace the parent's array reference with the emitted one.
    // This ensures child components (passed csvFiles as props) always receive the current
    // list and triggers re-render / watchers.
    onCsvsChanged(files) {
      // Defensive: if payload is a single entry (older component), normalize
      if (!files) {
        this.csvFiles = []
        return
      }
      if (Array.isArray(files)) {
        // assign new array reference so Vue can detect change
        this.csvFiles = files.slice()
      } else if (files && files.url) {
        // single-entry case: append (or you can replace if you prefer)
        this.csvFiles = this.csvFiles.concat([files])
      } else {
        this.csvFiles = []
      }
    }
  }
}
</script>
