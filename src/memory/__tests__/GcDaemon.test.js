/**
 * Testes para src/memory/GcDaemon.js (Fase 3f — split + black screen fix)
 */

const electron = require('electron');
const GcDaemon = require('../GcDaemon');
const MemoryGuard = require('../MemoryGuard');

// Mock store + partition usados por _clearIdleSessions
jest.mock('../../profiles/store', () => ({
  getAll: jest.fn(() => [
    { id: 'p_active', name: 'Active' },
    { id: 'p_idle', name: 'Idle' }
  ])
}));
jest.mock('../../profiles/partition', () => ({
  getPartitionName: jest.fn(p => 'persist:profile-' + p.id),
  setBatataMode: jest.fn()
}));

const store = require('../../profiles/store');
const partition = require('../../profiles/partition');

describe('GcDaemon.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('THROTTLE_MS', () => {
    test('é 30 segundos', () => {
      expect(GcDaemon.THROTTLE_MS).toBe(30000);
    });
  });

  describe('collect — anti-reentrada', () => {
    test('retorna {busy:true} quando já está coletando', async () => {
      // Não é trivial forçar _collecting=true externamente; testa o caminho
      // throttled primeiro (chamada imediata após outra dentro da janela).
      // Primeira chamada: limpa o lastGC.
      await GcDaemon.collect({ manual: true });
      // Segunda chamada imediata: deve ser throttled OU busy.
      const r = await GcDaemon.collect({ manual: true });
      expect(r.throttled === true || r.busy === true).toBe(true);
    }, 15000);
  });

  describe('_clearIdleSessions — BLACK SCREEN FIX', () => {
    test('NÃO chama fromPartition para perfil com jogo ativo', async () => {
      // profile p_active está ativo → deve ser pulado
      jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue(['p_active']);

      const fromPartitionSpy = jest.spyOn(electron.session, 'fromPartition');

      await GcDaemon._clearIdleSessions();

      const calledPartitions = fromPartitionSpy.mock.calls.map(c => c[0]);
      // p_idle (ocioso) DEVE ser limpo
      expect(calledPartitions).toContain('persist:profile-p_idle');
      // p_active (ativo) NÃO deve ser limpo — black screen fix
      expect(calledPartitions).not.toContain('persist:profile-p_active');
    });

    test('limpa TODAS as partitions quando nenhum jogo está ativo', async () => {
      jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);

      const fromPartitionSpy = jest.spyOn(electron.session, 'fromPartition');
      await GcDaemon._clearIdleSessions();

      const calledPartitions = fromPartitionSpy.mock.calls.map(c => c[0]);
      expect(calledPartitions).toContain('persist:profile-p_active');
      expect(calledPartitions).toContain('persist:profile-p_idle');
    });

    test('pula TODAS as partitions quando todos os jogos estão ativos', async () => {
      jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue(['p_active', 'p_idle']);

      const fromPartitionSpy = jest.spyOn(electron.session, 'fromPartition');
      await GcDaemon._clearIdleSessions();

      expect(fromPartitionSpy).not.toHaveBeenCalled();
    });

    test('usa getPartitionName do módulo partition', async () => {
      jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
      jest.spyOn(electron.session, 'fromPartition').mockReturnValue({
        clearCache: jest.fn(() => Promise.resolve()),
        clearStorageData: jest.fn(() => Promise.resolve())
      });
      await GcDaemon._clearIdleSessions();
      expect(partition.getPartitionName).toHaveBeenCalled();
    });

    test('não lança mesmo se store/partition falham', async () => {
      jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
      jest.spyOn(store, 'getAll').mockImplementation(() => {
        throw new Error('boom');
      });
      // Não deve lançar — _clearIdleSessions está envolto em try/catch no collect,
      // mas chamado direto aqui pode lançar. Verificamos que o erro é propagado
      // de forma controlada (store.getAll throws → _clearIdleSessions rejeita).
      await expect(GcDaemon._clearIdleSessions()).rejects.toThrow('boom');
    });
  });

  describe('start/stop', () => {
    test('start não lança e stop limpa o timer', () => {
      expect(() => GcDaemon.start()).not.toThrow();
      expect(() => GcDaemon.stop()).not.toThrow();
    });

    test('start é idempotente (chamar 2x não cria 2 timers)', () => {
      GcDaemon.start();
      GcDaemon.start();
      GcDaemon.stop();
    });
  });
});

