# Storage Setup for BOM Manager

## Overview
This directory contains scripts and documentation for setting up Supabase Storage for the BOM Manager application.

## Files

### 1. `storage-bucket-setup.sql`
**Purpose**: SQL script to create RLS policies for the "drawings" storage bucket.

**Usage**:
1. First create the "drawings" bucket in Supabase Dashboard:
   - Go to Storage → New Bucket
   - Name: `drawings`
   - Public: OFF (private - requires auth)
   - Click "Create Bucket"

2. Run the SQL script in Supabase SQL Editor:
   ```sql
   -- Copy and paste the contents of storage-bucket-setup.sql
   ```

**What it does**:
- Creates 4 RLS policies for the `storage.objects` table:
  - INSERT: Authenticated users can upload
  - SELECT: Authenticated users can view/download
  - UPDATE: Authenticated users can update
  - DELETE: Authenticated users can delete
- All policies require: `bucket_id = 'drawings' AND auth.role() = 'authenticated'`
- Creates helper functions for file management

### 2. Verification Commands
After running the script, verify the setup:

```sql
-- Check if policies were created
SELECT * FROM pg_policies WHERE tablename = 'objects';

-- List files in drawings bucket (requires admin)
SELECT * FROM storage.objects WHERE bucket_id = 'drawings';

-- Test upload (requires authentication in app context)
-- This can be tested from the frontend app
```

## Integration Points

### Database Tables with File Paths
The following tables have columns that store file paths in the "drawings" bucket:

1. **Part tables** (5 types):
   - `image_path` - Main part image
   - `pdf_path`, `pdf2_path`, `pdf3_path` - PDF documents
   - `cad_file_url` - CAD files
   - `pdm_file_path` - PDM files

2. **Upload history table**:
   - `json_excel_file_uploaded.excel_path` - Uploaded Excel files

### File Path Structure
Files are organized in the bucket using this structure:
```
drawings/
├── [part_type]/           # e.g., mechanical_manufacture
│   └── [part_id]/         # e.g., 123
│       ├── image/         # Part images
│       ├── pdf/           # PDF documents
│       ├── cad/           # CAD files
│       └── datasheet/     # Technical datasheets
└── uploads/               # Excel/JSON uploads
    └── [timestamp]/
        └── [filename]
```

## Frontend Implementation

### Required Files
1. `src/lib/supabase.ts` - Supabase client configuration
2. `src/api/storage.ts` - Storage API functions
3. `src/types/storage.ts` - TypeScript types
4. `src/hooks/useStorage.ts` - React hook for storage operations
5. `src/components/ui/FileUpload.tsx` - File upload component

### Environment Variables
The frontend requires these environment variables:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Sample Usage
```typescript
// Upload a file
import { uploadFile } from '@/api/storage';

const filePath = await uploadFile(
  file,                     // File object
  'mechanical_manufacture', // Part type
  123,                      // Part ID
  'image'                   // File category
);

// Get signed URL for private access
import { getSignedUrl } from '@/api/storage';
const signedUrl = await getSignedUrl(filePath);
```

## Testing

### 1. Test RLS Policies
```sql
-- As admin, check policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects';
```

### 2. Test from Frontend
1. Start the development server
2. Login with test credentials
3. Navigate to a part creation/edit page
4. Try uploading an image file
5. Verify the file appears in the Supabase Storage dashboard

### 3. Test File Operations
- Upload: Should succeed for authenticated users
- Download: Should succeed for authenticated users
- Delete: Should succeed for authenticated users
- Unauthenticated: All operations should fail

## Troubleshooting

### Common Issues

1. **"Bucket not found" error**
   - Verify bucket name is exactly `drawings`
   - Check bucket was created in Supabase Dashboard

2. **"Permission denied" error**
   - Verify RLS policies were applied
   - Check user is authenticated
   - Ensure `bucket_id = 'drawings'` in policy conditions

3. **File upload fails**
   - Check file size limits (Supabase free tier: 50MB max)
   - Verify network connectivity
   - Check browser console for CORS errors

4. **Signed URLs not working**
   - Ensure bucket is private (not public)
   - Check URL expiration time
   - Verify file path is correct

### Debug SQL
```sql
-- Check storage configuration
SELECT * FROM storage.buckets WHERE id = 'drawings';

-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'objects';

-- List all storage policies
SELECT * FROM pg_policies WHERE tablename = 'objects';
```

## Security Considerations

1. **Authentication Required**: All file operations require authentication
2. **Private Bucket**: The "drawings" bucket is private
3. **RLS Policies**: Only authenticated users can access files
4. **Input Validation**: Validate file types and sizes client and server side
5. **Signed URLs**: Use signed URLs with appropriate expiry for file access

## Next Steps

After storage setup is complete:
1. Integrate file upload in part creation/editing forms
2. Implement file display in part listings
3. Add file download functionality
4. Implement file deletion when parts are deleted
5. Add file size and type validation
6. Implement progress indicators for large files
