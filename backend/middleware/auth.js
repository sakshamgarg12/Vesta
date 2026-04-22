/**
 * Vesta — Session + authorization helpers.
 *
 * The site uses Google Identity Services on the client. The flow:
 *
 *   1. Browser gets a Google ID token (JWT signed by Google).
 *   2. Client POSTs it to /api/auth/google.
 *   3. Server verifies the ID token, upserts a `users` row, and issues
 *      our OWN short session JWT in an httpOnly cookie ('vesta_sid').
 *   4. Every subsequent request carries the cookie. `attachUser` decodes it
 *      and hangs the user onto req.user.
 *
 * The admin check is deliberately strict: the email must
 *   (a) appear in the ADMIN_EMAILS allowlist in .env, AND
 *   (b) contain the substring "admin".
 * Both conditions must be true, so an accidental entry in the allowlist
 * (or a regular user on the list) can never become admin.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SESSION_COOKIE = 'vesta_sid';
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Returns the normalized list of admin emails from .env. */
function adminAllowlist() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Decide the role for a (newly logged-in) user based on their email. */
function roleForEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return 'customer';
  const inAllowlist = adminAllowlist().includes(e);
  const containsAdmin = e.includes('admin');
  return (inAllowlist && containsAdmin) ? 'admin' : 'customer';
}

/** Read the server-side session secret; throw early if it's missing. */
function sessionSecret() {
  const s = (process.env.SESSION_SECRET || '').trim();
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET is not set (or too short). Add it to backend/.env — any long random string.',
    );
  }
  return s;
}

/** Sign a session JWT and set it on the response as an httpOnly cookie. */
function issueSession(res, user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || null,
    picture: user.picture_url || null,
    role: user.role || 'customer',
  };
  const token = jwt.sign(payload, sessionSecret(), {
    expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
  return token;
}

/** Wipe the session cookie. */
function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Express middleware: if the request has a valid session cookie, attach
 * `req.user = { id, email, name, picture, role }`. Otherwise leave
 * `req.user = null`. Never rejects — use `requireLogin` for that.
 */
function attachUser(req, _res, next) {
  req.user = null;
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (!token) return next();
    const payload = jwt.verify(token, sessionSecret());
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture: payload.picture || null,
      role: payload.role || 'customer',
    };
  } catch (_) {
    // Bad / expired cookie — treat as logged out. The browser will clean up
    // on the next /api/auth/me call that returns 401.
    req.user = null;
  }
  next();
}

/** Require any logged-in user. */
function requireLogin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  next();
}

/**
 * Require an admin user. Both conditions must hold:
 *   - req.user.role === 'admin'   (set at login time from ADMIN_EMAILS allowlist)
 *   - email contains "admin"      (defence-in-depth, in case allowlist is misedited)
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  const email = String(req.user.email || '').toLowerCase();
  if (req.user.role !== 'admin' || !email.includes('admin')) {
    return res.status(403).json({ error: 'This area is for Vesta admins only.' });
  }
  next();
}

/** Generate a fresh, strong random value (helper for tooling / tests). */
function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  adminAllowlist,
  roleForEmail,
  issueSession,
  clearSession,
  attachUser,
  requireLogin,
  requireAdmin,
  randomSecret,
};
