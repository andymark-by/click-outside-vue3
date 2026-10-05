import { createApp, type App, type Directive } from 'vue'
import plugin from '../../src/index'
import { install, directive } from '../../src/index'
import type {
  ClickOutsideBinding,
  ClickOutsideDirective,
  ClickOutsideHandler,
  ClickOutsideMiddleware,
  ClickOutsideOptions,
} from '../../src/index'

createApp({}).use(plugin)

const vueDirective: Directive = plugin.directive
const clickOutsideDirective: ClickOutsideDirective = plugin.directive
const namedDirective: ClickOutsideDirective = directive
const namedInstall: (app: App) => void = install
const handler: ClickOutsideHandler = (event: Event) => {
  void event.type
}
const middleware: ClickOutsideMiddleware = (event: Event) =>
  event.type === 'click'
const events = ['click', 'keyup'] as const
const options: ClickOutsideOptions = {
  handler: (event: MouseEvent) => {
    void event.button
  },
  middleware: (event: PointerEvent) => {
    void event.isPrimary
    return true
  },
  events,
  isActive: true,
  detectIframe: false,
  capture: true,
}
const functionBinding: ClickOutsideBinding = (event: MouseEvent) => {
  void event.button
}
const fn: Function = () => {}
const broadFunctionBinding: ClickOutsideBinding = fn
const broadOptionHandler: ClickOutsideOptions['handler'] = fn
const optionsBinding: ClickOutsideBinding = options
const nullBinding: ClickOutsideBinding = null
const undefinedBinding: ClickOutsideBinding = undefined
const falseBinding: ClickOutsideBinding = false
const open = false
const conditionalBinding: ClickOutsideBinding =
  (open as boolean) && (() => {})
const inactiveOptions: ClickOutsideOptions = { isActive: false }
const undefinedHandlerOptions: ClickOutsideOptions = {
  handler: undefined,
  isActive: false,
}

void vueDirective
void clickOutsideDirective
void namedDirective
void namedInstall
void handler
void middleware
void functionBinding
void broadFunctionBinding
void broadOptionHandler
void optionsBinding
void nullBinding
void undefinedBinding
void falseBinding
void conditionalBinding
void inactiveOptions
void undefinedHandlerOptions

// @ts-expect-error
const invalidHandler: ClickOutsideOptions = { handler: 1 }
// @ts-expect-error
const invalidEvents: ClickOutsideOptions = { handler, events: 'click' }
// @ts-expect-error
const extraField: ClickOutsideOptions = { handler, extra: true }
// @ts-expect-error
const invalidBinding: ClickOutsideBinding = 'click'
// @ts-expect-error
const invalidTrueBinding: ClickOutsideBinding = true

void invalidHandler
void invalidEvents
void extraField
void invalidBinding
void invalidTrueBinding