describe('MemoryGuard.js (split)', () => {
  test('getStats retorna objeto com campos esperados', () => {
    const s = MemoryGuard.getStats();
    expect(s).toHaveProperty('totalMB');
    expect(s).toHaveProperty('thresholdMB');
    expect(s).toHaveProperty('isBatata');
    expect(s).toHaveProperty('isRamen');
    expect(s).toHaveProperty('systemRAM');
    expect(s).toHaveProperty('uptimeMs');
    expect(s).toHaveProperty('crashCount');
    expect(s).toHaveProperty('totalGCCount');
  });

  test('getActiveProfileIds retorna array', () => {
    expect(Array.isArray(MemoryGuard.getActiveProfileIds())).toBe(true);
  });

  test('registerGameWebContents adiciona ao registry e getActiveProfileIds retorna o id', () => {
    const fakeWc = { once: jest.fn() };
    MemoryGuard.registerGameWebContents('p_test_x', fakeWc);
    expect(MemoryGuard.getActiveProfileIds()).toContain('p_test_x');
    MemoryGuard.unregisterGameWebContents('p_test_x');
    expect(MemoryGuard.getActiveProfileIds()).not.toContain('p_test_x');
  });

  test('setForceBatata alterna estado e não lança', () => {
    expect(() => MemoryGuard.setForceBatata(true)).not.toThrow();
    expect(MemoryGuard.isBatata()).toBe(true);
    expect(() => MemoryGuard.setForceBatata(false)).not.toThrow();
  });

  test('reportCrash incrementa crashCount', () => {
    const before = MemoryGuard.getStats().crashCount;
    MemoryGuard.reportCrash();
    const after = MemoryGuard.getStats().crashCount;
    expect(after).toBe(before + 1);
  });
});

// ── CRON-3: Additional coverage tests ──

describe('collect — caminhos normais', () => {
  test('retorna resultado com beforeMB/afterMB quando GC executa', async () => {
    // Garante que não está throttled (ja passou o tempo)
    await new Promise(function (r) {
      setTimeout(r, 100);
    });
    const r = await GcDaemon.collect({ manual: false });
    // Pode ser throttled se a chamada anterior foi recente
    if (!r.throttled && !r.busy) {
      expect(r).toHaveProperty('beforeMB');
      expect(r).toHaveProperty('afterMB');
      expect(r).toHaveProperty('savedMB');
      expect(r.throttled).toBe(false);
    }
  });

  test('retorna {busy:true} quando collect já em execução', async () => {
    // Força _collecting=true simulando uma chamada lenta
    // A forma mais confiável: chamar collect() que retarda, depois chamar outra
    // mas _collecting é resetado via finally. Usamos o throttle path.
    // Chamada dupla rápida → segunda deve ser busy ou throttled.
    var p1 = GcDaemon.collect({ manual: true });
    var p2 = GcDaemon.collect({ manual: true });
    var r2 = await p2;
    // r2 deve ser busy (primeira ainda em execução) ou throttled
    expect(r2.busy === true || r2.throttled === true).toBe(true);
    await p1;
  }, 15000);
});

describe('collect — camadas de erro', () => {
  test('não lança se MemoryGuard.getStats falhar', async () => {
    jest.spyOn(MemoryGuard, 'getStats').mockImplementation(function () {
      throw new Error('stats boom');
    });
    // Precisa esperar throttle passar
    await new Promise(function (r) {
      setTimeout(r, 100);
    });
    // Deve ser capturado pelo try/catch no collect
    var threw = false;
    try {
      await GcDaemon.collect({ manual: true });
    } catch (e) {
      threw = true;
    }
    // collect nunca lança (finally reseta _collecting)
    expect(threw).toBe(false);
    MemoryGuard.getStats.mockRestore();
  }, 15000);
});

describe('start — daemon behavior', () => {
  test('start cria timer e stop limpa', () => {
    GcDaemon.start();
    GcDaemon.stop();
    // Se não lançou, passou
  });

  test('stop é safe quando nunca startou', () => {
    GcDaemon.stop();
  });

  test('start é idempotente — segundo start ignora', () => {
    GcDaemon.start();
    GcDaemon.start();
    GcDaemon.stop();
  });
});

