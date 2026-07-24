/**
 * utils/throttle.js — Tiny throttle + debounce helpers (perf-opt v1)
 *
 * Why: src/ui/app.js receives bursty IPC events ('auto-login:status',
 * 'game-window:status') that each call renderProfiles() synchronously.
 * When a game launches, 3-5 of these can fire in <100ms, thrashing the
 * DOM (innerHTML reset + N card createElement + addEventListener).
 *
 * Coalescing these calls with a 16ms debounce (~1 frame) keeps the UI
 * responsive without changing the public handler contract.
 *
 * Zero dependencies. Pure CommonJS so both main and renderer can require it.
 *
 * API:
 *   debounce(fn, wait = 16, opts = { leading: false, trailing: true })
 *     → returns a debounced function. The last call within `wait` ms wins.
 *       If opts.leading === true, the FIRST call fires immediately and the
 *       trailing edge is suppressed unless opts.trailing is also true.
 *
 *   throttle(fn, wait = 16, opts = { leading: true, trailing: true })
 *     → returns a throttled function. Fires at most once per `wait` ms.
 *       The first call fires immediately (leading); the last call's args
 *       are captured for a trailing fire if more invocations happened
 *       during the wait window.
 *
 * Both helpers expose `.flush()` (fire pending trailing call immediately)
 * and `.cancel()` (drop pending trailing call) on the returned function.
 *
 * The helpers are stable across many calls and do not allocate closures
 * per invocation — only the wrapped function carries state.
 */

'use strict';

/**
 * Returns a debounced version of `fn`. Trailing-edge by default.
 * @param {Function} fn
 * @param {number} [wait=16] - debounce window in ms
 * @param {{leading?:boolean, trailing?:boolean}} [opts]
 * @returns {Function & {flush:Function, cancel:Function}}
 */
function debounce(fn, wait, opts) {
  if (typeof fn !== 'function') {
    throw new TypeError('debounce: fn must be a function');
  }
  var w = typeof wait === 'number' && wait >= 0 ? wait : 16;
  var leading = !!(opts && opts.leading);
  var trailing = opts && opts.trailing === false ? false : true;

  var timer = null;
  var lastArgs = null;
  var lastThis = null;
  var firedLeading = false;

  function invoke() {
    if (lastArgs !== null) {
      var args = lastArgs;
      var ctx = lastThis;
      lastArgs = null;
      lastThis = null;
      timer = null;
      firedLeading = false;
      fn.apply(ctx, args);
    } else {
      timer = null;
      firedLeading = false;
    }
  }

  function wrapped() {
    lastArgs = arguments;
    lastThis = this;
    if (leading && !firedLeading && timer === null) {
      // Leading edge: fire immediately, then suppress until window resets.
      firedLeading = true;
      var args = lastArgs;
      var ctx = lastThis;
      lastArgs = null;
      lastThis = null;
      fn.apply(ctx, args);
      // Schedule a trailing reset; if no further calls happen, nothing fires.
      timer = setTimeout(function () {
        timer = null;
        firedLeading = false;
        // If a call came in during the window and trailing is on, fire it now.
        if (trailing && lastArgs !== null) {
          invoke();
        }
      }, w);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      firedLeading = false;
      if (trailing && lastArgs !== null) {
        invoke();
      }
    }, w);
  }

  wrapped.flush = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      firedLeading = false;
      if (trailing && lastArgs !== null) {
        invoke();
      }
    }
  };

  wrapped.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
    lastThis = null;
    firedLeading = false;
  };

  return wrapped;
}

/**
 * Returns a throttled version of `fn`. At most one invocation per `wait` ms.
 * Leading + trailing by default (matches lodash throttle defaults).
 * @param {Function} fn
 * @param {number} [wait=16] - throttle window in ms
 * @param {{leading?:boolean, trailing?:boolean}} [opts]
 * @returns {Function & {flush:Function, cancel:Function}}
 */
function throttle(fn, wait, opts) {
  if (typeof fn !== 'function') {
    throw new TypeError('throttle: fn must be a function');
  }
  var w = typeof wait === 'number' && wait >= 0 ? wait : 16;
  var leading = opts && opts.leading === false ? false : true;
  var trailing = opts && opts.trailing === false ? false : true;

  var timer = null;
  var lastArgs = null;
  var lastThis = null;
  var lastCallAt = 0;

  function fire(args, ctx) {
    lastArgs = null;
    lastThis = null;
    lastCallAt = Date.now();
    fn.apply(ctx, args);
  }

  function wrapped() {
    var now = Date.now();
    var remaining = w - (now - lastCallAt);
    lastArgs = arguments;
    lastThis = this;
    if (remaining <= 0 || remaining > w || (lastCallAt === 0 && !leading)) {
      // Either window elapsed, or clock jumped, or first call w/o leading.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (leading || lastCallAt !== 0) {
        fire(lastArgs, lastThis);
      } else {
        // First call suppressed (leading=false): schedule trailing.
        if (!timer && trailing) {
          timer = setTimeout(function () {
            timer = null;
            if (lastArgs !== null) fire(lastArgs, lastThis);
          }, w);
        }
      }
    } else if (!timer && trailing) {
      timer = setTimeout(function () {
        timer = null;
        lastCallAt = leading ? Date.now() : 0;
        if (lastArgs !== null) {
          fire(lastArgs, lastThis);
        }
      }, remaining);
    }
  }

  wrapped.flush = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      if (lastArgs !== null) {
        fire(lastArgs, lastThis);
      }
    }
  };

  wrapped.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
    lastThis = null;
    lastCallAt = 0;
  };

  return wrapped;
}

module.exports = {
  debounce: debounce,
  throttle: throttle
};
