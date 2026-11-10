// Prepare a drawable surface off the scroll thread. Sending a rendered bitmap
// avoids synchronous image conversion when WebGL uploads the next photograph.
let canvas;
let context;

self.onmessage = async ({ data: { file, url } }) => {
  let decoded;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load photograph');
    decoded = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
    const { width, height } = decoded;
    if (!canvas) {
      canvas = new OffscreenCanvas(width, height);
      context = canvas.getContext('2d', { alpha: false });
    }
    if (!context) throw new Error('An offscreen drawing surface is unavailable');
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    // WebGL cannot flip a transferred ImageBitmap during upload.
    context.setTransform(1, 0, 0, -1, 0, height);
    context.drawImage(decoded, 0, 0);
    const surface = canvas.transferToImageBitmap();
    self.postMessage({ file, surface }, [surface]);
  } catch {
    self.postMessage({ file, failed: true });
  } finally {
    decoded?.close();
  }
};
