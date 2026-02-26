/**
 * Hook for streaming data seeding progress via Server-Sent Events
 * Phase 10: Data Seeding & Large File Processing
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { SeedingProgress, SeedingJob, SeedingAPIResponse } from "@/types/seeding.types";
import { generateId } from "@/lib/utils";
import { ProjectStorage } from "@/lib/storage/project-storage";
import { getSupabaseOAuth } from "@/lib/supabase/oauth";
import { MAX_RETRIES, RETRY_DELAY_MS, parseSeedingSSELine, shouldAutoRetry } from "@/lib/seeding/stream-utils";

interface SeedingStreamOptions {
  onProgress?: (progress: SeedingProgress) => void;
  onComplete?: (result: SeedingAPIResponse<unknown>) => void;
  onError?: (error: Error) => void;
}

interface SeedingStreamState {
  isConnected: boolean;
  isProcessing: boolean;
  isResuming: boolean;
  progress: SeedingProgress | null;
  error: Error | null;
  result: SeedingAPIResponse<unknown> | null;
}

export function useSeedingStream(options: SeedingStreamOptions = {}) {
  const [state, setState] = useState<SeedingStreamState>({
    isConnected: false,
    isProcessing: false,
    isResuming: false,
    progress: null,
    error: null,
    result: null,
  });

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const currentJobRef = useRef<SeedingJob | null>(null);
  const retryCountRef = useRef(0);
  const isStoppedRef = useRef(false);

  const { onProgress, onComplete, onError } = options;

  // Cleanup function — closes the stream reader and marks as disconnected
  const cleanup = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel().catch(console.error);
      readerRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isConnected: false,
      isProcessing: false,
    }));
  }, []);

  // Core stream processor — handles SSE events and triggers auto-retry on
  // unexpected disconnects (network drops, edge function timeouts, etc.)
  const processStreamWithReader = useCallback(async (
    streamReader: ReadableStreamDefaultReader<Uint8Array>,
    getProjectId: () => string,
    getAccessToken: () => string,
  ) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    let receivedError = false;

    try {
      while (true) {
        const { done, value } = await streamReader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const message = parseSeedingSSELine(line);
          if (!message) continue;

          if (message.type === "done") {
            receivedDone = true;
            cleanup();
            return;
          }

          switch (message.type) {
              case "progress": {
                const progress = message.data as SeedingProgress;
                setState(prev => ({
                  ...prev,
                  progress,
                  // Clear isResuming once we've received the first real progress update
                  isResuming: prev.isResuming && (progress.isResuming ?? false),
                }));
                onProgress?.(progress);

                // Handle continuation if needed (existing mechanism)
                if (progress.needsContinuation && progress.continuationData) {
                  console.log(`🔄 Seeding needs continuation from row ${progress.continuationData.processedRows}`);
                  cleanup();

                  setTimeout(async () => {
                    const job = currentJobRef.current;
                    const jobId = jobIdRef.current;
                    if (!job || !jobId) return;

                    try {
                      const continuationJobData = {
                        fileId: job.fileUpload?.id || "",
                        jobId,
                        configuration: job.configuration,
                        schema: job.schema,
                        projectConfig: job.projectConfig,
                        targetTable: job.targetTable,
                        fileUpload: job.fileUpload ? {
                          storagePath: job.fileUpload.storagePath,
                          filename: job.fileUpload.filename,
                          size: job.fileUpload.size,
                        } : undefined,
                        processedRows: progress.continuationData!.processedRows,
                        chunkIndex: progress.continuationData!.nextChunkIndex,
                      };

                      const continuationResponse = await fetch(`/api/seeding/start?stream=true`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${getAccessToken()}`,
                        },
                        body: JSON.stringify({
                          projectId: getProjectId(),
                          jobData: continuationJobData,
                        }),
                      });

                      if (!continuationResponse.ok) {
                        const errorData = await continuationResponse.json();
                        throw new Error(`Continuation failed: ${errorData.error || continuationResponse.statusText}`);
                      }

                      const continuationReader = continuationResponse.body?.getReader();
                      if (!continuationReader) {
                        throw new Error("Failed to get continuation stream");
                      }

                      readerRef.current = continuationReader;
                      setState(prev => ({ ...prev, isConnected: true }));
                      processStreamWithReader(continuationReader, getProjectId, getAccessToken);

                    } catch (continuationError) {
                      console.error('❌ Failed to continue seeding:', continuationError);
                      const error = new Error(`Continuation failed: ${continuationError instanceof Error ? continuationError.message : 'Unknown error'}`);
                      setState(prev => ({ ...prev, error, isProcessing: false, isConnected: false }));
                      onError?.(error);
                    }
                  }, 1000);
                }
                break;
              }

              case "complete": {
                const result = message.data as SeedingAPIResponse<unknown>;
                setState(prev => ({ ...prev, result, isProcessing: false, isResuming: false }));
                onComplete?.(result);
                cleanup();
                receivedDone = true;
                break;
              }

              case "error": {
                receivedError = true;
                const errorResult = message.data as SeedingAPIResponse<unknown>;
                const error = new Error(errorResult.error?.message || "Seeding failed");
                setState(prev => ({ ...prev, error, isProcessing: false, isResuming: false }));
                onError?.(error);
                cleanup();
                break;
              }

              default:
                console.warn("Unknown message type:", message.type);
            }
        }
      }
    } catch (streamError) {
      // Stream read error — will be handled below
      console.error("Stream read error:", streamError);
    }

    // Stream ended — determine if it was intentional or unexpected
    if (receivedDone || receivedError) {
      // Normal termination — nothing more to do
      return;
    }

    // Unexpected disconnect (network drop, edge function timeout, etc.)
    if (shouldAutoRetry(isStoppedRef.current, retryCountRef.current)) {
      retryCountRef.current++;
      console.log(`🔄 Stream closed unexpectedly — auto-retry ${retryCountRef.current}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
      setState(prev => ({ ...prev, isConnected: false, isResuming: true }));

      setTimeout(async () => {
        const job = currentJobRef.current;
        const jobId = jobIdRef.current;
        if (!job || !jobId || isStoppedRef.current) return;

        try {
          const streamUrl = `/api/seeding/start?stream=true`;
          const jobData = {
            fileId: job.fileUpload?.id || "",
            jobId,
            configuration: job.configuration,
            schema: job.schema,
            projectConfig: job.projectConfig,
            targetTable: job.targetTable,
            fileUpload: job.fileUpload ? {
              storagePath: job.fileUpload.storagePath,
              filename: job.fileUpload.filename,
              size: job.fileUpload.size,
            } : undefined,
          };

          const response = await fetch(streamUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${getAccessToken()}`,
            },
            body: JSON.stringify({ projectId: getProjectId(), jobData }),
          });

          if (!response.ok) {
            throw new Error(`Retry failed: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error("Failed to get retry stream");

          readerRef.current = reader;
          setState(prev => ({ ...prev, isConnected: true, isProcessing: true }));
          processStreamWithReader(reader, getProjectId, getAccessToken);

        } catch (retryError) {
          console.error(`❌ Retry ${retryCountRef.current} failed:`, retryError);
          const error = new Error(`Auto-retry failed: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
          setState(prev => ({ ...prev, error, isProcessing: false, isConnected: false, isResuming: false }));
          onError?.(error);
        }
      }, RETRY_DELAY_MS);

    } else {
      // Max retries exhausted or intentional stop
      if (!isStoppedRef.current && retryCountRef.current >= MAX_RETRIES) {
        const error = new Error(`Seeding stream disconnected after ${MAX_RETRIES} retry attempts`);
        setState(prev => ({ ...prev, error, isProcessing: false, isConnected: false, isResuming: false }));
        onError?.(error);
      }
      cleanup();
    }
  }, [cleanup, onProgress, onComplete, onError]);

  // Start seeding with streaming progress
  const startSeeding = useCallback(async (job: SeedingJob) => {
    try {
      cleanup();

      const jobId = generateId();
      jobIdRef.current = jobId;
      currentJobRef.current = job;
      retryCountRef.current = 0;
      isStoppedRef.current = false;

      setState(prev => ({
        ...prev,
        isProcessing: true,
        isResuming: false,
        error: null,
        result: null,
        progress: null,
      }));

      const oauth = getSupabaseOAuth();
      const oauthState = oauth.getState();

      if (!oauthState.isConnected || !oauthState.accessToken) {
        throw new Error("Not authenticated with Supabase. Please connect your Supabase account first.");
      }

      const projectId = ProjectStorage.getProjectId(job.schema.projectId || job.projectId);
      if (!projectId) {
        throw new Error("No project ID found. Please ensure you've deployed your schema first and try refreshing the page.");
      }

      // Helpers that close over the current auth/project state
      const getProjectId = () => projectId;
      const getAccessToken = () => oauth.getState().accessToken ?? "";

      // Deploy the edge function (once per job, not on retries)
      console.log(`🚀 Creating Edge Function for schema with ${job.schema.tables.length} tables`);
      const createFunctionResponse = await fetch("/api/seeding/create-function", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${oauthState.accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          schema: job.schema,
          csvMetadata: job.fileUpload ? [{
            headers: job.fileUpload.metadata?.headers || [],
            sampleData: job.fileUpload.metadata?.sampleRows || [],
            totalRows: job.fileUpload.metadata?.totalRows || 0,
          }] : [],
          useSimpleVersion: false,
        }),
      });

      if (!createFunctionResponse.ok) {
        const errorData = await createFunctionResponse.json();
        throw new Error(`Failed to create Edge Function: ${errorData.error}`);
      }

      // Start the seeding stream
      const streamUrl = `/api/seeding/start?stream=true`;
      const jobData = {
        fileId: job.fileUpload?.id || "",
        jobId,
        configuration: job.configuration,
        schema: job.schema,
        projectConfig: job.projectConfig,
        targetTable: job.targetTable,
        fileUpload: job.fileUpload ? {
          storagePath: job.fileUpload.storagePath,
          filename: job.fileUpload.filename,
          size: job.fileUpload.size,
        } : undefined,
      };

      const response = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${oauthState.accessToken}`,
        },
        body: JSON.stringify({ projectId, jobData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to start seeding: ${errorData.error || response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response stream");
      }

      readerRef.current = reader;
      setState(prev => ({ ...prev, isConnected: true }));

      processStreamWithReader(reader, getProjectId, getAccessToken);

    } catch (error) {
      const err = error instanceof Error ? error : new Error("Failed to start seeding");
      setState(prev => ({
        ...prev,
        error: err,
        isProcessing: false,
        isConnected: false,
        isResuming: false,
      }));
      onError?.(err);
      cleanup();
    }
  }, [cleanup, processStreamWithReader, onError]);

  // Stop seeding — marks as intentionally stopped so auto-retry does not fire
  const stopSeeding = useCallback(() => {
    isStoppedRef.current = true;
    cleanup();
    setState(prev => ({ ...prev, isResuming: false }));
  }, [cleanup]);

  // Reset state fully
  const reset = useCallback(() => {
    isStoppedRef.current = true;
    cleanup();
    currentJobRef.current = null;
    jobIdRef.current = null;
    retryCountRef.current = 0;
    setState({
      isConnected: false,
      isProcessing: false,
      isResuming: false,
      progress: null,
      error: null,
      result: null,
    });
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    // State
    isConnected: state.isConnected,
    isProcessing: state.isProcessing,
    isResuming: state.isResuming,
    progress: state.progress,
    error: state.error,
    result: state.result,

    // Actions
    startSeeding,
    stopSeeding,
    reset,

    // Utils
    jobId: jobIdRef.current,
  };
}

export type { SeedingStreamOptions, SeedingStreamState };
