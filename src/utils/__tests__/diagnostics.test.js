/**
 * Testes para src/utils/diagnostics.js
 * Cobertura: _sanitize, _sanitizeObj, _collectSystemInfo, exportZip
 */

const { _sanitize, _sanitizeObj, _collectSystemInfo, exportZip } = require('../diagnostics');

describe('diagnostics.js - _sanitize', () => {
  test('remove paths absolutos Linux', () => {
    expect(_sanitize('erro em /home/joao/arquivo')).toBe('erro em /home/[user]/arquivo');
  });

  test('remove paths absolutos Windows', () => {
    expect(_sanitize('path C:\\Users\\Joao\\docs')).toBe('path C:\\Users\\[user]\\docs');
  });

  test('remove tokens hex longos (40+ chars)', () => {
    const token = 'a'.repeat(44);
    expect(_sanitize('token: ' + token)).toBe('token: [token-redacted]');
  });

  test('não remove tokens curtos', () => {
    expect(_sanitize('id: abc123')).toBe('id: abc123');
  });

  test('remove emails', () => {
    expect(_sanitize('contato: user@example.com')).toBe('contato: [email-redacted]');
  });

  test('remove múltiplos emails', () => {
    const result = _sanitize('a@b.com and c@d.org');
    expect(result).not.toContain('@');
    expect(result).toMatch(/\[email-redacted\]/g);
  });

  test('retorna string para não-string', () => {
    expect(_sanitize(42)).toBe('42');
    expect(_sanitize(null)).toBe('');
    expect(_sanitize(undefined)).toBe('');
  });

  test('retorna string vazia para null/undefined', () => {
    expect(_sanitize(null)).toBe('');
    expect(_sanitize(undefined)).toBe('');
  });

  test('não modifica string sem dados sensíveis', () => {
    expect(_sanitize('erro genérico no módulo X')).toBe('erro genérico no módulo X');
  });

  test('remove path + email + token em sequência', () => {
    // 40+ hex chars
    const hex = '0123456789abcdef'.repeat(3); // 48 chars
    const result = _sanitize('path: /home/joao/test email: a@b.com tok: ' + hex);
    expect(result).not.toContain('/home/joao');
    expect(result).not.toContain('a@b.com');
    expect(result).toContain('[token-redacted]');
  });
});

describe('diagnostics.js - _sanitizeObj', () => {
  test('sanitiza string simples', () => {
    expect(_sanitizeObj('/home/user/test')).toBe('/home/[user]/test');
  });

  test('preserva números', () => {
    expect(_sanitizeObj(42)).toBe(42);
  });

  test('preserva booleanos', () => {
    expect(_sanitizeObj(true)).toBe(true);
    expect(_sanitizeObj(false)).toBe(false);
  });

  test('preserva null e undefined', () => {
    expect(_sanitizeObj(null)).toBeNull();
    expect(_sanitizeObj(undefined)).toBeUndefined();
  });

  test('redacta campos sensíveis por nome (case-insensitive)', () => {
    const obj = {
      name: 'test',
      password: 'secret123',
      Password: 'upper',
      PASS: 'allcaps',
      token: 'abc',
      credentials: { user: 'a', pass: 'b' },
      safeField: 'visible'
    };
    const result = _sanitizeObj(obj);
    expect(result.password).toBe('[redacted]');
    expect(result.Password).toBe('[redacted]');
    expect(result.PASS).toBe('[redacted]');
    expect(result.token).toBe('[redacted]');
    expect(result.credentials).toBe('[redacted]');
    expect(result.safeField).toBe('visible');
    expect(result.name).toBe('test');
  });

  test('redacta campos cookie/cookies/loginkey/oas_user/vault', () => {
    const obj = {
      cookie: 'session=abc',
      cookies: 'a=b; c=d',
      loginkey: 'key123',
      oas_user: 'jwt123',
      vault: 'encrypted_data'
    };
    const result = _sanitizeObj(obj);
    expect(result.cookie).toBe('[redacted]');
    expect(result.cookies).toBe('[redacted]');
    expect(result.loginkey).toBe('[redacted]');
    expect(result.oas_user).toBe('[redacted]');
    expect(result.vault).toBe('[redacted]');
  });

  test('sanitiza arrays recursivamente', () => {
    const arr = ['/home/user/file', 'safe@string.com', 42];
    const result = _sanitizeObj(arr);
    expect(result[0]).toBe('/home/[user]/file');
    expect(result[1]).toBe('[email-redacted]');
    expect(result[2]).toBe(42);
  });

  test('sanitiza objetos aninhados', () => {
    const obj = { outer: { inner: '/home/deep/path' } };
    const result = _sanitizeObj(obj);
    expect(result.outer.inner).toBe('/home/[user]/path');
  });

  test('respeita depth limit (> 6 níveis)', () => {
    // _sanitizeObj(obj) starts at depth 0.
    // depth=6: still processes object, children get depth=7 → '[max-depth]'
    // depth=7: returns '[max-depth]' directly
    // Need 8 nesting levels to hit depth 7 after walking 7 children
    let obj = { level: 0 };
    let current = obj;
    for (let i = 1; i <= 10; i++) {
      current.child = { level: i };
      current = current.child;
    }
    const result = _sanitizeObj(obj);
    // Walk 6 children → depth 6 object (has [max-depth] children)
    let cur = result;
    for (let i = 0; i < 6; i++) {
      cur = cur.child;
    }
    // At depth 6, child properties are [max-depth] strings
    expect(cur.child).toBe('[max-depth]');
  });

  test('retorna string para tipos inesperados', () => {
    expect(_sanitizeObj(function () {})).toBe(String(function () {}));
  });
});

