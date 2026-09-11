/**
 * Security Headers Middleware
 * Enforces security best practices via HTTP headers
 */
const helmet = require('helmet');

/**
 * Get Content Security Policy configuration
 * @param {boolean} enforce - Whether to enforce CSP (true) or report-only (false)
 * @returns {Object} CSP configuration
 */
function getCspConfig(enforce = false) {
  const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for Vite dev mode and some React patterns
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://apis.google.com',
      'https://accounts.google.com',
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for styled-components and Tailwind
      'https://fonts.googleapis.com',
    ],
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com',
      'data:',
    ],
    imgSrc: [
      "'self'",
      'data:',
      'blob:',
      'https://firebasestorage.googleapis.com',
      'https://*.supabase.co',
      'https://api.mapbox.com',
      'https://tiles.mapbox.com',
      'https://events.mapbox.com',
      'https://lh3.googleusercontent.com', // Google profile pictures
      'https://avatars.githubusercontent.com', // GitHub avatars
    ],
    connectSrc: [
      "'self'",
      'https://firestore.googleapis.com',
      'https://*.supabase.co',
      'https://api.mapbox.com',
      'https://events.mapbox.com',
      'https://generativelanguage.googleapis.com', // Gemini API
      'https://www.google-analytics.com',
    ],
    frameSrc: [
      "'self'",
      'https://accounts.google.com',
      'https://www.facebook.com',
    ],
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
  };

  return {
    contentSecurityPolicy: {
      directives: cspDirectives,
      reportOnly: !enforce,
    },
  };
}

/**
 * Security headers middleware factory
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function createSecurityMiddleware(options = {}) {
  const {
    enforceCSP = process.env.CSP_ENFORCE === 'true',
    enableHSTS = process.env.NODE_ENV === 'production',
    enableNonce = false, // Enable for stricter CSP
  } = options;

  const helmetConfig = {
    ...getCspConfig(enforceCSP),
    
    // Strict Transport Security (HSTS)
    hsts: enableHSTS ? {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    } : false,
    
    // Prevent clickjacking
    frameguard: {
      action: 'deny',
    },
    
    // Disable X-Powered-By header
    hidePoweredBy: true,
    
    // Prevent MIME sniffing
    noSniff: true,
    
    // Enable XSS filter
    xssFilter: true,
    
    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
    
    // Permissions Policy (formerly Feature Policy)
    permissionsPolicy: {
      features: {
        geolocation: ['self'],
        microphone: ['none'],
        camera: ['none'],
        payment: ['none'],
        usb: ['none'],
        magnetometer: ['none'],
        gyroscope: ['none'],
        accelerometer: ['none'],
      },
    },
  };

  const middleware = helmet(helmetConfig);

  // Wrapper to add custom headers
  return (req, res, next) => {
    // Add CSP report-only header if not enforcing
    if (!enforceCSP) {
      res.setHeader(
        'Content-Security-Policy-Report-Only',
        Object.entries(getCspConfig(false).contentSecurityPolicy.directives)
          .map(([key, values]) => {
            const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${directive} ${Array.isArray(values) ? values.join(' ') : ''}`;
          })
          .join('; ')
      );
    }
    
    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Remove server identification
    res.removeHeader('X-Powered-By');
    
    // Apply helmet middleware
    middleware(req, res, next);
  };
}

/**
 * Block access to sensitive files/directories
 */
function blockSensitivePaths(req, res, next) {
  const blockedPaths = [
    '/Models/',
    '/hazardnet_fp32.tflite',
    '/normalization_stats.json',
    '/labels.json',
    '/.env',
    '/package.json',
    '/package-lock.json',
    '/node_modules/',
    '/.git/',
  ];

  const path = req.path.toLowerCase();
  const isBlocked = blockedPaths.some(blocked => path.includes(blocked.toLowerCase()));

  if (isBlocked) {
    return res.status(403).json({
      error: 'Access forbidden',
      message: 'This resource is not publicly accessible',
    });
  }

  next();
}

/**
 * Sanitize error responses to prevent information leakage
 */
function sanitizeErrors(err, req, res, next) {
  // Log full error internally
  console.error('Error:', err);

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Sanitize error message
  let message = 'An error occurred';
  if (statusCode < 500) {
    // Client errors: safe to expose message
    message = err.message || message;
  } else if (process.env.NODE_ENV !== 'production') {
    // Development: show full error
    message = err.message;
  }

  // Send sanitized response
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack,
      details: err.details,
    }),
  });
}

module.exports = {
  createSecurityMiddleware,
  blockSensitivePaths,
  sanitizeErrors,
  getCspConfig,
};
