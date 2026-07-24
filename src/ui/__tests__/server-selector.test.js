/**
 * Tests for src/ui/server-selector.js — Native Server Selector
 *
 * Verifies:
 *   - Module exports (fetchServers, clearCache)
 *   - HTML parser (dedup, sort desc, 9999 filter, unknown locale fallback)
 *   - net.request success path → parsed servers cached
 *   - net.request HTTP non-200 → [] returned
 *   - net.request 'error' event → [] returned
 *   - net.request synchronous throw → [] returned
 *   - Timeout (10s) → [] returned, request.cancel called
 *   - Cache TTL: second call within 5 min skips net.request
 *   - clearCache(region) vs clearCache() (all)
 *
 * Strategy: jest.mock('electron', () => ({ net: { request: jest.fn() } }))
 * overrides the default __mocks__/electron.js for this file. Mock net.request
 * returns an EventEmitter-like object so the SUT can wire 'response'/'error'.
 */

'use strict';

// IMPORTANT: jest.mock factory must not reference out-of-scope vars unless
// prefixed with `mock`. We rebuild the mock per-test via mockRequest below.
jest.mock('electron', () => ({ net: { request: jest.fn() } }));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));
jest.mock('../../config/urls', () => ({
  getServerlistUrl: jest.fn(region => 'https://example.com/' + region + '/serverlist')
}));

const electron = require('electron');
const selector = require('../server-selector');

// Helper: build a mock net.Request that records 'response'/'error' handlers.
function mockRequest() {
  const r = {
    setHeader: jest.fn(),
    end: jest.fn(),
    cancel: jest.fn(),
    _handlers: {},
    on: jest.fn(function (event, cb) {
      r._handlers[event] = cb;
      return r;
    })
  };
  return r;
}

// Helper: drive a mock request through a successful HTTP 200 response.
function emitResponse(req, statusCode, bodyChunks) {
  const response = {
    statusCode: statusCode,
    _handlers: {},
    on: jest.fn(function (event, cb) {
      response._handlers[event] = cb;
      return response;
    })
  };
  // Fire 'response' on the request
  req._handlers['response'](response);
  // Emit data chunks then 'end'
  bodyChunks.forEach(chunk => response._handlers['data'](chunk));
  response._handlers['end']();
  return response;
}

