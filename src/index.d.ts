import type { App, Directive } from 'vue'

export type ClickOutsideHandler = {
  bivarianceHack(event: Event): void
}['bivarianceHack']
export type ClickOutsideMiddleware = {
  bivarianceHack(event: Event): boolean
}['bivarianceHack']
export interface ClickOutsideOptions {
  handler: ClickOutsideHandler
  middleware?: ClickOutsideMiddleware
  events?: readonly string[]
  isActive?: boolean
  detectIframe?: boolean
  capture?: boolean
}
export type ClickOutsideBinding = ClickOutsideHandler | ClickOutsideOptions
export type ClickOutsideDirective = Directive<HTMLElement, ClickOutsideBinding>
declare const plugin: {
  install(app: App): void
  directive: ClickOutsideDirective
}
export default plugin
declare module 'vue' {
  interface GlobalDirectives {
    vClickOutside: ClickOutsideDirective
  }
}
