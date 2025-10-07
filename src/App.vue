<template>
  <div class="container py-4">
    <h2 class="mb-4">CSV-W Editor (Server-based)</h2>

    <!-- Input for online CSV URL -->
    <div class="mb-3">
      <label for="csvUrl" class="form-label">CSV URL</label>
      <div class="input-group">
        <input
          id="csvUrl"
          type="url"
          class="form-control"
          v-model="csvUrl"
          placeholder="https://example.com/data.csv"
        />
        <button class="btn btn-primary" @click="loadCsv">Load CSV</button>
      </div>
      <div v-if="error" class="text-danger small mt-1">{{ error }}</div>
    </div>

    <!-- Preview -->
    <div v-if="csvRows.length" class="table-responsive mb-4">
      <h5>CSV Preview (first 10 rows)</h5>
      <table class="table table-striped table-bordered table-sm">
        <thead>
          <tr>
            <th v-for="(header, i) in csvHeaders" :key="i">{{ header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rIdx) in csvRows.slice(0, 10)" :key="rIdx">
            <td v-for="header in csvHeaders" :key="header">{{ row[header] }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <CSVWClientParser
      v-if="csvHeaders.length"
      :csvHeaders="csvHeaders"
      :csvRows="csvRows"
      :csvUrl="csvUrl"
    />
  </div>
</template>

<script>
import Papa from 'papaparse'
import CSVWClientParser from './components/CSVWClientParser.vue'

export default {
  name: 'App',
  components: { CSVWClientParser },
  data() {
    return {
      csvUrl: '',
      csvRows: [],
      csvHeaders: [],
      error: null
    }
  },
  methods: {
    async loadCsv() {
      this.error = null
      this.csvRows = []
      this.csvHeaders = []

      if (!this.csvUrl) {
        this.error = 'Please enter a CSV URL.'
        return
      }

      try {
        const response = await fetch(this.csvUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        this.csvHeaders = parsed.meta.fields || []
        this.csvRows = parsed.data || []
      } catch (e) {
        this.error = 'Failed to load CSV: ' + e.message
      }
    }
  }
}
</script>