<template>
  <div class="mb-4">
    <div class="input-group mb-2">
      <input v-model="csvUrlInput" type="url" placeholder="Enter a CSV location (http)" class="form-control form-control-sm" />
      <button class="btn btn-secondary btn-sm" @click="fetchCsv" :disabled="!csvUrlInput">Fetch & Add</button>
      <button class="btn btn-outline-secondary btn-sm" @click="clearAll" v-if="csvFiles.length">Clear all</button>
    </div>

    <div v-if="loading" class="mb-2 text-muted">Fetching CSV…</div>
    <div v-if="error" class="mb-2 text-danger">{{ error }}</div>

    <div v-if="csvFiles.length" class="mt-3">
      <ul class="list-group mb-2">
        <li class="list-group-item d-flex justify-content-between align-items-start" v-for="(f, idx) in csvFiles" :key="f.url">
          <div class="ms-2 me-auto">
            <div class="fw-bold"><a :href="f.url" target="_blank" rel="noopener">{{ f.url }}</a></div>
            <div class="small text-muted">{{ f.headers.length }} columns — {{ f.rows.length }} rows</div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-danger me-1" @click="remove(idx)">Remove</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import Papa from 'papaparse'

export default {
  name: 'CSVUploader',
  emits: ['csvs-changed'],
  data() {
    return {
      csvUrlInput: '',
      csvFiles: [], // { url, rows, headers, text }
      loading: false,
      error: null,
      previewIndex: null
    }
  },
  methods: {
    async fetchCsv() {
      this.error = null
      const url = this.csvUrlInput.trim()
      if (!url) {
        this.error = 'Please enter a CSV URL'
        return
      }
      this.loading = true
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch CSV (status ${res.status})`)
        const text = await res.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        if (parsed.errors && parsed.errors.length) {
          // show first error but still allow adding if you prefer
          this.error = `CSV parse error: ${parsed.errors[0].message}`
          this.loading = false
          return
        }
        const file = { url, rows: parsed.data, headers: parsed.meta.fields || [], text }
        // avoid duplicates
        if (!this.csvFiles.find(f => f.url === url)) {
          this.csvFiles.push(file)
          this.$emit('csvs-changed', this.csvFiles.slice())
          this.csvUrlInput = ''
        } else {
          this.error = 'URL already added'
        }
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        this.loading = false
      }
    },
    remove(idx) {
      this.csvFiles.splice(idx, 1)
      this.previewIndex = null
      this.$emit('csvs-changed', this.csvFiles.slice())
    },
    clearAll() {
      this.csvFiles = []
      this.previewIndex = null
      this.$emit('csvs-changed', this.csvFiles.slice())
    },
    preview(idx) {
      this.previewIndex = this.previewIndex === idx ? null : idx
    }
  }
}
</script>

<style scoped>
.table { font-size: 0.9rem; }
.list-group-item { cursor: default; }
</style>
