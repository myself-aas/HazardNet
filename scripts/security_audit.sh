#!/bin/bash
# HazardNet Security Audit Script
# Comprehensive security checks for production deployment

set -e

echo "=========================================="
echo "HazardNet Security Audit"
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="
echo ""

AUDIT_PASSED=true

# ==========================================
# 1. Dependency Vulnerabilities
# ==========================================
echo "🔍 Checking dependency vulnerabilities..."

if node scripts/npm-audit-ci.mjs > /dev/null 2>&1; then
  echo "  ✅ No high/critical vulnerabilities outside audit-exceptions.json"
else
  echo "  ❌ High or critical vulnerabilities found (outside audit-exceptions.json)!"
  node scripts/npm-audit-ci.mjs
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 2. Environment Variables
# ==========================================
echo "🔐 Verifying environment variables..."

REQUIRED_PRODUCTION_VARS=(
  "BACKEND_API_KEY"
  "FIREBASE_PROJECT_ID"
  "NODE_ENV"
)

missing_vars=()
for var in "${REQUIRED_PRODUCTION_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -eq 0 ]; then
  echo "  ✅ All required environment variables set"
else
  echo "  ❌ Missing environment variables:"
  printf '     - %s\n' "${missing_vars[@]}"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 3. CSP Configuration
# ==========================================
echo "🛡️ Checking Content Security Policy..."

if [ "$CSP_ENFORCE" = "true" ]; then
  echo "  ✅ CSP enforcement enabled"
else
  echo "  ⚠️ CSP in report-only mode (set CSP_ENFORCE=true for production)"
fi

# Check if backend has CSP middleware
if grep -q "contentSecurityPolicy" backend/server.js backend/middleware/securityHeaders.js 2>/dev/null; then
  echo "  ✅ CSP middleware configured"
else
  echo "  ❌ CSP middleware not found"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 4. API Key Security
# ==========================================
echo "🔑 Verifying API key security..."

# Check API key length (should be >= 32 chars)
if [ -n "$BACKEND_API_KEY" ]; then
  KEY_LENGTH=${#BACKEND_API_KEY}
  if [ $KEY_LENGTH -ge 32 ]; then
    echo "  ✅ API key length adequate ($KEY_LENGTH chars)"
  else
    echo "  ❌ API key too short ($KEY_LENGTH chars, minimum 32)"
    AUDIT_PASSED=false
  fi
else
  echo "  ⚠️ BACKEND_API_KEY not set (skipping length check)"
fi

# Check for timing-safe comparison in code
if grep -q "crypto.timingSafeEqual" backend/utils/apiKeyAuth.js 2>/dev/null; then
  echo "  ✅ Timing-safe API key comparison implemented"
else
  echo "  ❌ Timing-safe comparison not found"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 5. Rate Limiting
# ==========================================
echo "⏱️ Verifying rate limiting configuration..."

if grep -q "express-rate-limit" backend/server.js package.json 2>/dev/null; then
  echo "  ✅ Rate limiting middleware installed"
  
  # Check for rate limiter on critical endpoints
  if grep -q "predictLimiter\|apiLimiter" backend/server.js 2>/dev/null; then
    echo "  ✅ Rate limiters applied to critical endpoints"
  else
    echo "  ⚠️ Rate limiters not found on endpoints"
  fi
else
  echo "  ❌ Rate limiting not configured"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 6. CORS Configuration
# ==========================================
echo "🌐 Checking CORS configuration..."

if grep -q "FRONTEND_ORIGIN" backend/server.js 2>/dev/null; then
  echo "  ✅ CORS origin allowlist configured"
  
  if [ -n "$FRONTEND_ORIGIN" ]; then
    echo "  ✅ FRONTEND_ORIGIN set: $FRONTEND_ORIGIN"
  else
    echo "  ⚠️ FRONTEND_ORIGIN not set (will use fallback)"
  fi
else
  echo "  ❌ CORS configuration not found"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 7. Sensitive File Protection
# ==========================================
echo "🚫 Checking sensitive file protection..."

SENSITIVE_PATTERNS=(
  "/Models/"
  "/normalization_stats.json"
  "/.env"
  "/package.json"
)

if grep -q "blockSensitivePaths" backend/server.js backend/middleware/securityHeaders.js 2>/dev/null; then
  echo "  ✅ Sensitive path blocking middleware configured"
else
  echo "  ❌ Sensitive path protection not found"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 8. Security Headers
# ==========================================
echo "📋 Verifying security headers..."

REQUIRED_HEADERS=(
  "X-Content-Type-Options"
  "X-Frame-Options"
  "X-XSS-Protection"
  "Strict-Transport-Security"
)

if grep -q "helmet\|securityHeaders" backend/server.js package.json 2>/dev/null; then
  echo "  ✅ Security headers middleware configured"
else
  echo "  ❌ Security headers not configured"
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 9. Input Validation
# ==========================================
echo "✔️ Checking input validation..."

if grep -q "validateTensor\|validator\|joi\|yup" backend/routes/*.js backend/middleware/*.js 2>/dev/null; then
  echo "  ✅ Input validation middleware found"
else
  echo "  ⚠️ Input validation not detected (manual review required)"
fi
echo ""

# ==========================================
# 10. Secrets in Code
# ==========================================
echo "🔍 Scanning for hardcoded secrets..."

# Delegates to the canonical scanner (scripts/check-secrets.sh), which is the
# gate CI runs. It knows the two public-by-design shapes — the Firebase web
# API key (a browser-shipped identifier, not a secret) — and therefore does
# not false-positive on frontend/src/lib/config.ts and firebase-applet-config.json.
if bash scripts/check-secrets.sh > /dev/null 2>&1; then
  echo "  ✅ No hardcoded secrets detected (scripts/check-secrets.sh)"
else
  echo "  ❌ Potential secrets found in code!"
  bash scripts/check-secrets.sh
  AUDIT_PASSED=false
fi
echo ""

# ==========================================
# 11. TLS/SSL Configuration
# ==========================================
echo "🔒 Checking TLS/SSL configuration..."

if [ "$NODE_ENV" = "production" ]; then
  if grep -q "HSTS\|Strict-Transport-Security" backend/server.js backend/middleware/*.js 2>/dev/null; then
    echo "  ✅ HSTS configured for production"
  else
    echo "  ⚠️ HSTS not found (Vercel handles this automatically)"
  fi
else
  echo "  ⚠️ Not in production mode (TLS checks skipped)"
fi
echo ""

# ==========================================
# 12. Authentication Security
# ==========================================
echo "👤 Verifying authentication security..."

if grep -q '"firebase"' package.json 2>/dev/null; then
  echo "  ✅ Firebase authentication configured"
else
  echo "  ⚠️ Authentication library not detected"
fi
echo ""

# ==========================================
# Final Report
# ==========================================
echo "=========================================="
if [ "$AUDIT_PASSED" = true ]; then
  echo "✅ Security Audit PASSED"
  echo "=========================================="
  echo ""
  echo "All critical security checks passed."
  echo "Review warnings above and address before production deployment."
  exit 0
else
  echo "❌ Security Audit FAILED"
  echo "=========================================="
  echo ""
  echo "Critical security issues detected!"
  echo "Address all failures above before deploying to production."
  exit 1
fi
