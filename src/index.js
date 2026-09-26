import directive from './v-click-outside'

const plugin = {
  install(app) {
    app.directive('click-outside', directive)
  },
  directive,
}

export default plugin
