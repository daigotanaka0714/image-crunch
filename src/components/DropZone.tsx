import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import type { FileItem } from '../types';

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'];

export function DropZone() {
  const { t } = useTranslation();
  const { addFiles, processingState } = useAppStore();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (processingState === 'processing') return;

      const paths = acceptedFiles.map((f) => f.path);
      
      try {
        // Get all image files (including from directories)
        const imagePaths = await invoke<string[]>('get_image_files', { paths });
        
        const fileItems: FileItem[] = imagePaths.map((path) => ({
          path,
          name: path.split('/').pop() || path.split('\\').pop() || path,
          size: 0, // Will be populated when processing
        }));

        addFiles(fileItems);
      } catch (error) {
        console.error('Failed to process dropped files:', error);
      }
    },
    [addFiles, processingState]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ACCEPTED_EXTENSIONS,
    },
    disabled: processingState === 'processing',
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-colors duration-200
        ${isDragActive 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }
        ${processingState === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="space-y-2">
        <div className="text-4xl">📁</div>
        <p className="text-lg font-medium text-gray-700">
          {isDragActive ? '🎯' : ''} {t('dropzone.title')}
        </p>
        <p className="text-sm text-gray-500">{t('dropzone.subtitle')}</p>
        <p className="text-xs text-gray-400">{t('dropzone.supported')}</p>
      </div>
    </div>
  );
}
