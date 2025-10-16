<template>
  <div class="mb-4">
    <div class="d-flex align-items-center mb-2 gap-2">
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="toggleExcel" v-model="useExcel" />
        <label class="form-check-label small" for="toggleExcel">
          Upload Excel instead
        </label>
      </div>

      <div v-if="!useExcel" class="d-flex gap-2 w-100">
        <input v-model="csvUrlInput" type="url" placeholder="https://example.org/data.csv" class="form-control form-control-sm" />
        <button class="btn btn-secondary btn-sm" @click="fetchCsv" :disabled="!csvUrlInput">Fetch & Add</button>
        <button class="btn btn-outline-secondary btn-sm" @click="clearAll" v-if="csvFiles.length">Clear all</button>
      </div>

      <div v-else class="d-flex gap-2 w-100">
        <input ref="fileInput" type="file" accept=".xlsx,.xls" @change="onExcelFile" class="form-control form-control-sm" />
        <button class="btn btn-outline-secondary btn-sm" @click="clearAll" v-if="csvFiles.length">Clear all</button>
      </div>
    </div>

    <div v-if="loading" class="mb-2 text-muted">Processing…</div>
    <div v-if="error" class="mb-2 text-danger">{{ error }}</div>

    <div v-if="csvFiles.length" class="mt-3">
      <h5>Added CSVs / Sheets</h5>
      <ul class="list-group mb-2">
        <li class="list-group-item d-flex justify-content-between align-items-start" v-for="(f, idx) in csvFiles" :key="f.url">
          <div class="ms-2 me-auto">
            <div class="fw-bold text-truncate" style="max-width: 420px;">
              <a :href="f.url" target="_blank" rel="noopener">{{ f.url }}</a>
            </div>
            <div class="small text-muted">{{ f.headers.length }} columns — {{ f.rows.length }} rows</div>
          </div>

          <!-- Entity type selector -->
          <div class="me-3" style="min-width:220px">

            <select class="form-select form-select-sm" v-model="f.entityType" @change="emitChange">
              <option value="">Select a type for row</option>
              <option value="dcat:Catalog">dcat:Catalog</option>
              <option value="dcat:CatalogRecord">dcat:CatalogRecord</option>
              <option value="dcat:Resource">dcat:Resource</option>
              <option value="dcat:Dataset">dcat:Dataset</option>
              <option value="dcat:Service">dcat:Service</option>
              <option value="glosis:Site">glosis:Site</option>
              <option value="glosis:Plot">glosis:Plot</option>
              <option value="glosis:Profile">glosis:Profile</option>
              <option value="glosis:Element">glosis:Element</option>
              <option value="schema:Thing">schema:Thing</option>
              <option value="schema:CreativeWork">schema:CreativeWork</option>
              <option value="schema:Dataset">schema:Dataset</option>
              <option value="schema:Location">schema:Location</option>
              <option value="skos:Concept">skos:Concept</option>
              <option value="skos:ConceptScheme">skos:ConceptScheme</option>
              <option value="sosa:FeatureOfInterest">sosa:FeatureOfInterest</option>
              <option value="sosa:Observation">sosa:Observation</option>
              <option value="sosa:Sample">sosa:Sample</option>
            </select>
          </div>

          <div>
            <button class="btn btn-sm btn-outline-secondary me-1" @click="remove(idx)">Remove</button>
            <button class="btn btn-sm btn-outline-secondary" @click="preview(idx)">Preview</button>
          </div>
        </li>
      </ul>

      <div v-if="previewIndex !== null" class="mt-2">
        <h6>Preview — {{ csvFiles[previewIndex].url }}</h6>
        <div v-if="csvFiles[previewIndex].headers.length">
          <table class="table table-striped table-bordered table-sm">
            <thead class="table-dark">
              <tr>
                <th v-for="h in csvFiles[previewIndex].headers" :key="h">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in csvFiles[previewIndex].rows.slice(0,10)" :key="i">
                <td v-for="h in csvFiles[previewIndex].headers" :key="h">{{ row[h] }}</td>
              </tr>
            </tbody>
          </table>
          <small class="text-muted">Showing first 10 rows</small>
        </div>
        <div v-else class="text-muted">No headers detected.</div>
      </div>
    </div>
  </div>
</template>

