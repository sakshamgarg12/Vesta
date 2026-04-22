const express = require('express');
const { pool } = require('../db');

const router = express.Router();

/**
 * POST /api/queries
 *   Body: { name, email, phone, subject, message }
 *   Saves a customer enquiry / contact-form submission.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, email, phone = null, subject = null, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email and message are required' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (String(message).length < 5) {
      return res.status(400).json({ error: 'Message is too short' });
    }

    const [result] = await pool.query(
      `INSERT INTO customer_queries (name, email, phone, subject, message)
       VALUES (?,?,?,?,?)`,
      [name, email, phone, subject, message],
    );

    res.status(201).json({
      success: true,
      id: result.insertId,
      message: 'Thank you! Our team will contact you within 24 hours.',
    });
  } catch (err) { next(err); }
});

module.exports = router;
