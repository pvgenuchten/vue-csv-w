<template>
  <div>
    <h3 class="mb-3">CSV-W</h3>

    <div class="d-flex gap-2 mb-3 align-items-center">
      <input type="hidden" v-model="serverUrl" />
     
      <button class="btn btn-outline-secondary btn-sm" @click="extractHeaders" :disabled="!csvHeaders || !csvHeaders.length">Extract headers</button>
      <button class="btn btn-primary btn-sm" @click="postMetadata" :disabled="running">Process CSV</button> 
      <button class="btn btn-outline-secondary btn-sm" @click="validateMetadata" :disabled="validating">Validate JSON-LD</button>
      <div v-if="running" class="ms-2 text-muted">⏳ Sending...</div>
      <div v-if="error" class="ms-2 text-danger">{{ error }}</div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <h4>CSV-W metadata (JSON-LD)</h4>
        <Codemirror v-model="metadataText" :extensions="cmExtensions" class="border rounded" style="height:420px;" />
      </div>

      <div class="col-md-6">
        <h4>Server response</h4>
        <div class="mb-3">
          <strong>JSON-LD</strong>
          <pre class="bg-light p-2 border rounded small" style="max-height:220px; overflow:auto">{{ prettyJsonld }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'

export default defineComponent({
  name: 'CSVWClientParser',
  components: { Codemirror },
 props: {
  csvHeaders: Array,
  csvRows: Array,
  csvUrl: String
},
  data() {
    return {
      serverUrl: 'http://localhost:8000/feeds/csvw/',
      metadataText: JSON.stringify(this.initialContext, null, 2),
      jsonldOut: null,
      ttl: '',
      error: null,
      running: false,
      validating: false,
      tripleCount: null,
      cmExtensions: [json(), oneDark]
    }
  },
  computed: {
    prettyJsonld() {
      try { return JSON.stringify(this.jsonldOut, null, 2) } catch (e) { return '' }
    }
  },
  methods: {
    // Build a basic metadata object from headers and insert into editor
    extractHeaders() {
      try {
        if (!this.csvHeaders || !this.csvHeaders.length) {
          this.error = 'No headers available to extract.';
          this.metadataText = ''; // keep editor in sync
          return;
        }

        // samples for type-guessing and uniqueness
        const sampleForTypes = (this.csvRows || []).slice(0, 5);
        const sampleForUniqueness = (this.csvRows || []).slice(0, 200);

        // type-guessing helper
        const guessType = (values) => {
          let numCount = 0, dateCount = 0, nonEmpty = 0;
          for (const v of values) {
            const s = (v === null || v === undefined) ? '' : String(v).trim();
            if (s === '') continue;
            nonEmpty++;
            const asNum = Number(s);
            if (!Number.isNaN(asNum) && isFinite(asNum)) { numCount++; continue; }
            const ts = Date.parse(s);
            if (!Number.isNaN(ts)) { dateCount++; continue; }
          }
          if (nonEmpty === 0) return 'string';
          if (numCount / nonEmpty >= 0.8) return 'number';
          if (dateCount / nonEmpty >= 0.8) return 'date';
          return 'string';
        };

        // schema.org CURIE lookup (short, human-friendly)
        const schemaLookup = {
          name: 'schema:name',
          title: 'schema:name',
          description: 'schema:description',
          id: 'schema:identifier',
          identifier: 'schema:identifier',
          uuid: 'schema:identifier',
          email: 'schema:email',
          url: 'schema:url',
          link: 'schema:url',
          date: 'schema:date',
          created: 'schema:dateCreated',
          updated: 'schema:dateModified',
          value: 'schema:value'
        };

        // build columns with titles, name, dcterms:description, propertyUrl, optional datatype
        const columns = this.csvHeaders.map((h) => {
          const samples = sampleForTypes.map(r => (r && Object.prototype.hasOwnProperty.call(r, h)) ? r[h] : '');
          const guessed = guessType(samples);
          let datatype;
          if (guessed === 'number') datatype = 'http://www.w3.org/2001/XMLSchema#decimal';
          if (guessed === 'date') datatype = 'http://www.w3.org/2001/XMLSchema#dateTime';

          const keyLower = String(h).toLowerCase();
          const propertyUrl = schemaLookup[keyLower] || 'schema:value';

          const col = {
            titles: h,
            name: h,
            'dcterms:description': h,
            propertyUrl
          };
          if (datatype) col.datatype = datatype;
          return col;
        });

        // primary key heuristics: check uniqueness over sampleForUniqueness
        const headerScores = this.csvHeaders.map((h) => {
          let nonEmpty = 0;
          const seen = new Set();
          for (const r of sampleForUniqueness) {
            const v = (r && Object.prototype.hasOwnProperty.call(r, h)) ? r[h] : '';
            const s = (v === null || v === undefined) ? '' : String(v).trim();
            if (s === '') continue;
            nonEmpty++;
            seen.add(s);
          }
          const distinct = seen.size;
          const uniqRatio = nonEmpty > 0 ? (distinct / nonEmpty) : 0;
          return { header: h, nonEmpty, distinct, uniqRatio };
        });

        const strongCandidates = headerScores.filter(s => s.nonEmpty >= 3 && s.uniqRatio >= 0.98);
        const goodCandidates = headerScores.filter(s => s.nonEmpty >= 3 && s.uniqRatio >= 0.8);

        const pickByNamePreference = (cands) => {
          const nameHints = ['id', 'uuid', 'code', 'key', 'identifier'];
          for (const hint of nameHints) {
            const match = cands.find(c => c.header.toLowerCase().includes(hint));
            if (match) return match.header;
          }
          return null;
        };

        let primaryKey = null;
        if (strongCandidates.length === 1) primaryKey = strongCandidates[0].header;
        else if (strongCandidates.length > 1) primaryKey = pickByNamePreference(strongCandidates) || strongCandidates.sort((a,b)=>b.uniqRatio-a.uniqRatio)[0].header;
        else if (goodCandidates.length >= 1) primaryKey = pickByNamePreference(goodCandidates) || goodCandidates.sort((a,b)=>b.uniqRatio-a.uniqRatio)[0].header;
        else {
          const perfect = headerScores.filter(s => s.nonEmpty >= 3 && s.distinct === s.nonEmpty);
          if (perfect.length) primaryKey = pickByNamePreference(perfect) || perfect[0].header;
        }

        // build a basic context mapping (editable by user)
        const context = { '@vocab': 'http://example.org/vocab#' };
        this.csvHeaders.forEach(h => {
          const token = String(h).replace(/[^a-zA-Z0-9_]/g, '_');
          context[h] = `http://example.org/vocab#${token}`;
        });

        // compose metadata; use official CSVW JSON-LD context and include primaryKey if found
        const metadata = {
          "@context": "https://www.w3.org/ns/csvw.jsonld",
          "url": this.csvUrl || "data.csv",
          "tableSchema": {
            "columns": columns
          }
        };
        if (primaryKey) metadata.tableSchema.primaryKey = primaryKey;

        // write into the editor-bound property
        this.metadataText = JSON.stringify(metadata, null, 2);
        this.error = null;
      } catch (e) {
        this.error = 'Extract headers failed: ' + (e && e.message ? e.message : String(e));
        // leave metadataText unchanged on error so user can inspect editor
      }
    },



    // Simple JSON-LD validation using jsonld.toRDF on the server side we trust, here we do a quick client check
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

    // POST metadata to server endpoint
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
        // Expecting { jsonld: <object>, ttl: <string> }
        this.jsonldOut = data || null
        
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