<script>
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export default {
  name: 'CSVUploader',
  emits: ['csvs-changed'],
  data() {
    return {
      useExcel: false,
      csvUrlInput: '',
      csvFiles: [], // array of { url, rows, headers, text, entityType }
      loading: false,
      error: null,
      previewIndex: null
    }
  },
  methods: {
    async fetchCsv() {
      this.error = null
      this.loading = true
      try {
        const url = this.csvUrlInput.trim()
        if (!url) throw new Error('Please enter a CSV URL')
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch CSV (status ${res.status})`)
        const text = await res.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        if (parsed.errors && parsed.errors.length) {
          throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
        }
        // add default entityType = ''
        const file = { url, rows: parsed.data, headers: parsed.meta.fields || [], text, entityType: '' }
        if (!this.csvFiles.find(f => f.url === url)) {
          this.csvFiles.push(file)
          this.emitChange()
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

    async onExcelFile(ev) {
      this.error = null
      const f = ev.target.files && ev.target.files[0]
      if (!f) return
      this.loading = true
      try {
        const arrayBuffer = await fileToArrayBuffer(f)
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const baseName = f.name.replace(/\.[^/.]+$/, '')
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null })
          const headerIndex = detectHeaderRow(raw)
          const headerRow = (raw[headerIndex] || []).map(c => (c == null ? '' : String(c).trim()))
          const rows = []
          let emptyStreak = 0
          for (let i = headerIndex + 1; i < raw.length; i++) {
            const r = raw[i]
            if (!r || r.every(c => c === null || c === undefined || String(c).trim() === '')) {
              emptyStreak++
              if (emptyStreak >= 5) break
              else continue
            }
            emptyStreak = 0
            const obj = {}
            for (let j = 0; j < headerRow.length; j++) {
              const key = headerRow[j] || `col${j+1}`
              obj[key] = (r[j] == null ? '' : r[j])
            }
            rows.push(obj)
          }
          const escapeCell = (v) => {
            if (v == null) return ''
            const s = String(v)
            if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
              return '"' + s.replace(/"/g, '""') + '"'
            }
            return s
          }
          const csvLines = []
          csvLines.push(headerRow.map(escapeCell).join(','))
          for (const r of rows) {
            const line = headerRow.map(h => escapeCell(r[h])).join(',')
            csvLines.push(line)
          }
          const csvText = csvLines.join('\n')
          const entryUrl = `${baseName}#${sheetName}`
          // default entityType = ''
          const entry = { url: entryUrl, rows, headers: headerRow, text: csvText, entityType: '' }
          if (!this.csvFiles.find(f => f.url === entryUrl)) {
            this.csvFiles.push(entry)
          }
        }
        this.emitChange()
        if (this.$refs.fileInput) this.$refs.fileInput.value = ''
      } catch (err) {
        this.error = 'Failed to parse Excel file: ' + (err && err.message ? err.message : String(err))
      } finally {
        this.loading = false
      }

      function fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = (e) => reject(e)
          reader.readAsArrayBuffer(file)
        })
      }

      function detectHeaderRow(rows) {
        const maxScan = Math.min(rows.length, 20)
        const minFollowing = 2
        let bestIdx = 0
        let bestScore = -Infinity
        const isEmptyRow = (r) => {
          if (!r) return true
          return r.every(c => c === null || c === undefined || String(c).trim() === '')
        }
        for (let i = 0; i < maxScan; i++) {
          const row = rows[i] || []
          if (isEmptyRow(row)) continue
          const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length
          if (nonEmpty === 0) continue
          const uniqueCount = new Set(row.map(c => (c==null? '' : String(c).trim()))).size
          const uniqueness = uniqueCount / Math.max(1, nonEmpty)
          let followingGood = 0, followingChecked = 0
          for (let j = i + 1; j < Math.min(rows.length, i + 1 + 10); j++) {
            const r2 = rows[j] || []
            const nonEmpty2 = r2.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length
            if (nonEmpty2 === 0) { followingChecked++; continue }
            if (nonEmpty2 >= Math.max(1, Math.floor(nonEmpty * 0.5))) followingGood++
            followingChecked++
          }
          const followRatio = followingChecked === 0 ? 0 : (followingGood / followingChecked)
          const score = nonEmpty * 0.6 + uniqueness * 2.0 + followRatio * 5.0
          if (uniqueness < 0.3) continue
          if (score > bestScore) {
            bestScore = score
            bestIdx = i
          }
        }
        if (bestScore === -Infinity) {
          for (let i = 0; i < Math.min(rows.length, 5); i++) {
            if (!isEmptyRow(rows[i])) return i
          }
          return 0
        }
        return bestIdx
      }
    },

    remove(idx) {
      this.csvFiles.splice(idx, 1)
      this.previewIndex = null
      this.emitChange()
    },

    preview(idx) {
      this.previewIndex = this.previewIndex === idx ? null : idx
    },

    clearAll() {
      this.csvFiles = []
      this.previewIndex = null
      this.error = null
      this.emitChange()
    },

    emitChange() {
      // ensure we emit a fresh array reference
      this.$emit('csvs-changed', this.csvFiles.slice())
    }
  }
}
</script>

<style scoped>
.table { font-size: 0.9rem }
</style>
