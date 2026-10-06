/** @jest-environment node */
/* global jest describe it expect */

import plugin from '../src/index'
import directive from '../src/v-click-outside'

describe('server-side rendering', () => {
  it('has no window', () => {
    expect(typeof window).toBe('undefined')
  })

  it('exports an empty directive', () => {
    expect(directive).toEqual({})
    expect(plugin.directive).toBe(directive)
  })

  it('registers the empty directive with the app', () => {
    const app = { directive: jest.fn() }
    plugin.install(app)
    expect(app.directive).toHaveBeenCalledTimes(1)
    expect(app.directive).toHaveBeenCalledWith('click-outside', {})
  })
})
