/**
 * memory/guard.js — Alias para MemoryGuard.
 *
 * Histórico: era um God Object (436 linhas) que combinava monitor + GC daemon.
 * Em v1.1.2, o GcDaemon foi removido (GC forçado em main de 50MB é otimização
 * inútil) e este arquivo virou um alias direto pra MemoryGuard.
 *
 * Mantido para não quebrar imports `require('./memory/guard')` espalhados pelo
 * main.js / SessionLifecycle / StateBroadcaster.
 */
module.exports = require('./MemoryGuard');
