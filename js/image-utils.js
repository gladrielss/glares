// Shared image handling for uploads.
//
// Phones shoot 4-12MP photos and screenshots come out as multi-megabyte PNGs,
// but the feed renders them ~170-350px wide and the detail page caps at 70vh.
// Uploading originals meant the feed was pulling ~50MB of images per page load
// to display a few hundred KB worth of pixels. Everything is downscaled and
// re-encoded in the browser before it ever leaves the device.

const IMAGE_MAX_EDGE = 1400;   // generous for retina full-screen viewing
const IMAGE_QUALITY = 0.82;

// A feed/grid card never renders wider than ~230px (2 columns on mobile) or
// taller than ~350px, so 480px covers a 2x-retina card with room to spare.
// This is what actually blew through the Supabase free-tier egress quota:
// every grid — feed, trending, profile, search, The Cut — was pulling the
// full 1400px original to show a few hundred pixels of it, repeatedly, for
// every viewer, on every load.
const IMAGE_THUMB_MAX_EDGE = 480;
const IMAGE_THUMB_QUALITY = 0.75;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image. Try a different file.")); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// Draws `img` onto a canvas capped at `maxEdge` on its long side and encodes
// it, preferring WebP. A browser that can't encode WebP doesn't fail —
// toBlob quietly hands back a PNG instead, which would be both larger than
// the original and saved under a lying .webp name — so the type actually
// returned is checked, not just that something came back.
async function encodeAtSize(img, maxEdge, quality) {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  // Flatten onto white: JPEG/WebP have no alpha, and transparent PNG areas
  // would otherwise encode as black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  let blob = await canvasToBlob(canvas, "image/webp", quality);
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    ext = "jpg";
  }
  return { blob, width: outW, height: outH, ext, scale };
}

// Returns { blob, width, height, name } ready to upload. Dimensions are the
// *encoded* ones, so callers can persist them and render <img width height>
// to reserve exact layout space before the bytes arrive.
async function prepareImageForUpload(file, { maxEdge = IMAGE_MAX_EDGE } = {}) {
  const { img, url } = await loadImageElement(file);
  try {
    const sized = await encodeAtSize(img, maxEdge, IMAGE_QUALITY);
    // If re-encoding somehow made it bigger (already-optimised small files),
    // keep the original bytes but still report the true dimensions.
    if (sized.blob && sized.blob.size >= file.size && sized.scale === 1) {
      return { blob: file, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob: sized.blob, width: sized.width, height: sized.height, name: `${base}.${sized.ext}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Same idea, but decodes the source file once and encodes it twice — a full
// size for the detail view, and a small one for every grid/feed context —
// so every upload gets both without paying to decode the image twice.
// Returns { full: {blob,width,height,name}, thumb: {blob,width,height,name} }.
async function prepareImageWithThumbnail(file, { maxEdge = IMAGE_MAX_EDGE } = {}) {
  const { img, url } = await loadImageElement(file);
  try {
    const base = file.name.replace(/\.[^.]+$/, "") || "image";

    const fullSized = await encodeAtSize(img, maxEdge, IMAGE_QUALITY);
    const full = (fullSized.blob && fullSized.blob.size >= file.size && fullSized.scale === 1)
      ? { blob: file, width: img.naturalWidth, height: img.naturalHeight, name: file.name }
      : { blob: fullSized.blob, width: fullSized.width, height: fullSized.height, name: `${base}.${fullSized.ext}` };

    const thumbSized = await encodeAtSize(img, IMAGE_THUMB_MAX_EDGE, IMAGE_THUMB_QUALITY);
    const thumb = { blob: thumbSized.blob, width: thumbSized.width, height: thumbSized.height, name: `${base}-thumb.${thumbSized.ext}` };

    return { full, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}
