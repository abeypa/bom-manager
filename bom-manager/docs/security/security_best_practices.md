# BOM Manager - Security Best Practices

## Overview
This document outlines security best practices for the BOM Manager application deployed on Supabase and Cloudflare Pages.

## Supabase Security Considerations

### 1. Database Security
- **Row Level Security (RLS)**: All tables have RLS enabled with authenticated-only policies
- **Principle of Least Privilege**: Users only have access to what they need (in this case, all authenticated users share the same data)
- **Regular Backups**: Supabase provides automatic daily backups on free tier
- **Database Auditing**: Use Supabase logs to monitor database access

### 2. Authentication Security
- **Signup Disabled**: Prevents unauthorized user registration
- **Email/Password Only**: Simplified auth surface area
- **Password Policies**: Enforce minimum 8-character passwords
- **Session Management**: 7-day session timeout with refresh token rotation

### 3. Storage Security
- **Private Buckets**: "drawings" bucket is private (not public)
- **RLS on Storage**: Authenticated users only can access storage
- **File Validation**: Validate file types and sizes in application code
- **Virus Scanning**: Consider implementing client-side virus scanning for uploads

### 4. API Security
- **Anon Key Exposure**: Safe in frontend - only works with RLS policies
- **Service Role Key**: NEVER expose in frontend - use only in server-side contexts
- **Rate Limiting**: Supabase provides built-in rate limiting
- **CORS Configuration**: Configured to allow only your Cloudflare Pages domain

## Environment Variable Security

### 1. Frontend Environment Variables
```env
# .env.production (for Cloudflare Pages)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...your-anon-key

# .env.local (for local development - DO NOT COMMIT)
VITE_SUPABASE_URL=http://localhost:54321  # For local Supabase
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...local-anon-key
```

### 2. Security Rules for Environment Variables
- **Never commit `.env` files**: Already in `.gitignore`
- **Use different keys per environment**: Development, staging, production
- **Rotate keys regularly**: Every 90 days for production
- **Monitor key usage**: Check Supabase logs for unusual patterns

### 3. Cloudflare Pages Environment Variables
1. Set in Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables
2. Separate for production and preview deployments
3. Use secret redaction in build logs

## API Key Management

### 1. Supabase Keys
| Key Type | Purpose | Exposure | Rotation |
|----------|---------|----------|----------|
| **anon/public** | Frontend client | Public (safe) | 90 days |
| **service_role** | Backend/admin | Server-only | 90 days |
| **JWT Secret** | Token signing | Supabase only | 90 days |

### 2. Key Rotation Procedure
```bash
# 1. Generate new keys in Supabase Dashboard
# Settings → API → Generate new keys

# 2. Update environment variables
# - Cloudflare Pages: Update VITE_SUPABASE_ANON_KEY
# - Any backend services: Update service_role key

# 3. Deploy updates
# - Frontend: Redeploy Cloudflare Pages
# - Backend: Restart services with new keys

# 4. Monitor for issues
# - Check application logs
# - Verify authentication works
# - Monitor error rates

# 5. Revoke old keys (after 7 days grace period)
# Supabase Dashboard → Settings → API → Revoke old keys
```

### 3. Emergency Key Revocation
If keys are compromised:
1. Immediately generate new keys in Supabase dashboard
2. Update all environment variables
3. Deploy updated applications
4. Revoke compromised keys
5. Investigate breach source

## Network Security

### 1. CORS Configuration
- **Allowed Origins**: Only your Cloudflare Pages domain
- **Allowed Methods**: GET, POST, PUT, DELETE, PATCH
- **Allowed Headers**: Content-Type, Authorization
- **Credentials**: Include cookies in requests

### 2. Firewall Rules
- **Supabase Network Restrictions**: Allow only specific IP ranges if needed
- **Cloudflare WAF**: Enable Web Application Firewall rules
- **DDoS Protection**: Cloudflare provides automatic DDoS mitigation

## Data Security

### 1. Sensitive Data Handling
- **No PII in Database**: Avoid storing personally identifiable information
- **Encryption at Rest**: Supabase provides automatic encryption
- **Encryption in Transit**: TLS/SSL for all connections
- **File Encryption**: Consider encrypting sensitive files before upload

### 2. Data Retention
- **Audit Logs**: Keep for 90 days minimum
- **User Data**: Delete when users leave organization
- **Backup Retention**: Supabase keeps 7 days of backups (upgrade for longer)

### 3. Data Export/Import Security
- **Export Controls**: Only allow authenticated exports
- **Import Validation**: Validate all imported data
- **File Scanning**: Scan uploaded files for malware

## Application Security

### 1. Frontend Security
- **Input Validation**: Validate all user inputs
- **XSS Protection**: React provides built-in XSS protection
- **CSRF Protection**: Supabase handles CSRF protection
- **Content Security Policy**: Implement CSP headers

### 2. Dependency Security
- **Regular Updates**: Update npm dependencies monthly
- **Security Audits**: Run `npm audit` regularly
- **Dependency Scanning**: Use GitHub Dependabot or similar

### 3. Error Handling
- **Generic Error Messages**: Don't leak system details
- **Logging**: Log errors without sensitive data
- **Monitoring**: Set up error monitoring (Sentry, etc.)

## Compliance Considerations

### 1. GDPR Compliance
- **Data Minimization**: Only collect necessary data
- **Right to Erasure**: Implement user data deletion
- **Data Processing Agreement**: Supabase provides DPA

### 2. Industry Standards
- **OWASP Top 10**: Address common web vulnerabilities
- **NIST Framework**: Follow cybersecurity framework
- **ISO 27001**: Consider certification if needed

## Monitoring and Incident Response

### 1. Monitoring Setup
- **Supabase Dashboard**: Monitor database performance
- **Auth Logs**: Review authentication attempts
- **Storage Metrics**: Monitor file upload/download patterns
- **Application Logs**: Use Cloudflare Analytics

### 2. Incident Response Plan
1. **Detection**: Monitor for unusual activity
2. **Containment**: Isolate affected systems
3. **Eradication**: Remove threat sources
4. **Recovery**: Restore from backups if needed
5. **Post-Incident**: Analyze and improve defenses

### 3. Regular Security Audits
- **Monthly**: Review user accounts and permissions
- **Quarterly**: Security dependency audit
- **Bi-annually**: Full security assessment
- **Annually**: Penetration testing

## Training and Awareness

### 1. User Training
- **Password Security**: Teach strong password practices
- **Phishing Awareness**: Recognize phishing attempts
- **Data Handling**: Proper handling of sensitive data

### 2. Administrator Training
- **Key Management**: Secure handling of API keys
- **User Management**: Proper user provisioning/deprovisioning
- **Incident Response**: How to handle security incidents

## Disaster Recovery

### 1. Backup Strategy
- **Database**: Supabase automatic daily backups
- **Storage**: Manual backup of important files
- **Code**: GitHub repository with version history

### 2. Recovery Procedures
- **Database Recovery**: Restore from Supabase backup
- **Application Recovery**: Redeploy from GitHub
- **Data Recovery**: Restore from storage backups

### 3. Business Continuity
- **Redundancy**: Multiple deployment regions if needed
- **Failover**: Manual failover procedures
- **Communication Plan**: Notify users of downtime
