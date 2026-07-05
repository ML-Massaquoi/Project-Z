#!/bin/bash
# ============================================
# Project Z - Generate Self-Signed SSL Certificates
# ============================================
# For development/test use only.
# In production, use Let's Encrypt (certbot) or your CA.
#
# Usage: bash infrastructure/scripts/generate-certs.sh
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_DIR/nginx/ssl"

mkdir -p "$SSL_DIR"

# Generate CA key and cert (for development only)
openssl genrsa -out "$SSL_DIR/ca-key.pem" 4096 2>/dev/null

openssl req -x509 -new -nodes \
  -key "$SSL_DIR/ca-key.pem" \
  -sha256 -days 3650 \
  -out "$SSL_DIR/ca.pem" \
  -subj "/C=SL/O=Project Z/CN=Project Z Development CA"

# Generate server key
openssl genrsa -out "$SSL_DIR/key.pem" 2048 2>/dev/null

# Generate CSR
openssl req -new \
  -key "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/csr.pem" \
  -subj "/C=SL/O=Project Z/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1"

# Generate self-signed cert (valid 365 days)
openssl x509 -req \
  -in "$SSL_DIR/csr.pem" \
  -CA "$SSL_DIR/ca.pem" \
  -CAkey "$SSL_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$SSL_DIR/cert.pem" \
  -days 365 \
  -sha256 \
  -extfile <(echo "subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1")

# Set permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

# Cleanup
rm -f "$SSL_DIR/csr.pem" "$SSL_DIR/ca-key.pem" "$SSL_DIR/ca.pem" "$SSL_DIR/ca.srl"

echo "=== SSL certificates generated ==="
echo "  Cert: $SSL_DIR/cert.pem"
echo "  Key:  $SSL_DIR/key.pem"
echo ""
echo "For production: replace with Let's Encrypt certs"
echo "  certbot certonly --nginx -d your-domain.com"
