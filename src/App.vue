<template>
  <div class="container py-4">
    <h1 class="mb-4">CSVW Editor</h1>
    <CSVUploader @csv-loaded="onCsvLoaded" />
    <CSVWClientParser
      v-if="csvText"
      :csvRows="csvRows"
      :csvHeaders="csvHeaders"
      :csvText="csvText"
    />
  </div>
</template>

<script>
import CSVUploader from './components/CSVUploader.vue'
import CSVWClientParser from './components/CSVWClientParser.vue'

export default {
  components: { CSVUploader, CSVWClientParser },
  data() {
    return { csvRows: [], csvHeaders: [], csvText: '' }
  },
  methods: {
    onCsvLoaded({ rows, headers, text }) {
      this.csvRows = rows
      this.csvHeaders = headers
      this.csvText = text
    }
  }
}
</script>
