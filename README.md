# CSV on the Web Editor

A web application to set up csv-w context for your csv's. The tool runs clientside, except for the csv-rdf conversion, which requires a web service (currently in development).

You can upload several CSV's and link them together via primary and foreign keys.

Run locally:
```
npm run dev
```

In order to process a CSV, it should be available via a webserver supporting CORS. Run a webserver from a folder containing csv's for testing purposes: 

```
npx http-server --cors
```

CSV on the web (CSV-W) is a W3C convention to annotate CSV's with metadata, so it can be parsed as RDF
[Read more about CSV-W](https://csvw.org).

[view online](https://pvgenuchten.github.io/vue-csv-w)