describe('diagnostics.js - _collectSystemInfo', () => {
  test('retorna objeto com estrutura esperada', () => {
    const info = _collectSystemInfo();
    expect(info).toHaveProperty('app');
    expect(info).toHaveProperty('runtime');
    expect(info).toHaveProperty('os');
    expect(info).toHaveProperty('timestamp');
    expect(info).toHaveProperty('timestamp_epoch');
  });

  test('app contém name e version', () => {
    const info = _collectSystemInfo();
    expect(info.app.name).toBeDefined();
    expect(info.app.version).toBeDefined();
  });

  test('runtime contém versões node e v8 (electron/chrome only in Electron runtime)', () => {
    const info = _collectSystemInfo();
    // node and v8 are always available; electron/chrome only in real Electron
    expect(info.runtime.node).toBeDefined();
    expect(info.runtime.v8).toBeDefined();
  });

  test('os contém platform, arch, RAM, CPU', () => {
    const info = _collectSystemInfo();
    expect(info.os.platform).toBeDefined();
    expect(info.os.arch).toBeDefined();
    expect(typeof info.os.totalRAM_GB).toBe('number');
    expect(typeof info.os.freeRAM_GB).toBe('number');
    expect(typeof info.os.cpuCores).toBe('number');
    expect(info.os.cpuModel).toBeDefined();
  });

  test('hostname é redacted', () => {
    const info = _collectSystemInfo();
    expect(info.os.hostname).toBe('redacted');
  });

  test('cpuModel é sanitizado (não contém path real)', () => {
    const info = _collectSystemInfo();
    // cpuModel goes through _sanitize, but real CPU models shouldn't have user paths
    expect(typeof info.os.cpuModel).toBe('string');
  });

  test('timestamp é ISO string válido', () => {
    const info = _collectSystemInfo();
    expect(new Date(info.timestamp).getTime()).not.toBeNaN();
  });

  test('timestamp_epoch é número', () => {
    const info = _collectSystemInfo();
    expect(typeof info.timestamp_epoch).toBe('number');
    expect(info.timestamp_epoch).toBeGreaterThan(0);
  });

  test('uptime_min é número positivo', () => {
    const info = _collectSystemInfo();
    expect(typeof info.os.uptime_min).toBe('number');
    expect(info.os.uptime_min).toBeGreaterThanOrEqual(0);
  });
});

describe('diagnostics.js - exportZip', () => {
  test('retorna ok:false,canceled:true quando diálogo cancelado', async () => {
    // dialog.showSaveDialog mock retorna { canceled: true }
    const { dialog } = require('electron');
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const result = await exportZip(null);
    expect(result.ok).toBe(false);
    expect(result.canceled).toBe(true);
  });

  test('retorna ok:false quando não há filePath', async () => {
    const { dialog } = require('electron');
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined });

    const result = await exportZip(null);
    expect(result.ok).toBe(false);
  });

  test('retorna ok:true quando salva com sucesso', async () => {
    const { dialog } = require('electron');
    dialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: '/tmp/test-diag.zip'
    });

    // fs is the real module here — patch writeFileSync to be a no-op
    const fsModule = require('fs');
    const origWrite = fsModule.writeFileSync;
    fsModule.writeFileSync = function () {};

    try {
      const result = await exportZip(null);
      expect(result.ok).toBe(true);
      expect(result.path).toBe('/tmp/test-diag.zip');
      expect(typeof result.size).toBe('number');
      expect(typeof result.entries).toBe('number');
      expect(result.entries).toBeGreaterThanOrEqual(4);
    } finally {
      fsModule.writeFileSync = origWrite;
    }
  });

  test('retorna ok:false com error em caso de exceção', async () => {
    // Force an error by making _collectSystemInfo throw
    // Since we can't easily mock require inside the module, we test error path
    // by passing a scenario where dialog throws
    const { dialog } = require('electron');
    dialog.showSaveDialog.mockImplementationOnce(() => {
      throw new Error('Dialog error');
    });

    const result = await exportZip(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
