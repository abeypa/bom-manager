# Storage Integration Guide for BOM Manager

## Overview
BOM Manager uses Supabase Storage for file management:
- Part images (JPEG, PNG, WebP)
- Technical drawings (PDF, CAD files)
- Data sheets (PDF)
- Excel/JSON upload files

## Storage Bucket: `drawings`
- **Type**: Private (requires authentication)
- **Purpose**: Store all part-related files
- **File Structure**: Organized by part type and part ID

### File Path Structure
```
drawings/
├── [part_type]/[part_id]/image/      # Main part image
├── [part_type]/[part_id]/pdf/        # PDF documents
├── [part_type]/[part_id]/cad/        # CAD files
├── [part_type]/[part_id]/datasheet/  # Technical datasheets
└── uploads/[timestamp]/[filename]    # Excel/JSON uploads
```

## RLS Policies
The storage bucket has these RLS policies:
1. **INSERT**: Authenticated users can upload
2. **SELECT**: Authenticated users can view/download
3. **UPDATE**: Authenticated users can update
4. **DELETE**: Authenticated users can delete

All require: `bucket_id = 'drawings' AND auth.role() = 'authenticated'`

## Frontend Implementation

### Supabase Client Setup
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### File Upload Function
```typescript
// src/api/storage.ts
export async function uploadFile(
  file: File,
  partType: string,
  partId: number,
  fileCategory: 'image' | 'pdf' | 'cad' | 'datasheet'
): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${partType}/${partId}/${fileCategory}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('drawings')
    .upload(filePath, file, { upsert: true });

  return error ? null : filePath;
}

// Get signed URL (private bucket)
export async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('drawings')
    .createSignedUrl(filePath, 3600);
  return error ? null : data.signedUrl;
}
```

### React Component Example
```typescript
// src/components/parts/FileUpload.tsx
import { useState } from 'react';
import { uploadFile, getSignedUrl } from '@/api/storage';

export function FileUpload({ partType, partId, fileCategory, onUploadComplete }) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const filePath = await uploadFile(file, partType, partId, fileCategory);
      if (filePath) {
        const signedUrl = await getSignedUrl(filePath);
        if (signedUrl) setPreviewUrl(signedUrl);
        onUploadComplete(filePath);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload">
      <input type="file" onChange={handleFileChange} disabled={isUploading} />
      {isUploading && <div>Uploading...</div>}
      {previewUrl && fileCategory === 'image' && (
        <img src={previewUrl} alt="Preview" className="preview-image" />
      )}
    </div>
  );
}
```

## Best Practices
1. **File Naming**: Use timestamps/UUIDs to avoid collisions
2. **Size Limits**: Images < 5MB, PDFs < 10MB, CAD < 50MB
3. **Validation**: Validate MIME types before upload
4. **Error Handling**: Graceful error messages for users
5. **Cleanup**: Delete old files when replacing

## Testing
```sql
-- Test RLS policies
INSERT INTO storage.objects (bucket_id, name, owner) 
VALUES ('drawings', 'test.txt', auth.uid());
SELECT * FROM storage.objects WHERE bucket_id = 'drawings';
```

## Troubleshooting
- **"Bucket not found"**: Check bucket name is `drawings`
- **"Permission denied"**: Verify RLS policies and authentication
- **Upload fails**: Check file size limits and network
- **Signed URLs not working**: Ensure bucket is private
