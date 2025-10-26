(function (global) {
  const helper = {};
  const DEFAULT_CHUNK_SIZE = 4500;
  const DEFAULT_MODE = 'gzip/base64';
  const LEGACY_LZMA_MODE = 'lzma/base64';
  const LEGACY_GZIP_MODE = 'gzip/base64';
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  const LZW_EOF_CODE = 256;
  const LZW_INITIAL_WIDTH = 9;
  const LZW_MAX_WIDTH = 16;

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
    if (!bytes || bytes.length === 0) {
      return '';
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToUint8(base64) {
    if (typeof base64 !== 'string' || !base64) {
      return new Uint8Array(0);
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function encodeUtf8(text) {
    if (textEncoder) {
      return textEncoder.encode(text);
    }

    if (typeof text !== 'string' || !text) {
      return new Uint8Array(0);
    }

    const encoded = unescape(encodeURIComponent(text));
    const bytes = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index += 1) {
      bytes[index] = encoded.charCodeAt(index);
    }
    return bytes;
  }

  function decodeUtf8(bytes) {
    if (textDecoder) {
      return textDecoder.decode(bytes);
    }

    if (!bytes || bytes.length === 0) {
      return '';
    }

    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    try {
      return decodeURIComponent(escape(binary));
    } catch (err) {
      console.warn('UTF-8 解碼失敗，使用備援結果:', err);
      return binary;
    }
  }

  function generateLzwCodes(sourceBytes) {
    if (!sourceBytes || sourceBytes.length === 0) {
      return [];
    }

    const dictionary = new Map();
    for (let i = 0; i < 256; i += 1) {
      dictionary.set(String.fromCharCode(i), i);
    }

    let nextCode = LZW_EOF_CODE + 1;
    let codeWidth = LZW_INITIAL_WIDTH;
    const codes = [];

    let phrase = String.fromCharCode(sourceBytes[0]);

    for (let index = 1; index < sourceBytes.length; index += 1) {
      const char = String.fromCharCode(sourceBytes[index]);
      const combined = phrase + char;

      if (dictionary.has(combined)) {
        phrase = combined;
        continue;
      }

      codes.push({ code: dictionary.get(phrase), width: codeWidth });

      if (nextCode < (1 << LZW_MAX_WIDTH)) {
        dictionary.set(combined, nextCode);
        nextCode += 1;
        if (nextCode === (1 << codeWidth) && codeWidth < LZW_MAX_WIDTH) {
          codeWidth += 1;
        }
      }

      phrase = char;
    }

    if (phrase) {
      codes.push({ code: dictionary.get(phrase), width: codeWidth });
    }

    codes.push({ code: LZW_EOF_CODE, width: codeWidth });
    return codes;
  }

  function packCodesToBytes(codes) {
    if (!codes || codes.length === 0) {
      return new Uint8Array(0);
    }

    const output = [];
    let buffer = 0;
    let bitsInBuffer = 0;

    for (let index = 0; index < codes.length; index += 1) {
      const { code, width } = codes[index];
      buffer = (buffer << width) | code;
      bitsInBuffer += width;

      while (bitsInBuffer >= 8) {
        bitsInBuffer -= 8;
        output.push((buffer >> bitsInBuffer) & 0xff);
        buffer &= (1 << bitsInBuffer) - 1;
      }
    }

    if (bitsInBuffer > 0) {
      output.push((buffer << (8 - bitsInBuffer)) & 0xff);
    }

    return new Uint8Array(output);
  }

  function unpackBytesToCodes(bytes) {
    if (!bytes || bytes.length === 0) {
      return [];
    }

    let index = 0;
    let current = 0;
    let bitsRemaining = 0;
    const codes = [];
    let codeWidth = LZW_INITIAL_WIDTH;
    let nextCode = LZW_EOF_CODE + 1;

    function readBits(length) {
      let value = 0;
      for (let i = 0; i < length; i += 1) {
        if (bitsRemaining === 0) {
          if (index >= bytes.length) {
            return null;
          }
          current = bytes[index];
          index += 1;
          bitsRemaining = 8;
        }

        bitsRemaining -= 1;
        value = (value << 1) | ((current >> bitsRemaining) & 1);
      }
      return value;
    }

    while (true) {
      const value = readBits(codeWidth);
      if (value === null) {
        break;
      }

      codes.push({ code: value, width: codeWidth });

      if (value === LZW_EOF_CODE) {
        break;
      }

      if (nextCode < (1 << LZW_MAX_WIDTH)) {
        nextCode += 1;
        if (nextCode === (1 << codeWidth) && codeWidth < LZW_MAX_WIDTH) {
          codeWidth += 1;
        }
      }
    }

    return codes;
  }

  function reconstructBytesFromCodes(codes) {
    if (!codes || codes.length === 0) {
      return new Uint8Array(0);
    }

    const dictionary = new Array(1 << LZW_MAX_WIDTH);
    for (let i = 0; i < 256; i += 1) {
      dictionary[i] = String.fromCharCode(i);
    }

    const firstCode = codes[0]?.code;
    if (typeof firstCode !== 'number' || firstCode === LZW_EOF_CODE) {
      return new Uint8Array(0);
    }

    let nextCode = LZW_EOF_CODE + 1;
    let previous = dictionary[firstCode] || '';
    const output = [previous];

    for (let index = 1; index < codes.length; index += 1) {
      const { code } = codes[index];
      if (code === LZW_EOF_CODE) {
        break;
      }

      let entry;
      if (dictionary[code] != null) {
        entry = dictionary[code];
      } else if (code === nextCode) {
        entry = previous + previous.charAt(0);
      } else {
        throw new Error('Invalid LZW code encountered');
      }

      output.push(entry);

      if (nextCode < (1 << LZW_MAX_WIDTH)) {
        dictionary[nextCode] = previous + entry.charAt(0);
        nextCode += 1;
      }

      previous = entry;
    }

    let totalLength = 0;
    for (let i = 0; i < output.length; i += 1) {
      totalLength += output[i].length;
    }

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < output.length; i += 1) {
      const fragment = output[i];
      for (let j = 0; j < fragment.length; j += 1) {
        bytes[offset] = fragment.charCodeAt(j);
        offset += 1;
      }
    }

    return bytes;
  }

  async function gzipCompress(bytes) {
    if (typeof CompressionStream !== 'function') {
      throw new Error('瀏覽器不支援 CompressionStream');
    }

    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();

    const response = new Response(stream.readable);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async function compressToBase64(text) {
    if (typeof text !== 'string') {
      return null;
    }

    const utf8Bytes = encodeUtf8(text);
    if (!utf8Bytes || utf8Bytes.length === 0) {
      return {
        base64: '',
        originalLength: 0,
        compressedLength: 0,
        compressedByteLength: 0,
        mode: DEFAULT_MODE
      };
    }

    if (typeof CompressionStream === 'function') {
      try {
        const compressedBytes = await gzipCompress(utf8Bytes);
        const base64 = uint8ToBase64(compressedBytes);
        return {
          base64,
          originalLength: utf8Bytes.length,
          compressedLength: base64.length,
          compressedByteLength: compressedBytes.length,
          mode: DEFAULT_MODE
        };
      } catch (err) {
        console.warn('Gzip 壓縮失敗，將改用備援模式:', err);
      }
    }

    try {
      const codes = generateLzwCodes(utf8Bytes);
      if (!codes || codes.length === 0) {
        return null;
      }

      const compressedBytes = packCodesToBytes(codes);
      const base64 = uint8ToBase64(compressedBytes);
      return {
        base64,
        originalLength: utf8Bytes.length,
        compressedLength: base64.length,
        compressedByteLength: compressedBytes.length,
        mode: LEGACY_LZMA_MODE
      };
    } catch (err) {
      console.warn('LZW 壓縮失敗，將回退為未壓縮模式:', err);
      return null;
    }
  }

  async function decompressGzip(base64) {
    const bytes = base64ToUint8(base64);
    if (bytes.length === 0) {
      return '';
    }

    if (typeof DecompressionStream === 'function') {
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      await writer.write(bytes);
      await writer.close();
      const response = new Response(stream.readable);
      const buffer = await response.arrayBuffer();
      return decodeUtf8(new Uint8Array(buffer));
    }

    throw new Error('瀏覽器不支援 Gzip 解壓縮');
  }

  async function decompressFromBase64(base64, mode = DEFAULT_MODE) {
    if (typeof base64 !== 'string' || !base64) {
      return '';
    }

    if (mode === LEGACY_GZIP_MODE || mode === DEFAULT_MODE) {
      return decompressGzip(base64);
    }

    if (mode === LEGACY_LZMA_MODE) {
      try {
        const compressed = base64ToUint8(base64);
        const codes = unpackBytesToCodes(compressed);
        const decompressed = reconstructBytesFromCodes(codes);
        return decodeUtf8(decompressed);
      } catch (err) {
        console.warn('LZW 解壓縮失敗:', err);
        throw err;
      }
    }

    try {
      const compressed = base64ToUint8(base64);
      const codes = unpackBytesToCodes(compressed);
      const decompressed = reconstructBytesFromCodes(codes);
      return decodeUtf8(decompressed);
    } catch (err) {
      console.warn('未知壓縮模式，嘗試使用 gzip 備援:', err);
      return decompressGzip(base64);
    }
  }

  helper.MAX_CHUNK_SIZE = DEFAULT_CHUNK_SIZE;
  helper.COMPRESSION_MODE = DEFAULT_MODE;
  helper.LEGACY_LZMA_MODE = LEGACY_LZMA_MODE;
  helper.LEGACY_GZIP_MODE = LEGACY_GZIP_MODE;
  helper.compressToBase64 = compressToBase64;
  helper.decompressFromBase64 = decompressFromBase64;
  helper.chunkString = (text, size = DEFAULT_CHUNK_SIZE) => chunkString(text, size);

  global.CompressionHelper = helper;
}(typeof window !== 'undefined' ? window : globalThis));
