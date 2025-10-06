<template>
  <div class="mb-4">
    <label for="csvUpload" class="form-label">Upload CSV file</label>
    <input id="csvUpload" type="file" accept=".csv" class="form-control mb-3" @change="onFileChange" />

    <div v-if="rows.length" class="mt-3">
      <h5>CSV Preview</h5>
      <table class="table table-striped table-bordered table-sm">
        <thead class="table-dark">
          <tr>
            <th v-for="h in headers" :key="h">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows.slice(0,5)" :key="i">
            <td v-for="h in headers" :key="h">{{ row[h] }}</td>
          </tr>
        </tbody>
      </table>
      <small class="text-muted">Showing first 5 rows</small>
    </div>
  </div>
</template>

<script>
import Papa from 'papaparse'

export default {
  emits: ['csv-loaded'],
  data() {
    return { rows: [], headers: [], csvText: '' }
  },
  methods: {
    onFileChange(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (evt) => {
        const csvText = evt.target.result
        const parsed = Papa.parse(csvText, { header: true })
        this.rows = parsed.data
        this.headers = parsed.meta.fields
        this.csvText = csvText
        this.$emit('csv-loaded', { rows: this.rows, headers: this.headers, text: this.csvText })
      }
      reader.readAsText(file)
    }
  }
}
</script>
