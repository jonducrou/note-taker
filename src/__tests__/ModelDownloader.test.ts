/**
 * Tests for ModelDownloader
 */

// Mock unzipper BEFORE any imports
jest.mock('unzipper', () => ({
  Extract: jest.fn(() => ({
    on: jest.fn((event, cb) => {
      if (event === 'close') setTimeout(cb, 0)
      return { on: jest.fn() }
    })
  }))
}))

// Mock fs/promises
jest.mock('fs/promises', () => ({
  stat: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn()
}))

// Mock os
jest.mock('os', () => ({
  homedir: jest.fn(() => '/mock/home'),
  tmpdir: jest.fn(() => '/tmp')
}))

// Mock fs (for createWriteStream, createReadStream)
jest.mock('fs', () => ({
  createWriteStream: jest.fn(() => ({
    on: jest.fn(function(this: any, event: string, cb: () => void) {
      if (event === 'finish') setTimeout(cb, 0)
      return this
    }),
    close: jest.fn()
  })),
  createReadStream: jest.fn(() => ({
    pipe: jest.fn(() => ({
      on: jest.fn(function(this: any, event: string, cb: () => void) {
        if (event === 'close') setTimeout(cb, 0)
        return this
      })
    }))
  }))
}))

// Mock https with default implementation
const mockHttpsGet = jest.fn()
jest.mock('https', () => ({
  get: mockHttpsGet,
  default: { get: mockHttpsGet }
}))

// Mock stream/promises
jest.mock('stream/promises', () => ({
  pipeline: jest.fn()
}))

// Mock zlib
jest.mock('zlib', () => ({
  createGunzip: jest.fn()
}))

import * as fs from 'fs/promises'
import { ModelDownloader } from '../main/services/ModelDownloader'

const mockFs = fs as jest.Mocked<typeof fs>

