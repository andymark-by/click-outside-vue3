import { createApp, type Directive } from 'vue'
import plugin, {
  type ClickOutsideBinding,
  type ClickOutsideDirective,
  type ClickOutsideHandler,
  type ClickOutsideMiddleware,
  type ClickOutsideOptions,
} from '../../src/index'
// @ts-expect-error
import { directive } from '../../src/index'

createApp({}).use(plugin)

const vueDirective: Directive = plugin.directive
const clickOutsideDirective: ClickOutsideDirective = plugin.directive
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
const optionsBinding: ClickOutsideBinding = options

void vueDirective
void clickOutsideDirective
void directive
void handler
void middleware
void functionBinding
void optionsBinding

// @ts-expect-error
const invalidHandler: ClickOutsideOptions = { handler: 1 }
// @ts-expect-error
const invalidEvents: ClickOutsideOptions = { handler, events: 'click' }
// @ts-expect-error
const extraField: ClickOutsideOptions = { handler, extra: true }
// @ts-expect-error
const missingHandler: ClickOutsideOptions = { isActive: false }

void invalidHandler
void invalidEvents
void extraField
void missingHandler
