var _transformLib = _interopRequireDefault(require(\\"transform-lib\\")).default;

const _components = {
  Bar: {
    displayName: \\"Bar\\",
    isInFunction: true
  }
};

const _transformLib2 = _transformLib({
  filename: \\"unknown\\",
  components: _components,
  locals: [],
  imports: []
});

function _wrapComponent(id) {
  return function (Component) {
    return _transformLib2(Component, id);
  };
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Foo {
  f() {
    const Bar = _wrapComponent(\\"Bar\\")(function () {
      return class Bar extends React.Component {
        render() {}

      };
    }());

    foo(Bar);
  }

}
