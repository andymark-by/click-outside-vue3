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

Don't import the package as `vClickOutside` inside `<script setup>`. Vue treats any `vSomething` variable as a local directive, so it would shadow the global one with the plugin object, which isn't a directive. Use `clickOutside.directive` like above.

### Options

`null`, `undefined` and `false` turn the directive off, so `v-click-outside="isOpen && close"` works when `isOpen` is a boolean (`0` or `''` still throw). Same for an options object without a `handler`, handy when the handler is an optional prop: `v-click-outside="{ handler: onClose }"`.

| Option | Description |
| --- | --- |
| `handler` | `(event) => void`. Without it the directive does nothing. |
| `middleware` | `(event) => boolean`, synchronous. Runs only for outside events; return a falsy value to skip the handler. |
| `events` | Array of events to listen for. Defaults to `['touchstart']` on touch devices (`'ontouchstart' in window`), and `['click']` otherwise. |
| `isActive` | Defaults to `true`. Can be toggled at runtime. Mutating a reactive config object in place works on Vue 3.1.5+; on older 3.x replace the object (or use a computed). |
| `detectIframe` | Detects clicks on iframes. Defaults to `true`; see [Detecting Iframe Clicks](#detecting-iframe-clicks). |
| `capture` | Listen in the capture phase. Defaults to `false`. Useful when something else calls `stopPropagation`. |

### Behavior

- A click that starts inside the element and ends outside doesn't count as an outside click. So selecting text in a modal and letting go past its edge won't close it. Keyboard clicks (Enter/Space on a button outside) work as usual.
- You can swap `handler` or `middleware` at any time, the latest one is used.
- Changing `events`, `isActive`, `detectIframe` or `capture` re-creates the listeners.
- A component can use `v-click-outside` on its own root element and still get another one from its parent. Both work independently.

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

The types work with `moduleResolution` set to `node`, `bundler`, or `nodenext` (including ESM projects). Use a default import. The package is published as UMD, so named imports like `import { directive }` work with bundlers but fail in plain Node ESM, for example in SSR with external dependencies. If TypeScript compiles your code to CommonJS, turn on `esModuleInterop`.

The example below assumes the directive is registered globally with `app.use`.

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

On Vue 3.5+, when registered globally with `app.use`, `v-click-outside` is typed in templates through the package's augmentation of Vue's `GlobalDirectives` interface. Earlier Vue 3 versions do not provide `GlobalDirectives`; the option types work with any Vue 3 version. If you added your own `vClickOutside` entry to `GlobalDirectives` for 4.0, remove it, otherwise TypeScript may report a conflicting declaration.

## Detecting Iframe Clicks

There is no idiomatic way to detect a click on an `<iframe>` (`HTMLIFrameElement`). A click inside an iframe moves focus to its content window and does not bubble to the main window, so the directive's `document.documentElement` listeners do not receive it. The iframe focus change triggers a `blur` event on the main window. The directive uses that event with `document.activeElement` to detect whether focus moved to an iframe and then calls the handler.

This workaround has two caveats:

- The handler runs once when focus moves to an iframe. Further clicks inside it do not run the handler until focus returns to the main window, for example by clicking outside the iframe. Calling `window.focus()` at the end of the handler could change normal tab and focus behavior.
- Keyboard navigation that moves focus to an iframe also triggers the main window's `blur` event and runs the handler.

Iframe detection is enabled by default. Set `detectIframe` to `false` if it conflicts with your use case.

## Upgrading from 4.0

- A click that starts inside and ends outside no longer calls the handler.
- A new `handler` or `middleware` passed after mount is now used. In 4.0 the first one stayed until another option changed. Changes made to the options object in place are picked up too (Vue 3.1.5+).
- `null`, `undefined`, `false` and an options object without `handler` now just disable the directive. In 4.0 they threw (or failed on the first outside click). A `handler` that isn't a function now throws when the directive is bound instead of on the first click. `true`, strings and numbers still throw, and so does an `events` value that is truthy but not an array.
- The non-standard `event.path` is no longer read, only `event.composedPath()`.
- TypeScript types are included, and `vue` is now a peer dependency. Remove any `GlobalDirectives` declaration you wrote for `vClickOutside` yourself.

## Development

Development needs Node 20.19+ (the example and `test:compat` use Vite 8). Run `npm test`, `npm run test:types` and `npm run lint` from the repo root. `npm run example:dev` starts the Vite example, which uses the code from `src/`.

`npm run test:compat` runs the bigger compatibility check: several Vue versions, SSR with hydration, bundlers, TypeScript/vue-tsc, Chromium/Firefox/WebKit, Node and a comparison with 4.0.1. It needs network access and GNU `timeout` (`brew install coreutils` on macOS), and the browser part needs Docker (or Playwright browsers installed locally). Options go after `--`, e.g. `npm run test:compat -- --only browsers`. `--list` shows the suites, and `--max-minutes <n>` sets a rough time limit for the whole run.

## License

[MIT License](https://github.com/andymark-by/click-outside-vue3/blob/master/LICENSE)
