// Storage-related TypeScript types for BOM Manager

export type FileCategory = 'image' | 'pdf' | 'cad' | 'datasheet' | 'excel';

export interface UploadResponse {
  success: boolean;
  filePath?: string;
  error?: string;
  publicUrl?: string;
  signedUrl?: string;
}

export interface FileMetadata {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface StorageConfig {
  bucketName: string;
  maxFileSize: {
    image: number;
    pdf: number;
    cad: number;
    datasheet: number;
    excel: number;
  };
  allowedMimeTypes: {
    image: string[];
    pdf: string[];
    cad: string[];
    datasheet: string[];
    excel: string[];
  };
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  fileSize?: number;
  mimeType?: string;
}

export interface PartFilePaths {
  imagePath?: string;
  pdfPath?: string;
  pdf2Path?: string;
  pdf3Path?: string;
  cadFilePath?: string;
  pdmFilePath?: string;
}

export const STORAGE_CONFIG: StorageConfig = {
  bucketName: 'drawings',
  maxFileSize: {
    image: 5 * 1024 * 1024,
    pdf: 10 * 1024 * 1024,
    cad: 50 * 1024 * 1024,
    datasheet: 10 * 1024 * 1024,
    excel: 20 * 1024 * 1024,
  },
  allowedMimeTypes: {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    pdf: ['application/pdf'],
    cad: [
      'application/step',
      'application/sat',
      'model/step',
      'model/stp',
      'application/vnd.dwg',
      'image/vnd.dxf'
    ],
    datasheet: ['application/pdf', 'text/plain'],
    excel: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/json'
    ],
  },
};

// Helper function to validate file before upload
export function validateFile(
  file: File,
  category: FileCategory
): FileValidationResult {
  const errors: string[] = [];
  const config = STORAGE_CONFIG;
  
  // Check file size
  if (file.size > config.maxFileSize[category]) {
    const maxMB = config.maxFileSize[category] / (1024 * 1024);
    errors.push(`File too large. Maximum size for ${category} is ${maxMB}MB`);
  }
  
  // Check MIME type
  const allowedTypes = config.allowedMimeTypes[category];
  if (!allowedTypes.includes(file.type)) {
    errors.push(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    fileSize: file.size,
    mimeType: file.type,
  };
}

// Generate file path for storage
export function generateFilePath(
  partType: string,
  partId: number,
  category: FileCategory,
  originalFileName: string
): string {
  const timestamp = Date.now();
  const fileExt = originalFileName.split('.').pop() || '';
  const safeFileName = originalFileName
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9-_]/g, '_') // Replace special chars with underscore
    .slice(0, 100); // Limit length
  
  const fileName = `${safeFileName}-${timestamp}.${fileExt}`;
  
  return `${partType}/${partId}/${category}/${fileName}`;
}

// Parse file path to extract metadata
export function parseFilePath(filePath: string): {
  partType?: string;
  partId?: number;
  category?: FileCategory;
  fileName?: string;
} {
  const parts = filePath.split('/');
  if (parts.length < 4) {
    return {};
  }
  
  const partType = parts[0];
  const partId = parseInt(parts[1], 10);
  const category = parts[2] as FileCategory;
  const fileName = parts.slice(3).join('/');
  
  return {
    partType: isNaN(partId) ? undefined : partType,
    partId: isNaN(partId) ? undefined : partId,
    category: ['image', 'pdf', 'cad', 'datasheet', 'excel'].includes(category) 
      ? category as FileCategory 
      : undefined,
    fileName,
  };
}
