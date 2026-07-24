/**
 * Tests for src/utils/throttle.js — debounce + throttle helpers
 *
 * Verifies: trailing-edge debounce, leading-edge debounce, leading+trailing
 * throttle, no-double-fire, flush, cancel, default wait, edge cases
 * (zero/negative wait, non-function fn, leading=false first-call suppression).
 *
 * Uses jest fake timers for determinism.
 */

'use strict';

var throttle = require('../throttle');
var debounce = throttle.debounce;
var throttleFn = throttle.throttle;

describe('throttle.js', function () {
  describe('exports', function () {
    test('exports debounce as function', function () {
      expect(typeof debounce).toBe('function');
    });
    test('exports throttle as function', function () {
      expect(typeof throttleFn).toBe('function');
    });
  });

  describe('debounce — validation', function () {
    test('throws TypeError if fn is not a function', function () {
      expect(function () {
        debounce('not a fn');
      }).toThrow(TypeError);
    });
    test('does not throw for a function', function () {
      expect(function () {
        debounce(function () {});
      }).not.toThrow();
    });
    test('default wait is 16ms when omitted', function () {
      jest.useFakeTimers();
      var calls = 0;
      var d = debounce(function () {
        calls++;
      });
      d();
      expect(calls).toBe(0);
      jest.advanceTimersByTime(15);
      expect(calls).toBe(0);
      jest.advanceTimersByTime(2);
      expect(calls).toBe(1);
      jest.useRealTimers();
    });
    test('negative wait is coerced to default 16ms', function () {
      jest.useFakeTimers();
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, -100);
      d();
      jest.advanceTimersByTime(15);
      expect(calls).toBe(0);
      jest.advanceTimersByTime(2);
      expect(calls).toBe(1);
      jest.useRealTimers();
    });
  });

  describe('debounce — trailing edge (default)', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('only the LAST call in a burst fires after wait', function () {
      var calls = [];
      var d = debounce(function (x) {
        calls.push(x);
      }, 50);
      d(1);
      d(2);
      d(3);
      jest.advanceTimersByTime(49);
      expect(calls).toEqual([]);
      jest.advanceTimersByTime(1);
      expect(calls).toEqual([3]);
    });

    test('subsequent calls reset the timer', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 50);
      d();
      jest.advanceTimersByTime(40);
      d(); // reset
      jest.advanceTimersByTime(40);
      d(); // reset
      jest.advanceTimersByTime(40);
      expect(calls).toBe(0);
      jest.advanceTimersByTime(15);
      expect(calls).toBe(1);
    });

    test('preserves `this` context', function () {
      var ctx = null;
      var obj = {
        m: debounce(function () {
          ctx = this;
        }, 30)
      };
      obj.m();
      jest.advanceTimersByTime(31);
      expect(ctx).toBe(obj);
    });

    test('preserves all arguments', function () {
      var captured = null;
      var d = debounce(function () {
        captured = Array.prototype.slice.call(arguments);
      }, 30);
      d('a', 'b', 'c', 1, 2, 3);
      jest.advanceTimersByTime(31);
      expect(captured).toEqual(['a', 'b', 'c', 1, 2, 3]);
    });
  });

  describe('debounce — leading edge', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('leading fires immediately on first call', function () {
      var calls = [];
      var d = debounce(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: false }
      );
      d(1);
      expect(calls).toEqual([1]);
    });

    test('leading suppresses subsequent calls within window (no trailing)', function () {
      var calls = [];
      var d = debounce(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: false }
      );
      d(1);
      d(2);
      d(3);
      expect(calls).toEqual([1]);
      jest.advanceTimersByTime(51);
      expect(calls).toEqual([1]);
    });

    test('leading + trailing fires first and last', function () {
      var calls = [];
      var d = debounce(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: true }
      );
      d(1); // leading fire → [1]
      d(2); // captured for trailing
      d(3); // captured for trailing (overwrites)
      expect(calls).toEqual([1]);
      jest.advanceTimersByTime(50);
      expect(calls).toEqual([1, 3]);
    });

    test('leading without subsequent calls does not fire trailing', function () {
      var calls = [];
      var d = debounce(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: true }
      );
      d(1);
      jest.advanceTimersByTime(60);
      expect(calls).toEqual([1]);
    });
  });

  describe('debounce — flush + cancel', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('flush fires the pending trailing call immediately', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 100);
      d();
      expect(calls).toBe(0);
      d.flush();
      expect(calls).toBe(1);
      // After flush, no further fires happen when timer would have elapsed.
      jest.advanceTimersByTime(200);
      expect(calls).toBe(1);
    });

    test('flush is a no-op when no call is pending', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 50);
      expect(function () {
        d.flush();
      }).not.toThrow();
      expect(calls).toBe(0);
    });

    test('cancel drops the pending trailing call', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 50);
      d();
      d.cancel();
      jest.advanceTimersByTime(100);
      expect(calls).toBe(0);
    });

    test('cancel after flush is safe', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 50);
      d();
      d.flush();
      d.cancel();
      jest.advanceTimersByTime(100);
      expect(calls).toBe(1);
    });
  });

  describe('throttle — validation', function () {
    test('throws TypeError if fn is not a function', function () {
      expect(function () {
        throttleFn(null);
      }).toThrow(TypeError);
    });
    test('default wait is 16ms when omitted', function () {
      jest.useFakeTimers();
      var calls = 0;
      var t = throttleFn(function () {
        calls++;
      });
      t();
      expect(calls).toBe(1); // leading fires
      t();
      t();
      jest.advanceTimersByTime(15);
      expect(calls).toBe(1);
      jest.advanceTimersByTime(2);
      expect(calls).toBe(2); // trailing fires once
      jest.useRealTimers();
    });
  });

  describe('throttle — leading + trailing (default)', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('first call fires immediately (leading)', function () {
      var calls = [];
      var t = throttleFn(function (x) {
        calls.push(x);
      }, 50);
      t(1);
      expect(calls).toEqual([1]);
    });

    test('subsequent calls within window are coalesced into one trailing fire', function () {
      var calls = [];
      var t = throttleFn(function (x) {
        calls.push(x);
      }, 50);
      t(1); // leading → [1]
      t(2); // captured
      t(3); // captured (overwrites)
      expect(calls).toEqual([1]);
      jest.advanceTimersByTime(50);
      expect(calls).toEqual([1, 3]); // trailing fires with last args
    });

    test('no calls during window means no trailing fire', function () {
      var calls = 0;
      var t = throttleFn(function () {
        calls++;
      }, 50);
      t(); // leading
      jest.advanceTimersByTime(100);
      expect(calls).toBe(1);
    });

    test('after window elapses, leading fires again', function () {
      var calls = [];
      var t = throttleFn(function (x) {
        calls.push(x);
      }, 50);
      t(1); // leading
      jest.advanceTimersByTime(60);
      t(2); // leading again (new window)
      expect(calls).toEqual([1, 2]);
    });

    test('preserves `this` context', function () {
      var ctx = null;
      var obj = {
        m: throttleFn(function () {
          ctx = this;
        }, 30)
      };
      obj.m();
      jest.advanceTimersByTime(31);
      expect(ctx).toBe(obj);
    });

    test('preserves arguments on leading and trailing', function () {
      var captured = [];
      var t = throttleFn(function () {
        captured.push(Array.prototype.slice.call(arguments));
      }, 30);
      t('first', 1);
      t('second', 2);
      t('third', 3);
      jest.advanceTimersByTime(31);
      expect(captured).toEqual([['first', 1], ['third', 3]]);
    });
  });

  describe('throttle — leading=false', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('first call does NOT fire immediately; trailing fires after window', function () {
      var calls = [];
      var t = throttleFn(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: false, trailing: true }
      );
      t(1);
      expect(calls).toEqual([]);
      jest.advanceTimersByTime(50);
      expect(calls).toEqual([1]);
    });
  });

  describe('throttle — trailing=false', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('only leading fires; bursts within window are dropped', function () {
      var calls = [];
      var t = throttleFn(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: false }
      );
      t(1); // leading → [1]
      t(2); // dropped
      t(3); // dropped
      expect(calls).toEqual([1]);
      jest.advanceTimersByTime(50);
      expect(calls).toEqual([1]);
    });

    test('after window, leading fires again', function () {
      var calls = [];
      var t = throttleFn(
        function (x) {
          calls.push(x);
        },
        50,
        { leading: true, trailing: false }
      );
      t(1);
      jest.advanceTimersByTime(60);
      t(2);
      expect(calls).toEqual([1, 2]);
    });
  });

  describe('throttle — flush + cancel', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('flush fires the pending trailing call immediately', function () {
      var calls = [];
      var t = throttleFn(function (x) {
        calls.push(x);
      }, 50);
      t(1); // leading
      t(2); // captured for trailing
      t.flush();
      expect(calls).toEqual([1, 2]);
    });

    test('flush is a no-op when no trailing is pending', function () {
      var calls = 0;
      var t = throttleFn(function () {
        calls++;
      }, 50);
      t(); // leading
      t.flush();
      expect(calls).toBe(1);
    });

    test('cancel drops pending trailing call', function () {
      var calls = 0;
      var t = throttleFn(function () {
        calls++;
      }, 50);
      t(); // leading → 1
      t(); // captured for trailing
      t.cancel();
      jest.advanceTimersByTime(100);
      expect(calls).toBe(1);
    });
  });

  describe('integration — rapid burst coalescing', function () {
    beforeEach(function () {
      jest.useFakeTimers();
    });
    afterEach(function () {
      jest.useRealTimers();
    });

    test('debounce coalesces 100 calls into 1 trailing fire', function () {
      var calls = 0;
      var d = debounce(function () {
        calls++;
      }, 16);
      for (var i = 0; i < 100; i++) d();
      jest.advanceTimersByTime(17);
      expect(calls).toBe(1);
    });

    test('throttle coalesces 100 calls within window into 2 fires (leading + trailing)', function () {
      var calls = 0;
      var t = throttleFn(function () {
        calls++;
      }, 16);
      for (var i = 0; i < 100; i++) t();
      jest.advanceTimersByTime(20);
      // leading + 1 trailing fire (regardless of how many calls in window)
      expect(calls).toBe(2);
    });
  });
});
