/**
 * Tempmail Registration — mail.tm API
 * v1.0.0 — v4.9: create temporary accounts to log into Naruto Online
 *
 * Flow:
 *   1. GET  https://api.mail.tm/domains            → gets available domain
 *   2. POST https://api.mail.tm/accounts           → creates account {address, password}
 *   3. POST https://api.mail.tm/token              → gets mail.tm JWT
 *   4. POST https://passport.oasgames.com/?m=register&email=&pwd=
 *      → registers on Naruto Online, receives loginKey (JWT HS256, 2h)
 *
 * Verified live on 2026-07-14: account created, registered, JWT captured,
 * login working, recommended server returned. No Flash, no CAPTCHA,
 * no email verification (email_active:0 is the default and the account is usable).
 *
 * Limits: mail.tm has per-IP rate-limit (~8 accounts/hour). Passport has
 * rate-limit unknown. JWT expires in 2h (without remember=1).
 */

'use strict';

const logger = require('../utils/logger');
const jwt = require('../utils/jwt');

const MAIL_TM_BASE = 'https://api.mail.tm';
const MAIL_TM_DOMAINS = MAIL_TM_BASE + '/domains';
const MAIL_TM_ACCOUNTS = MAIL_TM_BASE + '/accounts';
const MAIL_TM_TOKEN = MAIL_TM_BASE + '/token';

// v4.9.1: Rate limiting to avoid overloading mail.tm + passport.oasgames.com
// mail.tm has ~8 accounts/hour per IP; passport has unknown rate-limit.
// Limit: max 5 accounts per hour, minimum 30s between attempts.
const _rateLimit = { history: [], MAX_PER_HOUR: 5, MIN_INTERVAL_MS: 30000 };

function _checkRateLimit() {
  const now = Date.now();
  // Remove entries older than 1h
  _rateLimit.history = _rateLimit.history.filter(function (t) {
    return now - t < 3600000;
  });
  if (_rateLimit.history.length >= _rateLimit.MAX_PER_HOUR) {
    const oldest = _rateLimit.history[0];
    const waitMs = 3600000 - (now - oldest);
    throw new Error(
      'Rate limit: max ' +
        _rateLimit.MAX_PER_HOUR +
        ' accounts/hour. Try again in ' +
        Math.ceil(waitMs / 60000) +
        ' min.'
    );
  }
  if (_rateLimit.history.length > 0) {
    const last = _rateLimit.history[_rateLimit.history.length - 1];
    const since = now - last;
    if (since < _rateLimit.MIN_INTERVAL_MS) {
      throw new Error(
        'Rate limit: wait ' +
          Math.ceil((_rateLimit.MIN_INTERVAL_MS - since) / 1000) +
          's between accounts.'
      );
    }
  }
  _rateLimit.history.push(now);
}

/**
 * Creates a tempmail account + registers on Naruto Online, returning credentials + JWT.
 *
 * @param {Object} [opts]
 * @param {string} [opts.password] — account password (default: random strong one generated)
 * @param {string} [opts.prefix]   — email prefix (default: 'shinobi' + random)
 * @returns {Promise<{tempmail:{address:string,password:string,mailtmToken:string,accountId:string},game:{playerId:string,nickname:string,loginKey:string,jwtDecoded:Object,registeredAt:number,expiresAt:number}}>}
 */
async function createNarutoAccount(opts) {
  opts = opts || {};
  // v4.9.1: rate limit to avoid overloading mail.tm + passport
  _checkRateLimit();
  const password = opts.password || _generatePassword();
  const prefix = opts.prefix || 'shinobi' + Math.random().toString(36).slice(2, 10);

  // 1. Gets available domain from mail.tm
  const domain = await _getMailTmDomain();
  const address = prefix + '@' + domain;
  logger.info('Tempmail: creating account ' + address);

  // 2. Creates account on mail.tm
  await _mailTmCreateAccount(address, password);

  // 3. Gets mail.tm token (for future inbox)
  const mailtmToken = await _mailTmGetToken(address, password);
  logger.info('Tempmail: mail.tm account active');

  // 4. checkname — confirms email isn't registered on Naruto
  const checkResp = await _httpGetJson(
    'https://passport.oasgames.com/index.php?m=checkname&email=' + encodeURIComponent(address)
  );
  if (checkResp && checkResp.status === 'ok' && checkResp.val === true) {
    throw new Error('Email already registered on Naruto Online (unexpected for new tempmail)');
  }

  // 5. Register on passport.oasgames.com → receive loginKey (JWT)
  const regResp = await _httpGetJson(
    'https://passport.oasgames.com/index.php?m=register&email=' +
      encodeURIComponent(address) +
      '&pwd=' +
      encodeURIComponent(password)
  );
  if (!regResp || regResp.status !== 'ok' || !regResp.val || !regResp.val.loginKey) {
    throw new Error('Naruto registration failed: ' + JSON.stringify(regResp).slice(0, 200));
  }

  const loginKey = regResp.val.loginKey;
  const decoded = jwt.decode(loginKey);
  if (!decoded) {
    throw new Error('loginKey returned is not a valid JWT');
  }

  logger.info(
    'Tempmail: Naruto account created — playerId=' +
      regResp.val.id +
      ' nickname=' +
      decoded.payload.nickname +
      ' expires in ' +
      Math.round(decoded.expiresInSeconds / 60) +
      'min'
  );

  return {
    tempmail: {
      address: address,
      password: password,
      mailtmToken: mailtmToken,
      accountId: regResp.val.id
    },
    game: {
      playerId: regResp.val.id,
      nickname: decoded.payload.nickname,
      loginKey: loginKey,
      jwtDecoded: decoded,
      registeredAt: Date.now(),
      expiresAt: decoded.exp ? decoded.exp.getTime() : Date.now() + 7200 * 1000
    }
  };
}

