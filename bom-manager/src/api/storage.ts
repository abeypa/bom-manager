// Supabase Storage API for BOM Manager
import { supabase } from '@/lib/supabase';
import type {
  FileCategory,
  UploadResponse,
  FileMetadata,
  FileValidationResult,
} from '@/types/storage';
import { validateFile, generateFilePath, parseFilePath } from '@/types/storage';

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  file: File,
  partType: string,
  partId: number,
  category: FileCategory,
  options?: {
    overwrite?: boolean;
    customPath?: string;
  }
): Promise<UploadResponse> {
  try {
    // Validate file before upload
    const validation = validateFile(file, category);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Generate file path
    const filePath = options?.customPath || 
      generateFilePath(partType, partId, category, file.name);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('drawings')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: options?.overwrite ?? true,
      });

    if (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get signed URL for immediate access
    const signedUrl = await getSignedUrl(filePath);
    
    return {
      success: true,
      filePath: filePath,
      signedUrl: signedUrl || undefined,
    };
  } catch (error) {
    console.error('Upload exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
    };
  }
}

/**
 * Get signed URL for a private file
 */
export async function getSignedUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('drawings')
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('Signed URL error:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Signed URL exception:', error);
    return null;
  }
}

/**
 * Get public URL for a file
 * Note: Only works if bucket is public, but ours is private
 */
export function getPublicUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('drawings')
    .getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Download a file from storage
 */
export async function downloadFile(filePath: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage
      .from('drawings')
      .download(filePath);

    if (error) {
      console.error('Download error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Download exception:', error);
    return null;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('drawings')
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Delete exception:', error);
    return false;
  }
}

/**
 * List files in a directory
 */
export async function listFiles(
  prefix?: string,
  limit: number = 100
): Promise<FileMetadata[]> {
  try {
    const { data, error } = await supabase.storage
      .from('drawings')
      .list(prefix, {
        limit,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      console.error('List files error:', error);
      return [];
    }

    return data.map(item => ({
      id: item.id || '',
      name: item.name,
      path: prefix ? `${prefix}/${item.name}` : item.name,
      size: item.metadata?.size || 0,
      mimeType: item.metadata?.mimetype || '',
      category: 'image' as const,
      uploadedAt: new Date(item.created_at || Date.now()),
      uploadedBy: item.owner || '',
    }));
  } catch (error) {
    console.error('List files exception:', error);
    return [];
  }
}

/**
 * Update file metadata
 */
export async function updateFileMetadata(
  filePath: string,
  metadata: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('drawings')
      .update(filePath, metadata);

    if (error) {
      console.error('Update metadata error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Update metadata exception:', error);
    return false;
  }
}

/**
 * Move or rename a file
 */
export async function moveFile(
  oldPath: string,
  newPath: string
): Promise<boolean> {
  try {
    // Download file
    const blob = await downloadFile(oldPath);
    if (!blob) return false;

    // Upload to new location
    const file = new File([blob], newPath.split('/').pop() || 'file');
    const uploadResult = await uploadFile(
      file,
      '', // partType will be extracted from path
      0,  // partId will be extracted from path  
      'image', // category will be extracted from path
      { customPath: newPath, overwrite: true }
    );

    if (!uploadResult.success) return false;

    // Delete old file
    await deleteFile(oldPath);

    return true;
  } catch (error) {
    console.error('Move file exception:', error);
    return false;
  }
}

/**
 * Get file info/metadata
 */
export async function getFileInfo(filePath: string): Promise<FileMetadata | null> {
  try {
    // List files with exact path
    const files = await listFiles();
    const file = files.find(f => f.path === filePath);
    
    if (file) {
      const parsed = parseFilePath(filePath);
      return {
        ...file,
        category: parsed.category || 'image',
      };
    }

    return null;
  } catch (error) {
    console.error('Get file info exception:', error);
    return null;
  }
}

/**
 * Upload multiple files
 */
export async function uploadMultipleFiles(
  files: File[],
  partType: string,
  partId: number,
  category: FileCategory
): Promise<UploadResponse[]> {
  const uploadPromises = files.map(file =>
    uploadFile(file, partType, partId, category)
  );
  
  return Promise.all(uploadPromises);
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    // Try to get file info
    const info = await getFileInfo(filePath);
    return info !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get file size
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const info = await getFileInfo(filePath);
    return info?.size || null;
  } catch (error) {
    return null;
  }
}

/**
 * Helper: Download file and trigger browser download
 */
export async function downloadFileToDevice(
  filePath: string,
  fileName?: string
): Promise<boolean> {
  try {
    const blob = await downloadFile(filePath);
    if (!blob) return false;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || filePath.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    return true;
  } catch (error) {
    console.error('Download to device error:', error);
    return false;
  }
}
