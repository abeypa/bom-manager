# BOM Manager - Scripts Directory

This directory contains administrative scripts for managing the BOM Manager application.

## Scripts

### `create_user.sh` - User Management Script
A bash script for managing users via the Supabase Management API.

#### Features:
- Create new users with email/password
- List all existing users
- Reset user passwords
- Interactive mode for easy administration

#### Requirements:
- `curl` - For making HTTP requests
- `jq` - For parsing JSON responses
- `openssl` - For generating random passwords (optional)

#### Setup:
1. Get your Supabase service_role key:
   - Go to Supabase Dashboard → Settings → API
   - Copy the `service_role` key (keep this secure!)

2. Set environment variables:
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
   ```

#### Usage:
```bash
# Create a new user
./create_user.sh create user@example.com TempPass123 engineer

# List all users
./create_user.sh list

# Reset user password
./create_user.sh reset user@example.com

# Interactive mode
./create_user.sh interactive
```

#### Security Notes:
- The service_role key bypasses RLS policies - keep it secure!
- Never commit this key to version control
- Use temporary passwords that users must change on first login
- Consider using a password manager to generate strong passwords

### `create_user.py` (Alternative Python Version)
A Python alternative with the same functionality.

## Best Practices for User Management

### 1. User Creation
- Use temporary passwords that expire on first login
- Assign appropriate roles based on user responsibilities
- Document all user accounts in a secure location

### 2. Password Policy
- Minimum 8 characters
- Mix of uppercase, lowercase, numbers, and symbols
- No dictionary words or common patterns
- Change every 90 days

### 3. Regular Maintenance
- Review user list monthly
- Disable inactive accounts
- Remove former employees promptly
- Audit login attempts for suspicious activity

## Integration with CI/CD

For automated environments, you can use this script in your deployment pipeline:

```yaml
# Example GitHub Actions workflow
name: Create Deployment User
on:
  deployment:
    types: [created]

jobs:
  create-user:
    runs-on: ubuntu-latest
    steps:
      - name: Create deployment user
        run: |
          export SUPABASE_SERVICE_ROLE_KEY="${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
          ./scripts/create_user.sh create \
            "deploy-${{ github.sha }}@example.com" \
            "${{ secrets.DEPLOYMENT_PASSWORD }}" \
            "deploy"
```

## Troubleshooting

### Common Issues:

1. **"Invalid API key" error**
   - Verify you're using the service_role key (not anon key)
   - Check that the key hasn't expired or been revoked

2. **"User already exists" error**
   - Check if user already exists with `./create_user.sh list`
   - Use reset password instead of create

3. **"Permission denied" error**
   - Ensure the script has execute permissions: `chmod +x create_user.sh`
   - Check that curl and jq are installed

4. **Script hangs or times out**
   - Check network connectivity to Supabase
   - Verify SUPABASE_URL is correct
   - Check Supabase status page for outages

## Security Considerations

### NEVER:
- Store service_role key in version control
- Share service_role key with unauthorized personnel
- Use weak passwords for user accounts
- Leave temporary passwords unchanged

### ALWAYS:
- Use environment variables for sensitive data
- Audit script usage regularly
- Monitor for unauthorized user creation
- Have a revocation plan for compromised keys

## Support

For issues with these scripts:
1. Check the troubleshooting section above
2. Verify your Supabase project configuration
3. Consult Supabase documentation for API changes
4. Contact your system administrator

## Related Documentation
- [Auth Configuration Guide](../docs/security/auth_configuration.md)
- [Security Best Practices](../docs/security/security_best_practices.md)
- [Setup Checklist](../docs/security/setup_checklist.md)
