// src/components/ui/FileUpload.tsx
// FIXED - Full public URL + no old useStorage hook

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface FileUploadProps {
  existingUrl?: string | null;
  onUpload?: (fullPublicUrl: string) => void;
  bucket?: string;
  label?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  bucket = 'bom_assets',
  onUpload,
  existingUrl,
  label = 'Upload File',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setError(null);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setSelectedFile(file);
          setError(null);
          await startUpload(file);
        }
      }
    }
  };

  const startUpload = async (fileToUpload: File) => {
    setUploading(true);
    setError(null);
    try {
      const fileExt = fileToUpload.name.split('.').pop() || 'png';
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileToUpload);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      onUpload?.(publicUrl);
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.message || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }
    await startUpload(selectedFile);
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4" onPaste={onPaste}>
      {label && (
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
          {label}
        </label>
      )}

      {existingUrl && (
        <div className="mb-3 p-2 bg-gray-50 rounded-2xl border border-gray-100">
          <img src={existingUrl} alt="Current" className="w-28 h-28 object-contain mx-auto" />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.step,.stp"
        onChange={handleFileSelect}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-sm file:font-black file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-colors"
      />

      {selectedFile && (
        <div className="text-xs text-gray-500">
          Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
        </div>
      )}

      {selectedFile && (
        <div className="flex gap-3">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl disabled:opacity-50 transition-all"
          >
            {uploading ? 'Uploading…' : 'Upload & Save'}
          </button>
          <button
            onClick={handleCancel}
            className="px-6 py-3 border border-gray-200 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
};
