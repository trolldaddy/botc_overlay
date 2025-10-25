(function (global) {
  const helper = {};
  const DEFAULT_CHUNK_SIZE = 4800;
  const DEFAULT_MODE = 'gzip/base64';
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  function chunkString(text, size) {
    if (typeof text !== 'string' || !text) {
      return [];
    }

    const chunks = [];
    for (let index = 0; index < text.length; index += size) {
      chunks.push(text.slice(index, index + size));
    }
    return chunks;
  }

  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function collectStream(readable) {
    const reader = readable.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }

    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  async function compressToBase64(text) {
    if (!textEncoder || typeof text !== 'string') {
      return null;
    }

    if (typeof CompressionStream === 'undefined') {
      return null;
    }

    try {
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();

      await writer.write(textEncoder.encode(text));
      await writer.close();

      const compressedBytes = await collectStream(stream.readable);
      return {
        base64: uint8ToBase64(compressedBytes),
        originalLength: text.length,
        compressedLength: compressedBytes.length
      };
    } catch (err) {
      console.warn('CompressionStream 壓縮失敗:', err);
      return null;
    }
  }

  async function decompressFromBase64(base64) {
    if (!textDecoder || typeof base64 !== 'string') {
      return '';
    }

    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream API is not supported');
    }

    try {
      const bytes = base64ToUint8(base64);
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      await writer.write(bytes);
      await writer.close();

      const decompressedBytes = await collectStream(stream.readable);
      return textDecoder.decode(decompressedBytes);
    } catch (err) {
      console.warn('DecompressionStream 解壓縮失敗:', err);
      throw err;
    }
  }

  helper.MAX_CHUNK_SIZE = DEFAULT_CHUNK_SIZE;
  helper.COMPRESSION_MODE = DEFAULT_MODE;
  helper.compressToBase64 = compressToBase64;
  helper.decompressFromBase64 = decompressFromBase64;
  helper.chunkString = (text, size = DEFAULT_CHUNK_SIZE) => chunkString(text, size);

  global.CompressionHelper = helper;
}(typeof window !== 'undefined' ? window : globalThis));
