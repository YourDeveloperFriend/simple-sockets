
import _ from 'lodash';

export default function batchify(...args) {
  return withTimeout(0)(...args);
}
batchify.withTimeout = withTimeout;

function withTimeout(ms) {
  return function batchifyDecorator(target, key, {value: fn, ...descriptor}) {
    return {
      ..._.omit(descriptor, 'writable'),
      get() {
        if(this === target) {
          return fn;
        }
        const value = createBatchified(fn, this, ms);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: false,
          value,
        });
        return value;
      },
    };
  }
}

function createBatchified(fn, self, ms) {
  const {setTimer, clearTimer} = ms === 0 ? {
    setTimer: setImmediate,
    clearTimer: clearImmediate,
  } : {
    setTimer: setTimeout,
    clearTimer: clearTimeout,
  };
  let values = [];
  let timer = null;
  batchifiedFn.flush = flush;
  return batchifiedFn;

  function batchifiedFn(value) {
    values.push(value);
    startTimer();
  };

  function startTimer() {
    if(!timer) {
      timer = setTimer(flush, 0);
    }
  }
  function flush() {
    if(timer) {
      clearTimer(timer);
      const tmp = values;
      values = [];
      timer = null;
      fn.call(self, tmp);
    }
  }
}
