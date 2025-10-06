import { createApp } from 'vue'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import { Buffer } from 'buffer'

window.Buffer = Buffer
createApp(App).mount('#app')
