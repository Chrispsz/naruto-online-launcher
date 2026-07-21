module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/main.js',
    '!src/chromium/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  // v5.9.15: Use V8 coverage provider instead of babel.
  // Babel provider wraps modules during instrumentation, breaking jest.mock
  // identity for electron/electron-log in setup.js (298 tests fail under --coverage).
  // V8 provider uses built-in VM coverage — no source transform needed.
  coverageProvider: 'v8',
  verbose: true,
  // v4.0.1: forceExit necessário porque debug.js registra setInterval (MEM stats)
  // e app.whenReady().then() que deixam handles pendurados após os testes.
  // stop() limpa o interval, mas promises do whenReady mock podem persistir.
  forceExit: true
};
