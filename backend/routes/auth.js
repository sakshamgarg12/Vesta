/**
 * Vesta — Authentication routes (Google Sign-In).
 *
 *   GET  /api/auth/config    — tiny, public JSON: { client_id } used by the
 *                              frontend to render the Google button. No secret.
 *   POST /api/auth/google    — body: { credential: <google_id_token> }.
 *                              Verifies the ID token with Google, upserts the
 *                              users row, sets the session cookie.
 *   GET  /api/auth/me        — current user (or 401 if logged out).
 *   POST /api/auth/logout    — clears the session cookie.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');

const { pool } = require('../db');
const {
  issueSession,
  clearSession,
  roleForEmail,
} = require('../middleware/auth');

const router = express.Router();

/* ------------------------------------------------------------------
 * Rate limiting — login is the single most brute-forceable endpoint.
 * 30 attempts / 10 min / IP is plenty for real users and brick-wall
 * for scripts. We return a JSON error so the client can surface it.
 * ------------------------------------------------------------------ */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

/* ------------------------------------------------------------------
 * GET /api/auth/config
 * Tells the browser which Google Client ID to render the button with,
 * and whether auth is even configured on this server.
 * ------------------------------------------------------------------ */
router.get('/config', (_req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  res.json({
    configured: !!clientId,
    client_id: clientId || null,
  });
});

/* ------------------------------------------------------------------
 * POST /api/auth/google
 * Body: { credential: "<google_id_token>" }
 * ------------------------------------------------------------------ */
router.post('/google', loginLimiter, async (req, res, next) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    return res.status(503).json({
      error: 'Google Sign-In is not configured on this server. Please contact the site owner.',
    });
  }

  const idToken = String(req.body?.credential || '').trim();
  if (!idToken) {
    return res.status(400).json({ error: 'Missing Google credential.' });
  }

  try {
    // 1) Verify the ID token against Google's JWKs + our client ID.
    const verifier = new OAuth2Client(clientId);
    const ticket = await verifier.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google credential.' });
    }
    if (!payload.email_verified) {
      return res.status(401).json({
        error: 'Your Google account email is not verified. Please verify it and try again.',
      });
    }

    // 2) Upsert the users row.
    const email  = String(payload.email).toLowerCase();
    const role   = roleForEmail(email);
    const name   = payload.name || null;
    const pic    = payload.picture || null;
    const googleSub = payload.sub;

    // Look up by google_sub first (stable); fall back to email (in case the
    // user was created from a different sign-in method in future).
    const [found] = await pool.query(
      'SELECT * FROM users WHERE google_sub = ? OR email = ? LIMIT 1',
      [googleSub, email],
    );

    let userRow;
    if (found.length === 0) {
      const [ins] = await pool.query(
        `INSERT INTO users (google_sub, email, email_verified, name, picture_url, role, last_login_at)
         VALUES (?, ?, 1, ?, ?, ?, NOW())`,
        [googleSub, email, name, pic, role],
      );
      const [[created]] = await pool.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
      userRow = created;
    } else {
      userRow = found[0];
      // Keep the profile + role in sync with what Google told us and what
      // the ADMIN_EMAILS list says right now.
      await pool.query(
        `UPDATE users
            SET google_sub     = ?,
                email          = ?,
                email_verified = 1,
                name           = ?,
                picture_url    = ?,
                role           = ?,
                last_login_at  = NOW()
          WHERE id = ?`,
        [googleSub, email, name, pic, role, userRow.id],
      );
      userRow.google_sub  = googleSub;
      userRow.email       = email;
      userRow.name        = name;
      userRow.picture_url = pic;
      userRow.role        = role;
    }

    // 3) Issue our own session cookie.
    issueSession(res, userRow);

    return res.json({
      success: true,
      user: {
        id:      userRow.id,
        email:   userRow.email,
        name:    userRow.name,
        picture: userRow.picture_url,
        role:    userRow.role,
      },
    });
  } catch (err) {
    if (err && err.message && /Wrong recipient|audience|Token used too late|Invalid token signature/i.test(err.message)) {
      return res.status(401).json({ error: 'Invalid Google credential.' });
    }
    return next(err);
  }
});

/* ------------------------------------------------------------------
 * GET /api/auth/me  — current user from session cookie
 * ------------------------------------------------------------------ */
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  res.json({ user: req.user });
});

/* ------------------------------------------------------------------
 * POST /api/auth/logout
 * ------------------------------------------------------------------ */
router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ success: true });
});

module.exports = router;