/**
 * Performs login with email+password (renews JWT before expiry).
 * @param {string} email
 * @param {string} password
 * @param {boolean} [remember] — remember=1 extends the JWT (untested, default false = 2h)
 * @returns {Promise<{loginKey:string, jwtDecoded:Object, playerId:string, nickname:string}>}
 */
async function login(email, password, remember) {
  remember = remember ? 1 : 0;
  const resp = await _httpGetJsonp(
    'https://passport.oasgames.com/?m=login&email=' +
      encodeURIComponent(email) +
      '&pwd=' +
      encodeURIComponent(password) +
      '&remember=' +
      remember +
      '&callback=jq_login'
  );
  if (!resp || resp.status !== 'ok' || !resp.val || !resp.val.loginKey) {
    throw new Error('Login failed: ' + JSON.stringify(resp).slice(0, 200));
  }
  const decoded = jwt.decode(resp.val.loginKey);
  if (!decoded) throw new Error('Login loginKey is not a valid JWT');
  logger.info(
    'Tempmail: login OK — playerId=' +
      resp.val.id +
      ' expires in ' +
      Math.round(decoded.expiresInSeconds / 60) +
      'min'
  );
  return {
    loginKey: resp.val.loginKey,
    jwtDecoded: decoded,
    playerId: resp.val.id,
    nickname: decoded.payload.nickname
  };
}

/**
 * Lists recommended servers for a playerId.
 * @param {string} playerId
 * @param {string} [gamecode] — narutopl | narutoen | narutobr | narutode | narutoes | narutofr
 * @returns {Promise<Array<{server_sid:number, server_prex:string, server_name:string, fullname:string, url:string}>>}
 */
async function getRecommendedServers(playerId, gamecode) {
  gamecode = gamecode || 'narutopl';
  const resp = await _httpGetJsonp(
    'https://odp3.oasgames.com/api/game/get-user-servers?uid=' +
      encodeURIComponent(playerId) +
      '&gamecode=' +
      encodeURIComponent(gamecode) +
      '&callback=jq_servers'
  );
  if (!resp || !Array.isArray(resp.recommand)) return [];
  return resp.recommand.map(function (s) {
    return {
      server_sid: s.server_sid,
      server_prex: s.server_prex,
      server_name: s.server_name,
      fullname: s.fullname,
      url: (s.url || '').replace(/^\/\//, 'https://')
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function _getMailTmDomain() {
  const resp = await _httpGetJson(MAIL_TM_DOMAINS);
  const members = resp && resp['hydra:member'];
  if (!members || !members.length) throw new Error('mail.tm: no domains available');
  return members[0].domain;
}

async function _mailTmCreateAccount(address, password) {
  return _httpPostJson(MAIL_TM_ACCOUNTS, { address: address, password: password });
}

async function _mailTmGetToken(address, password) {
  const resp = await _httpPostJson(MAIL_TM_TOKEN, { address: address, password: password });
  if (!resp || !resp.token) throw new Error('mail.tm: token not returned');
  return resp.token;
}

function _generatePassword() {
  // Strong random password (mail.tm requires ≥8 chars with variety)
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*'];
  let out = '';
  for (let i = 0; i < 16; i++) {
    const set = sets[i % sets.length];
    out += set[Math.floor(Math.random() * set.length)];
  }
  return out
    .split('')
    .sort(function () {
      return Math.random() - 0.5;
    })
    .join('');
}

// HTTP GET returning plain JSON (passport register/checkname, mail.tm)
async function _httpGetJson(url, authHeader) {
  const https = require('https');
  return new Promise(function (resolve, reject) {
    const headers = { 'User-Agent': 'Shinobi-Launcher/4.9' };
    if (authHeader) headers.Authorization = authHeader;
    const req = https.get(url, { headers: headers, timeout: 15000 }, function (res) {
      let data = '';
      res.on('data', function (c) {
        data += c;
      });
      res.on('end', function () {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse failed: ' + e.message + ' | body: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy(new Error('timeout'));
    });
  });
}

// HTTP POST returning JSON (mail.tm accounts/token)
async function _httpPostJson(url, body) {
  const https = require('https');
  const u = new (require('url').URL)(url);
  const payload = JSON.stringify(body);
  return new Promise(function (resolve, reject) {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Shinobi-Launcher/4.9'
        },
        timeout: 15000
      },
      function (res) {
        let data = '';
        res.on('data', function (c) {
          data += c;
        });
        res.on('end', function () {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('JSON parse failed: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

// HTTP GET that returns JSON with JSONP wrapper (passport login, odp3)
async function _httpGetJsonp(url) {
  const https = require('https');
  return new Promise(function (resolve, reject) {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Shinobi-Launcher/4.9' }, timeout: 15000 },
      function (res) {
        let data = '';
        res.on('data', function (c) {
          data += c;
        });
        res.on('end', function () {
          // Strip JSONP wrapper: /**/jq_xxx({...});
          const m = data.match(/\/\*\*\/[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
          if (m) {
            try {
              resolve(JSON.parse(m[1]));
            } catch (e) {
              reject(new Error('JSONP parse failed: ' + e.message));
            }
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('No JSONP wrapper and invalid JSON: ' + data.slice(0, 200)));
            }
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy(new Error('timeout'));
    });
  });
}

module.exports = {
  createNarutoAccount: createNarutoAccount,
  login: login,
  getRecommendedServers: getRecommendedServers,
  // exposed for tests
  _generatePassword: _generatePassword,
  _decode: jwt.decode
};
