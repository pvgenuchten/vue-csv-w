<template>
  <div class="mb-4">
    <label class="form-label">CSV URL (online)</label>
    <div class="input-group mb-2">
      <input v-model="csvUrlInput" type="url" placeholder="https://example.org/data.csv" class="form-control form-control-sm" />
      <button class="btn btn-secondary btn-sm" @click="fetchCsv" :disabled="!csvUrlInput">Fetch & Preview</button>
      <button class="btn btn-outline-secondary btn-sm" @click="clear" v-if="rows.length">Clear</button>
    </div>

    <div v-if="loading" class="mb-2 text-muted">Fetching CSV…</div>
    <div v-if="error" class="mb-2 text-danger">{{ error }}</div>

    <div v-if="rows.length" class="mt-3">
      <h5>CSV Preview</h5>
      <table class="table table-striped table-bordered table-sm">
        <thead class="table-dark">
          <tr>
            <th v-for="h in headers" :key="h">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows.slice(0,10)" :key="i">
            <td v-for="h in headers" :key="h">{{ row[h] }}</td>
          </tr>
        </tbody>
      </table>
      <small class="text-muted">Showing first 10 rows — fetched from: <a :href="csvUrl" target="_blank">{{ csvUrl }}</a></small>
    </div>
  </div>
</template>

<script>
import Papa from 'papaparse'

export default {
  name: 'CSVUploader',
  emits: ['csv-loaded'],
  data() {
    return {
      csvUrlInput: '',
      csvUrl: '',
      rows: [],
      headers: [],
      csvText: '',
      loading: false,
      error: null
    }
  },
  methods: {
    async fetchCsv() {
      this.error = null
      this.loading = true
      this.rows = []
      this.headers = []
      this.csvText = ''
      this.csvUrl = ''

      try {
        const url = this.csvUrlInput.trim()
        if (!url) throw new Error('Please enter a CSV URL')
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch CSV (status ${res.status})`)
        const text = await res.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        if (parsed.errors && parsed.errors.length) {
          // show first error
          this.error = `CSV parse error: ${parsed.errors[0].message}`
        } else {
          this.rows = parsed.data
          this.headers = parsed.meta.fields || []
          this.csvText = text
          this.csvUrl = url
          // emit rows + headers + raw text + url so downstream can use the URL in metadata
          this.$emit('csv-loaded', { rows: this.rows, headers: this.headers, csvText: this.csvText, csvUrl: this.csvUrl })
        }
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.csvUrlInput = ''
      this.csvUrl = ''
      this.rows = []
      this.headers = []
      this.csvText = ''
      this.error = null
      this.$emit('csv-loaded', { rows: [], headers: [], csvText: '', csvUrl: '' })
    }
  }
}
</script>

<style scoped>
.table { font-size: 0.9rem }
</style>