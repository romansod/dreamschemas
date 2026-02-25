import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client before importing StorageManager
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      listBuckets: vi.fn(),
      createBucket: vi.fn(),
    },
  }),
}));

import { StorageManager } from '../storage-manager';
import { STORAGE_CONFIG } from '../constants';

function makeFile(sizeBytes: number, name = 'data.csv', type = 'text/csv'): File {
  // Create a Blob of the exact requested size, then wrap it as a File
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe('StorageManager.validateFile — bucket size limit', () => {
  let manager: StorageManager;

  beforeEach(() => {
    manager = new StorageManager();
  });

  it('returns FILE_TOO_LARGE_FOR_BUCKET when file exceeds the Supabase bucket limit', () => {
    const overLimit = STORAGE_CONFIG.SUPABASE_BUCKET_FILE_SIZE_LIMIT_BYTES + 1;
    const file = makeFile(overLimit);

    const result = manager.validateFile(file);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FILE_TOO_LARGE_FOR_BUCKET');
    expect(result.error?.message).toContain('MB');
  });

  it('includes the file size and limit in the error message', () => {
    // 55 MB — clearly over the 50 MB limit
    const file = makeFile(55 * 1024 * 1024);

    const result = manager.validateFile(file);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('55.0 MB');
    expect(result.error?.message).toContain('50 MB');
  });

  it('does not return FILE_TOO_LARGE_FOR_BUCKET for a file at exactly the limit', () => {
    const atLimit = STORAGE_CONFIG.SUPABASE_BUCKET_FILE_SIZE_LIMIT_BYTES;
    const file = makeFile(atLimit);

    const result = manager.validateFile(file);

    expect(result.error?.code).not.toBe('FILE_TOO_LARGE_FOR_BUCKET');
  });

  it('does not return FILE_TOO_LARGE_FOR_BUCKET for a small file', () => {
    const file = makeFile(10 * 1024); // 10 KB

    const result = manager.validateFile(file);

    expect(result.error?.code).not.toBe('FILE_TOO_LARGE_FOR_BUCKET');
  });
});

describe('StorageManager.validateFile — existing validation rules', () => {
  let manager: StorageManager;

  beforeEach(() => {
    manager = new StorageManager();
  });

  it('rejects files smaller than 1 KB', () => {
    const file = makeFile(512); // 512 bytes

    const result = manager.validateFile(file);

    expect(result.success).toBe(false);
    // The small-file error goes into the details array, not the top-level message
    const details = result.error?.details as string[] | undefined;
    expect(details?.some(d => d.includes('too small'))).toBe(true);
  });

  it('rejects files with a disallowed extension', () => {
    const file = makeFile(10 * 1024, 'data.xlsx', 'application/vnd.ms-excel');

    const result = manager.validateFile(file);

    expect(result.success).toBe(false);
  });

  it('accepts a valid small CSV', () => {
    const file = makeFile(5 * 1024, 'data.csv', 'text/csv');

    const result = manager.validateFile(file);

    expect(result.success).toBe(true);
  });
});
