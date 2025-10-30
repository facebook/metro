function foo() {
  'worklet';

  function bar() {
    'worklet';

    function baz() {
      'worklet';
      return 1;
    }

    return baz() + 1;

  }

  return bar() + 1;
}

foo();
