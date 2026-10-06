<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import clickOutside from 'click-outside-vue3'

const eventLog = ref([])
const limeEl = ref(null)

const logEvent = (name, event) => {
  const entry = `${name}: ${event.type}`
  eventLog.value = [entry, ...eventLog.value].slice(0, 10)
}

const onYellowClick = (event) => logEvent('yellow', event)
const onRedClick = (event) => logEvent('red', event)
const onRedClickMiddleware = (event) => {
  logEvent('red middleware', event)
  return true
}
const onLimeClick = (event) => logEvent('lime', event)
const onBlueClick = (event) => logEvent('blue', event)
const onToggleClick = (event) => logEvent('toggle', event)
const onDragClick = (event) => logEvent('drag', event)

const redConfig = {
  handler: onRedClick,
  middleware: onRedClickMiddleware,
  events: ['click'],
}
const toggleConfig = reactive({ handler: onToggleClick, isActive: true })

onMounted(() => {
  clickOutside.directive.beforeMount(limeEl.value, { value: onLimeClick })
})

onBeforeUnmount(() => {
  clickOutside.directive.unmounted(limeEl.value)
})
</script>

<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png" />
    <div class="hello">
      <h1>Welcome to v-click-outside example</h1>

      <div id="yellow-box" v-click-outside="onYellowClick" class="yellow-box">
        <p>Click outside Yellow box</p>
      </div>

      <div id="red-box" v-click-outside="redConfig" class="red-box">
        <p>Click outside Red box</p>
      </div>

      <div id="lime-box" ref="limeEl" class="lime-box">
        <p>Click outside Lime box</p>
      </div>

      <div id="blue-box" v-click-outside="onBlueClick" class="blue-box">
        <p>Click outside Blue box</p>
        <iframe
          class="iframe-button-example"
          title="About page (inside the blue box)"
          src="#/about"
        />
      </div>

      <div id="toggle-box" v-click-outside="toggleConfig" class="toggle-box">
        <p>Click outside Toggle box; uncheck to disable the directive</p>
        <label for="toggle-active">
          <input
            id="toggle-active"
            v-model="toggleConfig.isActive"
            type="checkbox"
          />
          Active
        </label>
      </div>

      <div id="drag-box" v-click-outside="onDragClick" class="drag-box">
        <p>
          Select text and release the mouse outside this box; the handler will
          not run
        </p>
        <input
          id="drag-input"
          aria-label="Text to drag-select"
          value="Select this long text, drag beyond the edge of this box, and release the mouse button outside."
        />
      </div>

      <iframe class="iframe" title="About page" src="#/about" width="100%" />

      <h2>Event log</h2>
      <ol id="event-log">
        <li v-for="(entry, index) in eventLog" :key="index">{{ entry }}</li>
      </ol>
    </div>
  </div>
</template>

<style>
.yellow-box {
  background-color: yellow;
  height: 50px;
  text-align: center;
}

.red-box {
  background-color: red;
  height: 50px;
}

.lime-box {
  background-color: lime;
  height: 50px;
}

.blue-box {
  background-color: blue;
  color: white;
}

.iframe-button-example {
  border: 2px solid white;
  border-radius: 8px;
  width: 200px;
  height: 50px;
  overflow: hidden;
}

.iframe {
  border: 1px solid lightgrey;
  margin-top: 1em;
}

.toggle-box,
.drag-box {
  background-color: #e8edf2;
  margin-top: 1em;
  padding: 1em;
}

#drag-input {
  max-width: 100%;
  width: 40em;
}

#event-log {
  margin: 0 auto 2em;
  max-width: 40em;
  text-align: left;
}
</style>