describe('ModelDownloader', () => {
  let downloader: ModelDownloader

  beforeEach(() => {
    jest.clearAllMocks()
    downloader = new ModelDownloader()
  })

  describe('constructor', () => {
    it('should set model path in Application Support', () => {
      const modelPath = downloader.getModelPath()
      expect(modelPath).toContain('/mock/home/Library/Application Support/Note Taker/models')
      expect(modelPath).toContain('vosk-model-en-us-0.22')
    })
  })

  describe('getModelPath', () => {
    it('should return the configured model path', () => {
      const path = downloader.getModelPath()
      expect(path).toBe('/mock/home/Library/Application Support/Note Taker/models/vosk-model-en-us-0.22')
    })
  })

  describe('isModelAvailable', () => {
    it('should return true if model directory exists', async () => {
      mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true } as any)

      const result = await downloader.isModelAvailable()

      expect(result).toBe(true)
      expect(mockFs.stat).toHaveBeenCalledWith(downloader.getModelPath())
    })

    it('should return false if model directory does not exist', async () => {
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))

      const result = await downloader.isModelAvailable()

      expect(result).toBe(false)
    })

    it('should return false if path exists but is not a directory', async () => {
      mockFs.stat.mockResolvedValueOnce({ isDirectory: () => false } as any)

      const result = await downloader.isModelAvailable()

      expect(result).toBe(false)
    })
  })

  describe('setProgressCallback', () => {
    it('should store the progress callback', () => {
      const callback = jest.fn()
      downloader.setProgressCallback(callback)
      // Can't directly test private property, but we can verify it doesn't throw
      expect(() => downloader.setProgressCallback(callback)).not.toThrow()
    })
  })

  describe('downloadModel', () => {
    it('should skip download if model already exists', async () => {
      mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true } as any)

      await downloader.downloadModel()

      expect(mockFs.mkdir).not.toHaveBeenCalled()
    })

    it('should create models directory if it does not exist', async () => {
      // Model doesn't exist
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
      mockFs.mkdir.mockResolvedValueOnce(undefined)

      // Mock the download to fail early for this test
      mockHttpsGet.mockImplementationOnce((_url: string, callback: (res: any) => void) => {
        const mockResponse = {
          statusCode: 500,
          headers: {}
        }
        callback(mockResponse)
        return { on: jest.fn() }
      })

      await expect(downloader.downloadModel()).rejects.toThrow()

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/mock/home/Library/Application Support/Note Taker/models'),
        { recursive: true }
      )
    })

    it('should handle redirect responses', async () => {
      // Model doesn't exist
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
      mockFs.mkdir.mockResolvedValueOnce(undefined)

      let callCount = 0
      mockHttpsGet.mockImplementation((_url: string, callback: (res: any) => void) => {
        callCount++
        if (callCount === 1) {
          // First call - return redirect
          const mockResponse = {
            statusCode: 302,
            headers: { location: 'https://redirected.url/model.zip' }
          }
          callback(mockResponse)
        } else {
          // Second call after redirect - return error to end test
          const mockResponse = {
            statusCode: 500,
            headers: {}
          }
          callback(mockResponse)
        }
        return { on: jest.fn() }
      })

      await expect(downloader.downloadModel()).rejects.toThrow()

      // Verify redirect was followed
      expect(mockHttpsGet).toHaveBeenCalledTimes(2)
      expect(mockHttpsGet).toHaveBeenNthCalledWith(2, 'https://redirected.url/model.zip', expect.any(Function))
    })

    it('should track download progress', async () => {
      // Model doesn't exist
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
      mockFs.mkdir.mockResolvedValueOnce(undefined)
      mockFs.unlink.mockResolvedValueOnce(undefined)

      const progressCallback = jest.fn()
      downloader.setProgressCallback(progressCallback)

      const fsSync = require('fs')

      // Track the fileStream finish callback
      let fileStreamFinishCallback: () => void

      fsSync.createWriteStream.mockReturnValueOnce({
        on: jest.fn(function(this: any, event: string, cb: () => void) {
          if (event === 'finish') {
            fileStreamFinishCallback = cb
          }
          return this
        }),
        close: jest.fn()
      })

      mockHttpsGet.mockImplementationOnce((_url: string, callback: (res: unknown) => void) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockResponse: any = {
          statusCode: 200,
          headers: { 'content-length': '1000' },
          on: jest.fn((event: string, handler: (chunk: Buffer) => void) => {
            if (event === 'data') {
              // Simulate data chunks
              handler(Buffer.alloc(500))
              handler(Buffer.alloc(500))
            }
            return mockResponse
          }),
          pipe: jest.fn(() => {
            // Trigger finish after pipe
            setTimeout(() => fileStreamFinishCallback?.(), 0)
            return mockResponse
          })
        }
        callback(mockResponse)
        return { on: jest.fn() }
      })

      // Mock extract to succeed
      fsSync.createReadStream.mockReturnValueOnce({
        pipe: jest.fn(() => ({
          on: jest.fn(function(this: any, event: string, cb: () => void) {
            if (event === 'close') setTimeout(cb, 0)
            return this
          })
        }))
      })

      await downloader.downloadModel()

      // Verify progress was tracked
      expect(progressCallback).toHaveBeenCalledWith({
        bytesDownloaded: 500,
        totalBytes: 1000,
        percentage: 50
      })
      expect(progressCallback).toHaveBeenCalledWith({
        bytesDownloaded: 1000,
        totalBytes: 1000,
        percentage: 100
      })
    })

    it('should clean up temp file on failure', async () => {
      // Model doesn't exist
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
      mockFs.mkdir.mockResolvedValueOnce(undefined)
      mockFs.unlink.mockResolvedValueOnce(undefined)

      mockHttpsGet.mockImplementationOnce((_url: string, callback: (res: any) => void) => {
        const mockResponse = {
          statusCode: 500,
          headers: {}
        }
        callback(mockResponse)
        return { on: jest.fn() }
      })

      await expect(downloader.downloadModel()).rejects.toThrow('Failed to download: HTTP 500')

      // Verify cleanup was attempted
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('vosk-model-en-us-0.22.zip'))
    })

    it('should handle network errors gracefully', async () => {
      // Model doesn't exist
      mockFs.stat.mockRejectedValueOnce(new Error('ENOENT'))
      mockFs.mkdir.mockResolvedValueOnce(undefined)
      mockFs.unlink.mockResolvedValueOnce(undefined)

      mockHttpsGet.mockImplementationOnce((_url: string, _callback: (res: any) => void) => {
        return {
          on: jest.fn((event: string, handler: (err: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Network error')), 0)
            }
          })
        }
      })

      await expect(downloader.downloadModel()).rejects.toThrow('Network error')
    })
  })
})
