// Single source for next.config.ts (images.deviceSizes/imageSizes) and the client-side gallery
// image, which builds optimizer URLs itself to avoid shipping next's image helpers.
export const DEVICE_SIZES = [360, 414, 640, 768, 1024, 1280, 1600];
export const IMAGE_SIZES = [64, 96, 128, 256, 384];
