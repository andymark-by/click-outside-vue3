# click-outside-vue3

Vue 3 directive for handling clicks outside an element without stopping event propagation.

## Installation

```bash
$ npm install --save click-outside-vue3
```

```bash
$ yarn add click-outside-vue3
```

## Usage

### Global Registration

```js
import { createApp } from 'vue'
import App from './App.vue'
import vClickOutside from 'click-outside-vue3'

const app = createApp(App)
app.use(vClickOutside)
```

### Options API

```vue
<script>
export default {
  data() {
    return {
      vcoConfig: {
        handler: this.onClickOutside,
        middleware: this.middleware,
        events: ['dblclick', 'click'],
        isActive: true,
        detectIframe: true,
        capture: false
      }
    }
  },
  methods: {
    onClickOutside(event) {
      console.log('Clicked outside. Event:', event)
    },
    middleware(event) {
      return event.target.className !== 'modal'
    }
  }
}
</script>

<template>
  <div v-click-outside="onClickOutside"></div>
  <div v-click-outside="vcoConfig"></div>
</template>
```

### Composition API (Vue 3)

```vue
<script setup>
import { ref } from 'vue'

const isModalVisible = ref(false)

const onClickOutside = (event) => {
  console.log('Clicked outside. Event:', event)
  isModalVisible.value = false
}

const vcoConfig = {
  handler: (event) => {
    console.log('Clicked outside using config')
    isModalVisible.value = false
  },
  middleware: (event) => event.target.className !== 'modal',
  events: ['click'],
  isActive: true,
  detectIframe: true,
  capture: false
}
</script>

<template>
  <div v-click-outside="onClickOutside">Basic usage</div>
  <div v-click-outside="vcoConfig">Usage with config</div>
</template>
```

### Local Registration

```vue
<script>
import vClickOutside from 'click-outside-vue3'

export default {
  directives: {
    clickOutside: vClickOutside.directive
  },
  methods: {
    onClickOutside(event) {
      console.log('Clicked outside. Event:', event)
    }
  }
}
</script>

<template>
  <div v-click-outside="onClickOutside"></div>
</template>
```

### Local Registration with Composition API

```vue
<script setup>
import clickOutside from 'click-outside-vue3'

const vClickOutside = clickOutside.directive

const onClickOutside = (event) => {
  console.log('Clicked outside. Event:', event)
}
</script>

<template>
  <div v-click-outside="onClickOutside"></div>
</template>
```

In `<script setup>`, do not name the package's default import `vClickOutside`: Vue treats `vXxx` variables as local directives, which override a globally registered directive, but the imported plugin is not itself a directive. For local registration, assign `vClickOutside` to `clickOutside.directive` as shown above.

### Options

| Option | Description |
| --- | --- |
| `handler` | Required when the directive value is an options object. A function with the signature `(event) => void`. |
| `middleware` | Optional synchronous function with the signature `(event) => boolean`. It is called only for outside events. Returning `true` allows the handler to run; when omitted, all outside events pass. |
| `events` | Events to listen for. Defaults to `['touchstart']` on touch devices (`'ontouchstart' in window`), and `['click']` otherwise. |
| `isActive` | Whether the directive is active. Defaults to `true`; can be changed at runtime, including by mutating a reactive config object. |
| `detectIframe` | Detects clicks on iframes. Defaults to `true`; see [Detecting Iframe Clicks](#detecting-iframe-clicks). |
| `capture` | Registers the listener in the capture phase. Defaults to `false`; useful when another handler calls `stopPropagation`. |

### Behavior

- When `events` includes `click` (the default on devices without touch events), a click that starts inside the element (a mouse button press or touch inside) and ends outside is not treated as an outside click. Dragging to select text in a modal and releasing beyond its edge does not close it. Keyboard clicks, such as pressing Enter or Space on an outside button, are handled as usual.
- The current `handler` and `middleware` functions are used when they change at runtime. Updating either function does not reattach listeners.
- Changing `events`, `isActive`, `detectIframe`, or `capture` at runtime recreates the listeners.

### Recipes

#### Handle right clicks

Add `contextmenu` to the event list:

```js
const vcoConfig = {
  handler: onClickOutside,
  events: ['click', 'contextmenu']
}
```

#### Prevent the default action for an outside click

Use capture mode and call `preventDefault` in the handler. Call `stopPropagation` as well if needed.

```js
const vcoConfig = {
  capture: true,
  handler: (event) => {
    event.preventDefault()
  }
}
```

#### Touch devices

By default, devices with touch events (`'ontouchstart' in window`) listen for `touchstart`. It fires on contact before `click`, so `@click.stop` on an outside element cannot stop it. To make `@click.stop` work on mobile and touchscreen laptops, and to detect mouse clicks on those laptops, set `events: ['click']`.

With `events: ['click']`, iOS Safari does not emit `click` for taps on a non-interactive element unless that element or an ancestor below `<body>` has a click handler or `cursor: pointer`. For an app root such as `.app-root`, limit `cursor: pointer` to devices without a precise pointer:

```css
@media (hover: none) and (pointer: coarse) {
  .app-root {
    cursor: pointer;
  }
}
```

Browsers treat document-level `touchstart` listeners as passive, so `event.preventDefault()` in a `touchstart` handler has no effect.

## TypeScript

The package includes TypeScript declarations and exports `ClickOutsideOptions`, `ClickOutsideBinding`, `ClickOutsideHandler`, `ClickOutsideMiddleware`, and `ClickOutsideDirective`. Handlers can accept a narrower event type, such as `MouseEvent`.

```vue
<script setup lang="ts">
import type { ClickOutsideOptions } from 'click-outside-vue3'

const vcoConfig: ClickOutsideOptions = {
  handler: (event: MouseEvent) => {
    console.log('Clicked outside. Event:', event)
  },
  events: ['click'],
  isActive: true
}
</script>

<template>
  <div v-click-outside="vcoConfig"></div>
</template>
```

On Vue 3.5+, when registered globally with `app.use`, `v-click-outside` is typed in templates through the package's augmentation of Vue's `GlobalDirectives` interface. Earlier Vue 3 versions do not provide `GlobalDirectives`; the option types work with any Vue 3 version.

## Detecting Iframe Clicks

There is no idiomatic way to detect a click on an `<iframe>` (`HTMLIFrameElement`). A click inside an iframe moves focus to its content window and does not bubble to the main window, so the directive's `document.documentElement` listeners do not receive it. The iframe focus change triggers a `blur` event on the main window. The directive uses that event with `document.activeElement` to detect whether focus moved to an iframe and then calls the handler.

This workaround has two caveats:

- The handler runs once when focus moves to an iframe. Further clicks inside it do not run the handler until focus returns to the main window, for example by clicking outside the iframe. Calling `window.focus()` at the end of the handler could change normal tab and focus behavior.
- Keyboard navigation that moves focus to an iframe also triggers the main window's `blur` event and runs the handler.

Iframe detection is enabled by default. Set `detectIframe` to `false` if it conflicts with your use case.

## Upgrading from 4.0

- When `events` includes `click`, a click that starts inside an element and ends outside no longer calls the handler.
- An options object without a function-valued `handler` now throws an error when the directive is mounted while active, instead of throwing a `TypeError` on the first click. A `null` directive value throws the same error as other invalid values.
- The package now includes TypeScript declarations and `vue` in `peerDependencies`.

## Development

Run `npm test` and `npm run lint` from the repository root. Start the live Vite example with `npm run example:dev`; it uses the source files in `src/`.

## License

[MIT License](https://github.com/andymark-by/click-outside-vue3/blob/master/LICENSE)
