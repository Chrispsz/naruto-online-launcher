/**
 * Testes para src/app/StallDetector.js (v5.9.11)
 *
 * Verifica: attach/detach, detecção de SWF error burst, inactivity stall,
 * backoff (max retries), ready detection (auto-stop), cleanup, edge cases.
 */

'use strict';

const StallDetector = require('../StallDetector');

/**
 * Cria um mock de session com webRequest.onCompleted + onErrorOccurred.
 * Os callbacks ficam acessíveis pra invocação manual nos testes.
 * v5.9.28: StallDetector agora passa filtro { urls: ['<all_urls>'] } no attach,
 * então o mock recebe (filter, handler) em vez de (handler).
 */
function makeMockSession() {
  var callbacks = {
    onCompleted: null,
    onErrorOccurred: null
  };
  return {
    webRequest: {
      onCompleted: jest.fn(function (filter, cb) {
        // Se cb é null (detach), não atualiza callback
        if (cb) callbacks.onCompleted = cb;
      }),
      onErrorOccurred: jest.fn(function (filter, cb) {
        if (cb) callbacks.onErrorOccurred = cb;
      })
    },
    _callbacks: callbacks
  };
}

function makeMockWin(destroyed) {
  return {
    isDestroyed: jest.fn(function () {
      return !!destroyed;
    })
  };
}

