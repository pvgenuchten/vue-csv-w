<template>
  <div>
    <div class="d-flex gap-2 mb-3 align-items-center">
      <input type="hidden" v-model="serverUrl" class="form-control form-control-sm me-2" style="max-width:480px" />
      <div v-if="error" class="ms-2 text-danger">{{ error }}</div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
      <div class="border rounded p-3">
        <h4>
          Tables 
          <button class="btn btn-outline-secondary btn-sm float-end" @click="extractHeaders" :disabled="!csvFiles || !csvFiles.length">Extract metadata</button>
          
        </h4>

        <div v-if="!csvFiles.length" class="text-muted">No tables added.</div>
        <ul class="nav nav-tabs mb-3" role="tablist" v-if="csvFiles.length">
          <li class="nav-item" v-for="(f, idx) in csvFiles" :key="f.url">
            <button class="nav-link" :class="{ active: activeIndex === idx }" @click="activeIndex = idx" type="button">
              {{ filenameLabel(f.url, idx) }}
            </button>
          </li>
        </ul>

        <div v-if="csvFiles.length" class="tab-content">
          <div class="tab-pane active">
            <div v-if="currentFile">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="text-end">
                  <label class="form-label small mb-0">Link to another table (optional)</label>
                  <div class="d-flex gap-1">
                    <select class="form-select form-select-sm" v-model="relationships[currentFile.url].target" :disabled="otherTables.length===0">
                      <option value="">(none)</option>
                      <option v-for="t in otherTables" :key="t.url" :value="t.url">{{ filenameLabel(t.url) }}</option>
                    </select>

                    <select class="form-select form-select-sm" v-model="relationships[currentFile.url].sourceField">
                      <option value="">(select field)</option>
                      <option v-for="h in currentFile.headers" :key="h" :value="h">{{ h }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div v-if="currentFile.headers.length">
                <table class="table table-striped table-bordered table-sm">
                  <thead class="table-dark"><tr><th v-for="h in currentFile.headers" :key="h">{{ h }}</th></tr></thead>
                  <tbody>
                    <tr v-for="(row,i) in currentFile.rows.slice(0,10)" :key="i">
                      <td v-for="h in currentFile.headers" :key="h">{{ row[h] }}</td>
                    </tr>
                  </tbody>
                </table>
                <small class="text-muted">Showing first 10 rows</small>
              </div>
              <div v-else class="text-muted">No headers detected in this file.</div>
            </div>
          </div>
        </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="border rounded p-3">
          <h4>
            Table metadata 
            <button class="btn btn-primary btn-sm float-end" @click="postMetadata" :disabled="running">Process CSV</button>
            <button class="btn btn-sm btn-outline-secondary float-end" @click="downloadPackage">Download package</button>
            <div v-if="running" class="ms-2 text-muted float-end">⏳ Sending...</div>
          </h4>
          <Codemirror v-model="metadataText" :extensions="cmExtensions" class="border rounded" style="height:420px;" />
        </div>
      </div>
    </div>

    <div class="row mt-3">
      <div class="col-12">
        <h4>Graph
        <button class="btn btn-sm btn-outline-secondary float-end" @click="downloadJSONLD">Download graph</button>
        </h4>
        <div class="mb-3">
          <pre class="bg-light p-2 border rounded small" style="max-height:220px; overflow:auto">{{ prettyJsonld }}</pre>
        </div>
      </div>
    </div>

    <div v-if="tripleCount !== null" class="mt-2 text-muted">Triples returned: {{ tripleCount }}</div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

export default defineComponent({
  name: 'CSVWClientParser',
  components: { Codemirror },
  props: {
    csvFiles: { type: Array, default: () => [] },
    initialContext: { type: Object, default: () => ({ '@context': {} }) }
  },
  data() {
    return {
      localTables: [],
      serverUrl: 'http://localhost:8000/convert/',
      metadataText: JSON.stringify(this.initialContext, null, 2),
      jsonldOut: null,
      ttl: '',
      error: null,
      running: false,
      validating: false,
      tripleCount: null,
      cmExtensions: [json(), oneDark],
      activeIndex: 0,
      relationships: {} // map url -> { target: '', sourceField: '' }
    }
  },
  created() {
    // init once
    this.localTables = (this.csvFiles || []).slice()
  },
  computed: {
    prettyJsonld() {
      try { return JSON.stringify(this.jsonldOut, null, 2) || '' } catch (e) { return '' }
    },
    currentFile() {
      return this.csvFiles && this.csvFiles[this.activeIndex] ? this.csvFiles[this.activeIndex] : null
    },
    otherTables() {
      if (!this.currentFile) return []
      return this.csvFiles.filter(f => f.url !== this.currentFile.url)
    }
  },
  watch: {
    csvFiles: {
      handler(newFiles) {
        this.localTables = (newFiles || []).slice()
        // initialize relationships entries for each file if not present
        for (const f of newFiles) {
          if (!this.relationships[f.url]) this.relationships[f.url] = { target: '', sourceField: '' }
        }
        // remove relationships for files no longer present
        Object.keys(this.relationships).forEach(k => {
          if (!newFiles.find(f => f.url === k)) delete this.relationships[k]
        })
      },
      immediate: true
    }
  },
  methods: {
    filenameLabel(url, idx) {
      try {
        const parts = url.split('/')
        let name = parts[parts.length-1] || url
        if (!name) name = `file${idx+1}`
        return name
      } catch (e) {
        return `file${idx+1}`
      }
    },

    // Validate JSON shape quickly
    async validateMetadata() {
      this.validating = true
      this.error = null
      try {
        JSON.parse(this.metadataText)
      } catch (e) {
        this.error = 'Invalid JSON: ' + e.message
      } finally {
        this.validating = false
      }
    },

    // Build tables[] metadata: one tableSchema per CSV file (uses relationships for foreign keys)
    extractHeaders() {
      try {
        const files = this.csvFiles || []
        if (!files.length) {
          this.error = 'No CSV files added.'
          return
        }

        // helpers
        const guessType = (values) => {
          let numCount = 0, dateCount = 0, nonEmpty = 0
          for (const v of values) {
            const s = (v === null || v === undefined) ? '' : String(v).trim()
            if (s === '') continue
            nonEmpty++
            const asNum = Number(s)
            if (!Number.isNaN(asNum) && isFinite(asNum)) { numCount++; continue }
            const ts = Date.parse(s)
            if (!Number.isNaN(ts)) { dateCount++; continue }
          }
          if (nonEmpty === 0) return 'string'
          if (numCount / nonEmpty >= 0.8) return 'number'
          if (dateCount / nonEmpty >= 0.8) return 'date'
          return 'string'
        }

        // short CURIE schema lookup
        const schemaLookup = {
          dcat: 'schema:title', 
          skos: 'schema:prefLabel', 
          dc: 'schema:title',
          sosa: 'schema:label', 
          glosis: 'schema:label', 
          schema: 'schema:name'
        }

        const tables = []

        for (const f of files) {
          const headers = f.headers || []
          const rowsForTypes = (f.rows || []).slice(0, 5)
          const rowsForUniqueness = (f.rows || []).slice(0, 200)

          // build columns for this file
          const columns = headers.map(h => {
            const samples = rowsForTypes.map(r => (r && Object.prototype.hasOwnProperty.call(r, h)) ? r[h] : '')
            const guessed = guessType(samples)
            let datatype
            if (guessed === 'number') datatype = 'decimal'
            if (guessed === 'date') datatype = 'dateTime'
            const keyLower = String(h).toLowerCase()
            var propertyUrl = 'schema:value'
            if f.entityType {
              propertyUrl = schemaLookup[f.entityType.split(':')[0] || ''
            }

            const col = {
              titles: h,
              name: h,
              'dcterms:description': h,
              propertyUrl
            }
            if (datatype) col.datatype = datatype
            return col
          })

          // primary key heuristics per-file
          const headerScores = headers.map(h => {
            let nonEmpty = 0
            const seen = new Set()
            for (const r of rowsForUniqueness) {
              const v = (r && Object.prototype.hasOwnProperty.call(r, h)) ? r[h] : ''
              const s = (v === null || v === undefined) ? '' : String(v).trim()
              if (s === '') continue
              nonEmpty++
              seen.add(s)
            }
            const distinct = seen.size
            const uniqRatio = nonEmpty > 0 ? (distinct / nonEmpty) : 0
            return { header: h, nonEmpty, distinct, uniqRatio }
          })

          const strongCandidates = headerScores.filter(s => s.nonEmpty >= 3 && s.uniqRatio >= 0.98)
          const goodCandidates = headerScores.filter(s => s.nonEmpty >= 3 && s.uniqRatio >= 0.8)
          const pickByNamePreference = (cands) => {
            const nameHints = ['id','uuid','code','key','identifier']
            for (const hint of nameHints) {
              const match = cands.find(c => c.header.toLowerCase().includes(hint))
              if (match) return match.header
            }
            return null
          }

          let primaryKey = null
          if (strongCandidates.length === 1) primaryKey = strongCandidates[0].header
          else if (strongCandidates.length > 1) primaryKey = pickByNamePreference(strongCandidates) || strongCandidates.sort((a,b)=>b.uniqRatio-a.uniqRatio)[0].header
          else if (goodCandidates.length >= 1) primaryKey = pickByNamePreference(goodCandidates) || goodCandidates.sort((a,b)=>b.uniqRatio-a.uniqRatio)[0].header
          else {
            const perfect = headerScores.filter(s => s.nonEmpty >= 3 && s.distinct === s.nonEmpty)
            if (perfect.length) primaryKey = pickByNamePreference(perfect) || perfect[0].header
          }

          const table = {
            url: f.url || 'data.csv',
            tableSchema: {
              columns
            }
          }
          if (primaryKey){ 
            table.tableSchema.primaryKey = primaryKey;
            table.tableSchema.aboutUrl = (f.url || 'data.csv') + '/{'+ primaryKey +'}';
          }

           // Apply entity type selection from uploader: add a virtual column that sets rdf:type
        // f.entityType expected as e.g. "schema:Observation" or "skos:Concept"
        const et = (f.entityType && typeof f.entityType === 'string') ? f.entityType.trim() : ''
        if (et) {
          // choose aboutUrl template:
          // - if we have a primaryKey column, use it in the template {PRIMARYKEY}
          // - otherwise fall back to a generic {id} placeholder (user can edit later)
          const pkPlaceholder = primaryKey ? `{${primaryKey}}` : `{id}`
          const aboutTemplate = (f.url || 'data.csv') + '/{'+ primaryKey +'}' // change base if you prefer

          const virtualCol = {
            virtual: true,
            propertyUrl: "rdf:type",
            aboutUrl: aboutTemplate,
            valueUrl: et
          }
          // insert virtual column as the first column for readability
          table.tableSchema.columns.push(virtualCol)
        }

          // attach foreignKey if user specified a relationship for this file
          const rel = this.relationships[f.url]
          if (rel && rel.target && rel.sourceField) {
            table.tableSchema.foreignKeys = [
              {
                columns: [rel.sourceField],
                reference: {
                  resource: rel.target,
                  columnReference: undefined // server can interpret primaryKey of target
                }
              }
            ]
          }

          tables.push(table)
        }

        // Add namespaces
        const allHeaders = []
        const context = {}
        context['skos'] = 'http://www.w3.org/2004/02/skos/core#'
        context['sosa'] = 'http://www.w3.org/ns/sosa/'
        context['dcat'] = 'http://www.w3.org/ns/dcat#'
        context['glosis'] = 'http://w3id.org/glosis/model/common/'

        const metadata = {
          '@context': [ 'https://www.w3.org/ns/csvw.jsonld', context ],
          tables
        }

        this.metadataText = JSON.stringify(metadata, null, 2)
        this.error = null
      } catch (e) {
        this.error = 'Extract headers failed: ' + (e && e.message ? e.message : String(e))
      }
    },

    async postMetadata() {
      this.running = true
      this.error = null
      this.jsonldOut = null
      this.ttl = ''
      this.tripleCount = null

      let metadata
      try {
        metadata = JSON.parse(this.metadataText)
      } catch (e) {
        this.error = 'Metadata is not valid JSON: ' + e.message
        this.running = false
        return
      }

      try {
        const res = await fetch(this.serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ MetadataContent: metadata })
        })
        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`Server returned ${res.status}: ${txt}`)
        }
        const data = await res.json()
        const jsonld = typeof data === 'string' ? JSON.parse(data) : data
        this.jsonldOut = jsonld || null
        
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        this.running = false
      }
    },
    // download helpers
    downloadJSONLD() {
      try {
      if (!this.metadataText) return
      const blob = new Blob([JSON.stringify(this.jsonldOut, null, 2)], { type: 'application/ld+json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const fname = this.downloadFilename('csvw', 'jsonld')
      a.href = url
      a.download = fname
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      } catch (e) {
      this.error = 'Download failed: ' + (e && e.message ? e.message : String(e))
      }
    },
    downloadFilename(base, ext) {
      // prefer first CSV filename as base if available
      try {
      const first = (this.csvFiles && this.csvFiles[0] && this.csvFiles[0].url) ? this.csvFiles[0].url.split('/').pop() : null
      const name = first ? first.replace(/\.[^/.]+$/, '') : base
      return `${name}.${ext}`
      } catch (e) {
      return `${base}.${ext}`
      }
    },
    async downloadPackage() {
      try {
      // require JSZip & FileSaver installed and imported
      const zip = new JSZip()

      // 1) add metadata.jsonld (take from editor; try to pretty-print JSON if possible)
      let metaContent = this.metadataText || ''
      // if metadataText is JSON string, ensure it's pretty-printed
      try {
        const parsed = JSON.parse(metaContent)
        metaContent = JSON.stringify(parsed, null, 2)
      } catch (e) {
        // leave as-is (user may have manual edits)
      }
      zip.file('metadata.jsonld', metaContent)

      // 2) add one CSV per csvFiles entry (prop from parent)
      // csvFiles expected: [{ url, headers, rows, text }, ...]
      const files = this.csvFiles || []
      const usedNames = new Set()
      for (const f of files) {
        // determine filename: prefer f.url last segment, else fallback
        let fname = 'table.csv'
        try {
          if (f.url) {
            const parts = String(f.url).split('/')
            let candidate = parts[parts.length - 1] || f.url
            if (!candidate) candidate = `table`
            // if sheet style 'file#Sheet1' keep it
            fname = candidate
          } else if (f.filename) {
            fname = f.filename
          }
        } catch (e) {
          fname = 'table.csv'
        }
        // sanitize name and ensure .csv extension
        fname = fname.replace(/[:#?<>|\\\/]+/g, '_')
        if (!/\.csv$/i.test(fname)) fname = fname + '.csv'

        // ensure unique names inside zip
        let unique = fname
        let i = 1
        while (usedNames.has(unique)) {
          unique = fname.replace(/(\.csv)$/i, `_${i}$1`)
          i++
        }
        usedNames.add(unique)

        // if f.text present, use it; otherwise serialize headers+rows
        if (f.text && typeof f.text === 'string' && f.text.trim().length > 0) {
          zip.file(unique, f.text)
        } else {
          // build CSV from headers & rows
          const headers = f.headers || (f.table && f.table.tableSchema && f.table.tableSchema.columns
            ? f.table.tableSchema.columns.map(c => (typeof c === 'string' ? c : (c.name || (Array.isArray(c.titles) ? c.titles[0] : c.titles || ''))))
            : [])
          const rows = f.rows || []
          const escapeCell = (v) => {
            if (v === null || v === undefined) return ''
            const s = String(v)
            if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
              return '"' + s.replace(/"/g, '""') + '"'
            }
            return s
          }
          const lines = []
          if (headers && headers.length) {
            lines.push(headers.map(escapeCell).join(','))
            for (const r of rows) {
              const rowLine = headers.map(h => escapeCell(r && Object.prototype.hasOwnProperty.call(r, h) ? r[h] : '')).join(',')
              lines.push(rowLine)
            }
          } else {
            // simple fallback: if rows are arrays or objects with keys, attempt to infer
            if (rows && rows.length) {
              // if row is array
              if (Array.isArray(rows[0])) {
                for (const r of rows) lines.push(r.map(escapeCell).join(','))
              } else {
                // union keys
                const keySet = new Set()
                rows.forEach(r => Object.keys(r || {}).forEach(k => keySet.add(k)))
                const hdrs = Array.from(keySet)
                lines.push(hdrs.map(escapeCell).join(','))
                for (const r of rows) lines.push(hdrs.map(h => escapeCell(r && r[h] != null ? r[h] : '')).join(','))
              }
            } else {
              // empty file
              lines.push('') 
            }
          }
          zip.file(unique, lines.join('\n'))
        }
      }

      // generate zip blob and save
      const blob = await zip.generateAsync({ type: 'blob' })
      const filename = this.packageFilename()
      saveAs(blob, filename)
    } catch (e) {
      this.error = 'Package download failed: ' + (e && e.message ? e.message : String(e))
    }
  },
  // helper to build zip filename
  packageFilename() {
    try {
      // prefer first csv file name base if available
      const first = (this.csvFiles && this.csvFiles[0] && this.csvFiles[0].url) ? this.csvFiles[0].url.split('/').pop() : null
      const base = first ? first.replace(/\.[^/.]+$/, '') : 'csvw_package'
      return `${base}.zip`
    } catch (e) {
      return 'csvw_package.zip'
    }
  }

  }
})
</script>

<style scoped>
.font-monospace { font-family: monospace; }
</style>
