'use strict';

const { HttpError } = require('./util');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Read image dimensions without decoding the image. This keeps the upload
 * service dependency-free while still rejecting decompression-bomb-sized files.
 */
function jpegDimensions(buffer) {
  let offset = 2;

  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1];
    offset += 2;

    while (marker === 0xff) {
      marker = buffer[offset];
      offset += 1;
    }

    // Standalone markers do not carry a length field.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += length;
  }

  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunk === 'VP8X' && dataOffset + 10 <= buffer.length) {
      return {
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3)
      };
    }

    if (chunk === 'VP8 ' && dataOffset + 10 <= buffer.length) {
      if (
        buffer[dataOffset + 3] === 0x9d &&
        buffer[dataOffset + 4] === 0x01 &&
        buffer[dataOffset + 5] === 0x2a
      ) {
        return {
          width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
          height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
        };
      }
    }

    if (chunk === 'VP8L' && dataOffset + 5 <= buffer.length && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff)
      };
    }

    const padding = chunkSize % 2;
    offset = dataOffset + chunkSize + padding;
  }

  return null;
}

function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      mime: 'image/jpeg',
      ext: 'jpg',
      readDimensions: jpegDimensions
    };
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mime: 'image/png',
      ext: 'png',
      readDimensions: pngDimensions
    };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return {
      mime: 'image/webp',
      ext: 'webp',
      readDimensions: webpDimensions
    };
  }

  return null;
}

function decodeImageDataUrl(dataUrl, config) {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new HttpError(400, 'missing_image', 'Please choose a photo to share.');
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) {
    throw new HttpError(
      400,
      'invalid_image',
      'The photo could not be read. Please choose a JPEG, PNG, or WebP image.'
    );
  }

  const declaredMime = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    throw new HttpError(
      415,
      'unsupported_image_type',
      'Please use a JPEG, PNG, or WebP photo.'
    );
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  } catch {
    throw new HttpError(400, 'invalid_image', 'The photo could not be read. Please try another file.');
  }

  if (!buffer.length) {
    throw new HttpError(400, 'invalid_image', 'The selected file is empty.');
  }

  if (buffer.length > config.maxUploadBytes) {
    throw new HttpError(
      413,
      'image_too_large',
      `That photo is too large. Please keep it under ${Math.round(
        config.maxUploadBytes / (1024 * 1024)
      )} MB.`
    );
  }

  const type = detectImageType(buffer);
  if (!type) {
    throw new HttpError(
      415,
      'unsupported_image_type',
      'That file is not a valid JPEG, PNG, or WebP photo.'
    );
  }

  if (declaredMime !== type.mime) {
    throw new HttpError(
      415,
      'image_type_mismatch',
      'The file contents do not match the selected image type. Please try another photo.'
    );
  }

  const dimensions = type.readDimensions(buffer);
  if (!dimensions || !dimensions.width || !dimensions.height) {
    throw new HttpError(
      400,
      'invalid_image',
      'The photo dimensions could not be read. Please try another file.'
    );
  }

  if (
    dimensions.width > config.maxImageDimension ||
    dimensions.height > config.maxImageDimension ||
    dimensions.width * dimensions.height > config.maxImagePixels
  ) {
    throw new HttpError(
      413,
      'image_dimensions_too_large',
      'That photo has extremely large dimensions. Please resize it and try again.'
    );
  }

  return {
    buffer,
    mime: type.mime,
    ext: type.ext,
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.length
  };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  decodeImageDataUrl,
  detectImageType
};
