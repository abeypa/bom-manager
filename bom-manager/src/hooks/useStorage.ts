// React hook for Supabase Storage operations

import { useState, useCallback, useRef } from 'react';
import * as storageApi from '@/api/storage';
import type { FileCategory, UploadResponse } from '@/types/storage';

interface UseStorageOptions {
  onUploadStart?: () => void;
  onUploadComplete?: (result: UploadResponse) => void;
  onUploadError?: (error: string) => void;
  onDownloadStart?: () => void;
  onDownloadComplete?: (blob: Blob | null) => void;
  onDownloadError?: (error: string) => void;
}

export function useStorage(options?: UseStorageOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const upload = useCallback(async (
    file: File,
    partType: string,
    partId: number,
    category: FileCategory,
    customOptions?: {
      overwrite?: boolean;
      customPath?: string;
    }
  ): Promise<UploadResponse> => {
    // Abort any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    setProgress(0);
    
    options?.onUploadStart?.();

    try {
      // Simulate progress (Supabase doesn't provide progress events in JS client)
      // In a real implementation, you might need to use XMLHttpRequest for progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      const result = await storageApi.uploadFile(
        file,
        partType,
        partId,
        category,
        customOptions
      );

      clearInterval(progressInterval);
      setProgress(100);

      if (result.success) {
        options?.onUploadComplete?.(result);
      } else {
        setError(result.error || 'Upload failed');
        options?.onUploadError?.(result.error || 'Upload failed');
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      options?.onUploadError?.(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [options]);

  const download = useCallback(async (
    filePath: string
  ): Promise<Blob | null> => {
    setIsLoading(true);
    setError(null);
    options?.onDownloadStart?.();

    try {
      const blob = await storageApi.downloadFile(filePath);
      
      if (blob) {
        options?.onDownloadComplete?.(blob);
      } else {
        setError('Download failed');
        options?.onDownloadError?.('Download failed');
      }

      return blob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      setError(errorMessage);
      options?.onDownloadError?.(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const downloadToDevice = useCallback(async (
    filePath: string,
    fileName?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await storageApi.downloadFileToDevice(filePath, fileName);
      
      if (!success) {
        setError('Download to device failed');
      }

      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download to device failed';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remove = useCallback(async (
    filePath: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await storageApi.deleteFile(filePath);
      
      if (!success) {
        setError('Delete failed');
      }

      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Delete failed';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSignedUrl = useCallback(async (
    filePath: string,
    expiresIn: number = 3600
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const url = await storageApi.getSignedUrl(filePath, expiresIn);
      
      if (!url) {
        setError('Failed to get signed URL');
      }

      return url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get signed URL';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkFileExists = useCallback(async (
    filePath: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const exists = await storageApi.fileExists(filePath);
      return exists;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check file existence';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setProgress(0);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetProgress = useCallback(() => {
    setProgress(0);
  }, []);

  return {
    // Operations
    upload,
    download,
    downloadToDevice,
    remove,
    getSignedUrl,
    checkFileExists,
    abort,
    
    // State
    isLoading,
    error,
    progress,
    
    // Utilities
    clearError,
    resetProgress,
  };
}

// Specialized hook for part file uploads
export function usePartFileUpload(
  partType: string,
  partId: number,
  options?: UseStorageOptions
) {
  const storage = useStorage(options);

  const uploadPartImage = useCallback(async (
    file: File,
    overwrite: boolean = true
  ) => {
    return storage.upload(file, partType, partId, 'image', { overwrite });
  }, [storage, partType, partId]);

  const uploadPartPdf = useCallback(async (
    file: File,
    pdfNumber: 1 | 2 | 3 = 1,
    overwrite: boolean = true
  ) => {
    return storage.upload(file, partType, partId, 'pdf', { overwrite });
  }, [storage, partType, partId]);

  const uploadPartCad = useCallback(async (
    file: File,
    overwrite: boolean = true
  ) => {
    return storage.upload(file, partType, partId, 'cad', { overwrite });
  }, [storage, partType, partId]);

  const uploadPartDatasheet = useCallback(async (
    file: File,
    overwrite: boolean = true
  ) => {
    return storage.upload(file, partType, partId, 'datasheet', { overwrite });
  }, [storage, partType, partId]);

  return {
    ...storage,
    uploadPartImage,
    uploadPartPdf,
    uploadPartCad,
    uploadPartDatasheet,
  };
}

// Hook for Excel/JSON file uploads
export function useFileUploads(options?: UseStorageOptions) {
  const storage = useStorage(options);

  const uploadExcelFile = useCallback(async (
    file: File,
    timestamp: string = new Date().toISOString().replace(/[:.]/g, '-')
  ) => {
    const fileName = file.name;
    const customPath = `uploads/${timestamp}/${fileName}`;
    
    return storage.upload(
      file,
      'uploads',
      0, // No part ID for uploads
      'excel',
      { customPath, overwrite: true }
    );
  }, [storage]);

  return {
    ...storage,
    uploadExcelFile,
  };
}