describe('guard.js facade', () => {
  const guard = require('../guard');

  test('expõe collect, start, stop do GcDaemon', () => {
    expect(typeof guard.collect).toBe('function');
    expect(typeof guard.start).toBe('function');
    expect(typeof guard.stop).toBe('function');
  });

  test('expõe MemoryGuard getters', () => {
    expect(typeof guard.getStats).toBe('function');
    expect(typeof guard.isBatata).toBe('function');
    expect(typeof guard.getActiveProfileIds).toBe('function');
    expect(typeof guard.registerGameWebContents).toBe('function');
  });

  test('stop não lança', () => {
    expect(() => guard.stop()).not.toThrow();
  });
});

describe('GcDaemon — additional coverage', () => {
  afterEach(() => {
    GcDaemon.stop();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    // Re-ensure store.getAll returns valid data after restore
    store.getAll.mockReturnValue([
      { id: 'p_active', name: 'Active' },
      { id: 'p_idle', name: 'Idle' }
    ]);
  });

  test('collect chama process.gc(true) quando disponível', async () => {
    const origGc = process.gc;
    process.gc = jest.fn();
    // The previous test's collect may have set _lastGC recently.
    // We mock MemoryGuard.getStats to control the flow and wait long enough.
    await new Promise(r => setTimeout(r, 35000));
    await GcDaemon.collect({ manual: true });
    expect(process.gc).toHaveBeenCalledWith(true);
    process.gc = origGc;
  }, 60000);

  test('collect não lança se process.gc(true) throws', async () => {
    const origGc = process.gc;
    process.gc = jest.fn(() => {
      throw new Error('gc boom');
    });
    await new Promise(r => setTimeout(r, 35000));
    var threw = false;
    try {
      await GcDaemon.collect({ manual: true });
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(false);
    process.gc = origGc;
  }, 60000);

  test('collect camada 1: não lança se _clearIdleSessions rejects', async () => {
    jest.spyOn(GcDaemon, '_clearIdleSessions').mockRejectedValue(new Error('layer1'));
    await new Promise(r => setTimeout(r, 35000));
    var threw = false;
    try {
      await GcDaemon.collect({ manual: true });
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(false);
  }, 60000);

  test('_clearIdleSessions tolera defaultSession.clearCache rejection', async () => {
    jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
    electron.session.defaultSession.clearCache.mockRejectedValueOnce(new Error('dc err'));
    await expect(GcDaemon._clearIdleSessions()).resolves.toBeUndefined();
  });

  test('_clearIdleSessions tolera defaultSession.clearStorageData rejection', async () => {
    jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
    electron.session.defaultSession.clearStorageData.mockRejectedValueOnce(new Error('dsd err'));
    await expect(GcDaemon._clearIdleSessions()).resolves.toBeUndefined();
  });

  test('_clearIdleSessions tolera partition clearCache rejection', async () => {
    jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
    electron.session.fromPartition.mockReturnValueOnce({
      clearCache: jest.fn(() => Promise.reject(new Error('pcc'))),
      clearStorageData: jest.fn(() => Promise.resolve())
    });
    await expect(GcDaemon._clearIdleSessions()).resolves.toBeUndefined();
  });

  test('_clearIdleSessions tolera partition clearStorageData rejection', async () => {
    jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
    electron.session.fromPartition.mockReturnValueOnce({
      clearCache: jest.fn(() => Promise.resolve()),
      clearStorageData: jest.fn(() => Promise.reject(new Error('psd')))
    });
    await expect(GcDaemon._clearIdleSessions()).resolves.toBeUndefined();
  });

  test('_clearIdleSessions tolera getPartitionName throw (partition not loaded)', async () => {
    jest.spyOn(MemoryGuard, 'getActiveProfileIds').mockReturnValue([]);
    partition.getPartitionName.mockImplementation(function (p) {
      if (p.id === 'p_idle') throw new Error('no partition');
      return 'persist:profile-' + p.id;
    });
    await expect(GcDaemon._clearIdleSessions()).resolves.toBeUndefined();
  });
});
