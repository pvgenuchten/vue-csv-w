<template>
  <div>
    <h3 class="mb-3">CSVW Client-side parser</h3>

    <div class="d-flex gap-2 mb-3 align-items-center">
      <button class="btn btn-primary btn-sm" @click="runConversion" :disabled="running || !csvText">Convert CSV → RDF</button>
      <button class="btn btn-secondary btn-sm" @click="validateMetadata" :disabled="validating">Validate metadata</button>
      <button class="btn btn-outline-secondary btn-sm" @click="extractHeaders" :disabled="!csvHeaders || !csvHeaders.length">Extract headers</button>
      <div v-if="running" class="ms-2 text-muted">⏳ Running...</div>
      <div v-if="error" class="ms-2 text-danger">{{ error }}</div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <h4>CSV-W metadata (JSON-LD)</h4>

        <!-- Switch from @uiw/vue-codemirror to vue-codemirror -->
        <Codemirror
          v-model="metadataText"
          :extensions="cmExtensions"
          class="border rounded"
          style="height: 420px;"
        />
      </div>

      <div class="col-md-6">
        <h4>Output</h4>
        <div class="mb-3">
          <strong>JSON-LD</strong>
          <pre class="bg-light p-2 border rounded small" style="max-height: 180px; overflow:auto">{{ prettyJsonld }}</pre>
        </div>
        <div>
          <strong>Turtle</strong>
          <pre class="bg-light p-2 border rounded small" style="max-height: 120px; overflow:auto">{{ ttl || 'No TTL yet' }}</pre>
        </div>
      </div>
    </div>

    <div v-if="quadCount !== null" class="mt-2 text-muted">Quads produced: {{ quadCount }}</div>
  </div>
</template>

<script>
// Updated to use vue-codemirror (official maintained package)
// Install: npm install vue-codemirror @codemirror/lang-json @codemirror/theme-one-dark


import { defineComponent } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import rdfExt from 'rdf-ext'

export default defineComponent({
  name: 'CSVWClientParser',
  components: { Codemirror },
  props: {
    initialContext: { type: Object, default: () => ({ '@context': {} }) },
    csvRows: { type: Array, default: () => [] },
    csvHeaders: { type: Array, default: () => [] },
    csvText: { type: String, default: '' }
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
  watch: {
    initialContext(newC) {
      if (!this.metadataText || this.metadataText.trim() === '{}') {
        this.metadataText = JSON.stringify(newC, null, 2)
      }
    }
  },
  computed: {
    prettyJsonld() {
      try { return JSON.stringify(this.jsonldOut, null, 2) }
      catch(e){ return '' }
    }
  },
  methods: {
    async validateMetadata() {
      this.validating = true
      this.error = null
      try {
        const metadata = JSON.parse(this.metadataText)
        const jsonld = await import('jsonld')
        await jsonld.toRDF(metadata, { format: 'application/n-quads' })
      } catch (e) {
        this.error = 'Metadata validation error: ' + e.message
      } finally {
        this.validating = false
      }
    },

    extractHeaders() {
      try {
        const headers = this.csvHeaders && this.csvHeaders.length ? this.csvHeaders : []
        if (!headers.length) {
          this.error = 'No headers available to extract.'
          return
        }

        const context = {
          '@vocab': 'http://example.org/vocab#'
        }

        const columns = headers.map(h => ({
          'titles': h
        }))

        headers.forEach(h => {
          const token = h.replace(/[^a-zA-Z0-9_]/g, '_')
          context[h] = `http://example.org/vocab#${token}`
        })

        const metadata = {
          '@context': context,
          'url': 'data.csv',
          'tableSchema': {
            'columns': columns
          }
        }

        this.metadataText = JSON.stringify(metadata, null, 2)
        this.error = null
      } catch (e) {
        this.error = 'Extract headers failed: ' + (e.message || String(e))
      }
    },

    async runConversion() {
      this.running = true
      this.error = null
      this.ttl = ''
      this.jsonldOut = null
      this.quadCount = null

      try {
        if (!this.csvText) throw new Error('No CSV text provided')
        const metadata = JSON.parse(this.metadataText)

        const rdfParserCsvwModule = await import('rdf-parser-csvw')
        const ParserCsvw = rdfParserCsvwModule.default || rdfParserCsvwModule
        const rdfExt = (await import('rdf-ext')).default || (await import('rdf-ext'))
        const jsonld = await import('jsonld')
        const N3 = await import('n3')

        const nquads = await jsonld.toRDF(metadata, { format: 'application/n-quads' })
        const n3parser = new N3.Parser({ format: 'N-Quads' })
        const parsed = n3parser.parse(nquads)

        const dataset = rdfExt.dataset()
        console.log(dataset)
        const DataFactory = rdfExt.default ? rdfExt.default : rdfExt

        for (const q of parsed) {
          const subject = q.subject.termType === 'BlankNode' ? DataFactory.blankNode(q.subject.value) : DataFactory.namedNode(q.subject.value)
          const predicate = DataFactory.namedNode(q.predicate.value)
          let object
          if (q.object.termType === 'Literal') {
            const dt = q.object.datatype && q.object.datatype.value ? DataFactory.namedNode(q.object.datatype.value) : undefined
            object = dt ? DataFactory.literal(q.object.value, dt) : DataFactory.literal(q.object.value)
          } else if (q.object.termType === 'BlankNode') {
            object = DataFactory.blankNode(q.object.value)
          } else {
            object = DataFactory.namedNode(q.object.value)
          }
          const quad = DataFactory.quad(subject, predicate, object)
          dataset.add(quad)
        }

        const parser = new ParserCsvw({ metadata: dataset, baseIRI: 'http://example.org/' })
        const quadStream = parser.import([this.csvText][Symbol.iterator]())

        const outDataset = rdfExt.dataset()
        for await (const q of quadStream) {
          outDataset.add(q)
        }

        this.quadCount = outDataset.size

        const writer = new N3.Writer({ format: 'N-Quads' })
        const quadsForWriter = []
        outDataset.forEach(q => quadsForWriter.push(q))
        for (const q of quadsForWriter) writer.addQuad(q)

        const nquadsOut = await new Promise((resolve, reject) => {
          writer.end((err, result) => err ? reject(err) : resolve(result))
        })

        const jsonldDoc = await jsonld.fromRDF(nquadsOut, { format: 'application/n-quads' })
        const compact = await jsonld.compact(jsonldDoc, metadata['@context'] || {})
        this.jsonldOut = compact

        const turtleWriter = new N3.Writer({ prefixes: metadata['@context'] && metadata['@context']['@vocab'] ? { '': metadata['@context']['@vocab'] } : {} })
        for (const q of quadsForWriter) turtleWriter.addQuad(q)
        this.ttl = await new Promise((resolve, reject) => {
          turtleWriter.end((err, result) => err ? reject(err) : resolve(result))
        })

      } catch (e) {
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