describe('StallDetector.js', function () {
  describe('exports', function () {
    test('exporta attach como função', function () {
      expect(typeof StallDetector.attach).toBe('function');
    });


  });

  describe('attach — validação', function () {
    test('retorna null se win ausente', function () {
      var result = StallDetector.attach(null, makeMockSession(), {
        onStall: jest.fn()
      });
      expect(result).toBeNull();
    });

    test('retorna null se session ausente', function () {
      var result = StallDetector.attach(makeMockWin(), null, {
        onStall: jest.fn()
      });
      expect(result).toBeNull();
    });

    test('retorna null se onStall não é função', function () {
      var result = StallDetector.attach(makeMockWin(), makeMockSession(), {
        onStall: 'not-a-function'
      });
      expect(result).toBeNull();
    });

    test('retorna objeto com detach quando válido', function () {
      var result = StallDetector.attach(makeMockWin(), makeMockSession(), {
        profileName: 'Test',
        onStall: jest.fn()
      });
      expect(result).not.toBeNull();
      expect(typeof result.detach).toBe('function');
      result.detach();
    });

    test('registra listeners onCompleted + onErrorOccurred na session', function () {
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'Test',
        onStall: jest.fn()
      });
      expect(ses.webRequest.onCompleted).toHaveBeenCalledTimes(1);
      expect(ses.webRequest.onErrorOccurred).toHaveBeenCalledTimes(1);
      inst.detach();
    });
  });

  describe('SWF error burst detection', function () {
    test('2 SWFs falhando em 60s dispara onStall', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestBurst',
        onStall: onStall,
        opts: { pollIntervalMs: 1000 }
      });

      // Simula 2 falhas de SWF
      ses._callbacks.onErrorOccurred({
        url: 'https://res.huoying.qq.com/assets/ui.swf',
        error: 'net::ERR_CONNECTION_RESET'
      });
      ses._callbacks.onErrorOccurred({
        url: 'https://res.huoying.qq.com/main.swf',
        error: 'net::ERR_TIMED_OUT'
      });

      // Avança o poll
      jest.advanceTimersByTime(1100);

      expect(onStall).toHaveBeenCalledTimes(1);
      inst.detach();
      jest.useRealTimers();
    });

    test('1 SWF falhando NÃO dispara onStall (threshold = 2)', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestSingle',
        onStall: onStall,
        opts: { pollIntervalMs: 1000 }
      });

      ses._callbacks.onErrorOccurred({
        url: 'https://res.huoying.qq.com/one.swf',
        error: 'net::ERR_TIMED_OUT'
      });

      jest.advanceTimersByTime(1100);
      expect(onStall).not.toHaveBeenCalled();
      inst.detach();
      jest.useRealTimers();
    });

    test('erros não-SWF NÃO contam pra burst', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestNonSwf',
        onStall: onStall,
        opts: { pollIntervalMs: 1000 }
      });

      // 5 erros de non-SWF (imagens, CSS, etc.)
      for (var i = 0; i < 5; i++) {
        ses._callbacks.onErrorOccurred({
          url: 'https://example.com/image' + i + '.png',
          error: 'net::ERR_FAILED'
        });
      }

      jest.advanceTimersByTime(1100);
      expect(onStall).not.toHaveBeenCalled();
      inst.detach();
      jest.useRealTimers();
    });
  });

  describe('inactivity stall detection', function () {
    test('45s sem atividade de rede dispara onStall', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestInactivity',
        onStall: onStall,
        opts: {
          stallThresholdMs: 45000,
          pollIntervalMs: 5000,
          readyAfterMs: 999999 // desabilita ready detection pra este teste
        }
      });

      // Avança 51s sem nenhuma atividade (poll a cada 5s, precisa passar 45s + 1 poll)
      jest.advanceTimersByTime(51000);

      expect(onStall).toHaveBeenCalledTimes(1);
      inst.detach();
      jest.useRealTimers();
    });

    test('atividade contínua (onCompleted) NÃO dispara stall', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestActive',
        onStall: onStall,
        opts: {
          stallThresholdMs: 30000,
          pollIntervalMs: 5000,
          readyAfterMs: 999999
        }
      });

      // Simula atividade contínua a cada 20s por 2 min
      for (var t = 0; t < 120; t += 20) {
        jest.advanceTimersByTime(20000);
        ses._callbacks.onCompleted({ url: 'https://example.com/resource.swf' });
      }

      expect(onStall).not.toHaveBeenCalled();
      inst.detach();
      jest.useRealTimers();
    });
  });

  describe('backoff (max retries)', function () {
    test('dispara onStall no máximo 3 vezes em 10 min', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestBackoff',
        onStall: onStall,
        opts: {
          stallThresholdMs: 10000,
          pollIntervalMs: 2000,
          swfErrorWindowMs: 60000,
          retryWindowMs: 600000,
          maxRetries: 3,
          readyAfterMs: 999999
        }
      });

      // Cada stall: 10s inativos → trigger → reset activity → 10s → trigger again
      for (var i = 0; i < 5; i++) {
        jest.advanceTimersByTime(11000);
      }

      // Deve ter disparado exatamente 3 vezes (maxRetries)
      expect(onStall).toHaveBeenCalledTimes(3);
      inst.detach();
      jest.useRealTimers();
    });

    test('após maxRetries, encerra monitoramento (detach automático)', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestMaxRetries',
        onStall: onStall,
        opts: {
          stallThresholdMs: 5000,
          pollIntervalMs: 1000,
          maxRetries: 2,
          readyAfterMs: 999999
        }
      });

      // Dispara 2 stalls (maxRetries)
      jest.advanceTimersByTime(6000);
      jest.advanceTimersByTime(6000);
      expect(onStall).toHaveBeenCalledTimes(2);

      // Mais tempo — não deve disparar de novo (detector parou)
      jest.advanceTimersByTime(60000);
      expect(onStall).toHaveBeenCalledTimes(2);

      inst.detach();
      jest.useRealTimers();
    });
  });

  describe('ready detection (auto-stop)', function () {
    test('após readyAfterMs de atividade contínua, encerra monitoramento', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestReady',
        onStall: onStall,
        opts: {
          stallThresholdMs: 30000,
          pollIntervalMs: 5000,
          readyAfterMs: 60000
        }
      });

      // Atividade contínua por 65s (além de readyAfterMs=60s)
      for (var t = 0; t < 65; t += 10) {
        jest.advanceTimersByTime(10000);
        if (inst._isStopped()) break; // detector parou (ready), não simula mais
        ses._callbacks.onCompleted({ url: 'https://example.com/res.swf' });
      }

      // Não disparou stall (jogo carregou com sucesso)
      expect(onStall).not.toHaveBeenCalled();
      // Detector deve estar parado (ready)
      expect(inst._isReady()).toBe(true);
      inst.detach();
      jest.useRealTimers();
    });
  });

  describe('detach', function () {
    test('detach remove listeners da session', function () {
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestDetach',
        onStall: jest.fn()
      });

      inst.detach();

      // detach agora passa o filtro { urls: ['<all_urls>'] } para remoção precisa
      var calls = ses.webRequest.onCompleted.mock.calls;
      // A última chamada é o detach (filtro + null). A primeira é o attach (filtro + handler).
      var lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toEqual({ urls: ['<all_urls>'] });
      expect(lastCall[1]).toBeNull();
    });

    test('detach é idempotente (chamar 2x não quebra)', function () {
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestIdempotent',
        onStall: jest.fn()
      });

      inst.detach();
      expect(function () {
        inst.detach();
      }).not.toThrow();
    });
  });

  describe('win destroyed → auto-detach', function () {
    test('detecta win destruído no poll e desanexa', function () {
      jest.useFakeTimers();
      var onStall = jest.fn();
      var ses = makeMockSession();
      var win = makeMockWin(false);

      var inst = StallDetector.attach(win, ses, {
        profileName: 'TestDestroyed',
        onStall: onStall,
        opts: { pollIntervalMs: 1000 }
      });

      // Marca win como destruído
      win.isDestroyed.mockReturnValue(true);

      // Avança o poll — deve detectar e desanexar
      jest.advanceTimersByTime(1100);

      expect(onStall).not.toHaveBeenCalled();
      expect(inst._isStopped()).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('onStall callback error handling', function () {
    test('se onStall lança erro, não quebra o detector', function () {
      jest.useFakeTimers();
      var ses = makeMockSession();
      var inst = StallDetector.attach(makeMockWin(), ses, {
        profileName: 'TestCallbackError',
        onStall: function () {
          throw new Error('callback bug');
        },
        opts: {
          stallThresholdMs: 5000,
          pollIntervalMs: 1000,
          maxRetries: 3,
          readyAfterMs: 999999
        }
      });

      // Dispara stall (callback lança erro mas detector continua)
      jest.advanceTimersByTime(6000);

      // Não deve ter lançado erro não-capturado
      expect(inst._isStopped()).toBe(false);
      inst.detach();
      jest.useRealTimers();
    });
  });
});