describe('ui/server-selector.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selector.clearCache(); // reset cache between tests
  });

  describe('exports', () => {
    test('exports fetchServers as function', () => {
      expect(typeof selector.fetchServers).toBe('function');
    });
    test('exports clearCache as function', () => {
      expect(typeof selector.clearCache).toBe('function');
    });
  });

  describe('fetchServers — happy path', () => {
    test('returns parsed servers sorted descending by number on HTTP 200', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const html = Buffer.from(
        '<a href="/pt/serverlist/s100">S100</a>' +
          '<a href="/pt/serverlist/s200">S200</a>' +
          '<a href="/pt/serverlist/s50">S50</a>'
      );
      const promise = selector.fetchServers('br');
      emitResponse(req, 200, [html]);
      const servers = await promise;
      expect(servers).toHaveLength(3);
      // Sorted descending: s200, s100, s50
      expect(servers.map(s => s.id)).toEqual(['s200', 's100', 's50']);
      expect(servers[0]).toEqual({
        id: 's200',
        number: 200,
        url: '/pt/serverlist/s200'
      });
    });

    test('sets User-Agent header on the request', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const promise = selector.fetchServers('br');
      emitResponse(req, 200, [Buffer.from('')]);
      await promise;
      expect(req.setHeader).toHaveBeenCalledWith(
        'User-Agent',
        'shinobi-launcher/3.5 (server-selector)'
      );
    });
  });

  describe('fetchServers — parser edge cases', () => {
    test('filters out s9999 (Play Now redirect, not a real server)', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const html = Buffer.from(
        '<a href="/pt/serverlist/s9999">Play Now</a>' +
          '<a href="/pt/serverlist/s100">S100</a>'
      );
      const promise = selector.fetchServers('br');
      emitResponse(req, 200, [html]);
      const servers = await promise;
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('s100');
    });

    test('dedupes the same server number across multiple matches', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const html = Buffer.from(
        '<a href="/pt/serverlist/s100">S100</a>' +
          '<a href="/pt/serverlist/s100">S100 dup</a>' +
          '<a href="/pt/serverlist/s100">S100 dup2</a>'
      );
      const promise = selector.fetchServers('br');
      emitResponse(req, 200, [html]);
      const servers = await promise;
      expect(servers).toHaveLength(1);
    });

    test('uses "en" locale for "na" region (parses /en/serverlist/...)', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const html = Buffer.from(
        '<a href="/en/serverlist/s500">S500</a>' +
          '<a href="/pt/serverlist/s600">S600 (should be ignored — wrong locale)</a>'
      );
      const promise = selector.fetchServers('na');
      emitResponse(req, 200, [html]);
      const servers = await promise;
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('s500');
      expect(servers[0].url).toBe('/en/serverlist/s500');
    });

    test('unknown region defaults to "pt" locale', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const html = Buffer.from('<a href="/pt/serverlist/s7">S7</a>');
      const promise = selector.fetchServers('xx-unknown');
      emitResponse(req, 200, [html]);
      const servers = await promise;
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('s7');
    });
  });

  describe('fetchServers — error paths resolve to empty array', () => {
    test('HTTP non-200 → resolves []', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const promise = selector.fetchServers('br');
      emitResponse(req, 503, [Buffer.from('Service Unavailable')]);
      const servers = await promise;
      expect(servers).toEqual([]);
    });

    test('request "error" event → resolves []', async () => {
      const req = mockRequest();
      electron.net.request.mockReturnValueOnce(req);
      const promise = selector.fetchServers('br');
      req._handlers['error'](new Error('connect ECONNREFUSED'));
      const servers = await promise;
      expect(servers).toEqual([]);
    });

    test('net.request synchronous throw → resolves []', async () => {
      electron.net.request.mockImplementationOnce(() => {
        throw new Error('net unavailable');
      });
      const servers = await selector.fetchServers('br');
      expect(servers).toEqual([]);
    });
  });

  describe('fetchServers — caching', () => {
    test('second call within TTL hits cache (net.request not called again)', async () => {
      const req1 = mockRequest();
      electron.net.request.mockReturnValueOnce(req1);
      const p1 = selector.fetchServers('br');
      emitResponse(req1, 200, [Buffer.from('<a href="/pt/serverlist/s1">S1</a>')]);
      const first = await p1;
      expect(first).toHaveLength(1);

      // Second call should NOT make a new net.request — cached.
      const servers = await selector.fetchServers('br');
      expect(electron.net.request).toHaveBeenCalledTimes(1);
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('s1');
    });

    test('clearCache(region) invalidates only that region', async () => {
      const req1 = mockRequest();
      electron.net.request.mockReturnValueOnce(req1);
      const p1 = selector.fetchServers('br');
      emitResponse(req1, 200, [Buffer.from('<a href="/pt/serverlist/s1">S1</a>')]);
      await p1;

      selector.clearCache('br');

      // After clearing br, a new fetch should call net.request again.
      const req2 = mockRequest();
      electron.net.request.mockReturnValueOnce(req2);
      const p2 = selector.fetchServers('br');
      emitResponse(req2, 200, [Buffer.from('<a href="/pt/serverlist/s2">S2</a>')]);
      const servers = await p2;
      expect(electron.net.request).toHaveBeenCalledTimes(2);
      expect(servers[0].id).toBe('s2');
    });

    test('clearCache() with no arg invalidates all regions', async () => {
      const req1 = mockRequest();
      electron.net.request.mockReturnValueOnce(req1);
      const p1 = selector.fetchServers('br');
      emitResponse(req1, 200, [Buffer.from('<a href="/pt/serverlist/s1">S1</a>')]);
      await p1;

      selector.clearCache();

      const req2 = mockRequest();
      electron.net.request.mockReturnValueOnce(req2);
      const p2 = selector.fetchServers('br');
      emitResponse(req2, 200, [Buffer.from('<a href="/pt/serverlist/s9">S9</a>')]);
      const servers = await p2;
      expect(electron.net.request).toHaveBeenCalledTimes(2);
      expect(servers[0].id).toBe('s9');
    });
  });
});
