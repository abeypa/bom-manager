# BOM Manager - Scripts Directory

This directory contains administrative scripts for managing the BOM Manager application.

## Scripts

### `supabase_data_admin.mjs` - Supabase Data Audit & Safe Normalization
A professional maintenance script for reviewing live Supabase data quality and applying low-risk cleanup updates.

#### What it checks
- Duplicate supplier names, project numbers, section names, subsection names, PO numbers, and part numbers after normalization
- Blank required values on core records
- Hierarchy issues such as orphan sections, subsections, or project-part links
- Safe text cleanup opportunities such as trimming whitespace, lowercasing emails, and uppercasing currencies

#### What it can update
- Trim and normalize text fields on:
  - `suppliers`
  - `projects`
  - `project_sections`
  - `project_subsections`
  - `purchase_orders`
  - `profiles`
  - All master part tables
- Convert blank optional fields to `NULL`
- Lowercase emails
- Uppercase currencies

#### Safety model
- Default mode is read-only
- Use `--apply` to write changes
- Duplicate-prone key fields are reported first and blocked from automatic normalization if a collision would be created

#### Requirements
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Usage
```bash
# Full read-only audit
npm run db:audit

# Audit only suppliers and projects
npm run db:audit -- --table suppliers,projects

# Preview normalization candidates without writing
npm run db:normalize

# Apply safe normalization updates
npm run db:normalize -- --apply
```

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

### `backfill_po_price_history.mjs` - PO Price History Backfill
Backfills `part_price_history` from PO PDFs that were already parsed and stored in the ingestion staging tables.

#### What it uses
- `po_ingestion_documents.po_date`, `po_number`, `currency`
- `po_ingestion_lines.item_code`, `unit_price`, `discount_percent`, `description`

This means the backfill uses PDF-derived ingestion data already saved in the database, not current BOM prices.

#### Requirements
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Usage
```bash
# Preview only
npm run backfill:po-price-history -- --dry-run

# Backfill one PO
npm run backfill:po-price-history -- --po-number "PO/P/25-26/100077"

# Backfill all parsed ingestion docs
npm run backfill:po-price-history
```

#### Notes
- Misc/commercial lines such as packing, forwarding, freight, discount, etc. are skipped.
- The script is idempotent for the same part / PO / date / price / currency / discount combination.
- It resolves master parts from ingestion mappings first, then falls back to ERP item code lookup in master tables.

### `backfill_po_tax_amounts.mjs` - Purchase Order PDF Tax Backfill
Backfills `purchase_orders.tax_amount` for existing POs that already have an attached BEP PO PDF.

#### What it uses
- `purchase_orders.bep_po_pdf_url`
- PDF text extracted via `scripts/extract_pdf_text.py`
- Tax labels such as `CGST`, `SGST`, `IGST`, `GST`, or a derived value from `grand total - subtotal/basic`

#### Requirements
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `python`
- Python package `pypdf`

#### Usage
```bash
# Preview only
npm run backfill:po-tax-amounts -- --dry-run

# Backfill one PO
npm run backfill:po-tax-amounts -- --po-number "PO/P/25-26/100077"

# Backfill the latest 200 missing-tax POs
npm run backfill:po-tax-amounts -- --limit 200

# Re-scan even rows that already have tax_amount
npm run backfill:po-tax-amounts -- --include-filled
```

#### Notes
- The script updates only `purchase_orders.tax_amount` and `updated_date`.
- It does not change PO status, PO line items, or `grand_total`.
- Rows that still cannot be parsed are skipped and reported for manual review.

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
- [Supabase Data Admin Guide](../docs/SUPABASE_DATA_ADMIN.md)
