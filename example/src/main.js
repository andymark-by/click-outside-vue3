import { createApp } from 'vue'
import vClickOutside from 'click-outside-vue3'
import App from './App.vue'
import router from './router'

createApp(App).use(router).use(vClickOutside).mount('#app')
