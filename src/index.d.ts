import type { App, Directive } from 'vue'

export type ClickOutsideHandler = {
  bivarianceHack(event: Event): void
}['bivarianceHack']
export type ClickOutsideMiddleware = {
  bivarianceHack(event: Event): boolean
}['bivarianceHack']
export interface ClickOutsideOptions {
  handler?: ClickOutsideHandler | Function
  middleware?: ClickOutsideMiddleware
  events?: readonly string[]
  isActive?: boolean
  detectIframe?: boolean
  capture?: boolean
}
export type ClickOutsideBinding =
  | ClickOutsideHandler
  | Function
  | ClickOutsideOptions
  | null
  | undefined
  | false
export type ClickOutsideDirective = Directive<HTMLElement, ClickOutsideBinding>

export declare const install: (app: App) => void
export declare const directive: ClickOutsideDirective

declare const plugin: {
  install: typeof install
  directive: ClickOutsideDirective
}

export default plugin

declare module 'vue' {
  interface GlobalDirectives {
    vClickOutside: ClickOutsideDirective
  }
}
