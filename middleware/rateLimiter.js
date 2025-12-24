// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// ============================================
// AUTH LIMITER - For login, registration, password reset
// ============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
  // Use default IP-based keyGenerator (handles IPv6 correctly)
  // Handler for when limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many authentication attempts from this device. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000), // seconds until reset
    });
  }
});

// ============================================
// TRANSACTION LIMITER - For wallet operations
// ============================================
const transactionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 transactions per minute
  message: {
    message: 'Transaction rate limit exceeded. Please wait before making another transaction.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Key by user ID (from JWT) instead of IP for authenticated routes
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket && req.socket.remoteAddress || 'unknown');
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'You are sending transactions too quickly. Please wait a moment.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  }
});

// ============================================
// STRICT LIMITER - For highly sensitive operations (OTP requests)
// ============================================
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    message: 'Too many OTP requests. Please try again after 1 hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req) => {
    // Rate limit by email for OTP requests; fallback to forwarded IP or socket address
    return req.body.smail || (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket && req.socket.remoteAddress || 'unknown');
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many OTP requests from this email. Please try again in 1 hour.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  }
});

// ============================================
// API GENERAL LIMITER - For all other API routes
// ============================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: {
    message: 'Too many requests. Please slow down.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket && req.socket.remoteAddress || 'unknown');
  },
  handler: (req, res) => {
    res.status(429).json({
      message: 'API rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  }
});

// ============================================
// VENDOR MANAGEMENT LIMITER - For finance core operations
// ============================================
const vendorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute (higher for bulk operations)
  message: {
    message: 'Too many vendor management requests. Please wait.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id.toString() : (req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket && req.socket.remoteAddress || 'unknown');
  }
});

module.exports = {
  authLimiter,
  transactionLimiter,
  strictLimiter,
  apiLimiter,
  vendorLimiter
};