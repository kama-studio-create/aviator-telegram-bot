# 🔐 JWT SECRET CONFIGURATION GUIDE

## What is JWT_SECRET?

The JWT_SECRET is a cryptographic key used to sign and verify JSON Web Tokens (JWT) for your admin authentication system. It must be:

- **Long and random** (at least 64 characters)
- **Unique to your application**
- **Kept absolutely secret**

## How to Generate a Secure JWT Secret

### Method 1: Using Node.js (Recommended)
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Method 2: Using OpenSSL
```bash
openssl rand -hex 64
```

### Method 3: Online Generator
Visit: https://generate-secret.vercel.app/64

## Example JWT Secrets

**Good Example (128 characters):**
```
JWT_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456789012345678901234567890abcdef123456789012345678901234567890ab
```

**Bad Examples:**
```
JWT_SECRET=secret123           # Too short
JWT_SECRET=password           # Predictable
JWT_SECRET=myapp2023         # Not random enough
```

## Current Configuration

Your `.env` files have been updated with a sample JWT secret. 

**For production deployment:**
1. Generate a new unique secret using one of the methods above
2. Replace the sample secret in both `.env` and your Render.com environment variables
3. Never share or commit the real secret to version control

## Security Notes

- ⚠️  **Never use the example secret in production**
- 🔒 **Generate a unique secret for each environment**
- 📝 **Store securely and don't share**
- 🔄 **Rotate periodically for maximum security**

## For Render.com Deployment

When deploying to Render.com:

1. Generate a new JWT secret
2. Add it as an environment variable in your Render dashboard:
   - Key: `JWT_SECRET`
   - Value: Your generated secret

This keeps your secret secure and separate from your code.
