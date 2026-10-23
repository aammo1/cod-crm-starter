import type { ImageProps } from "next/image";
// Deep imports on purpose: `next/image` itself pulls the client image component (and its head
// manager) into every route that imports it, even when only getImageProps is used. Next is
// pinned in package.json; re-check these two paths on upgrade.
import { getImgProps } from "next/dist/shared/lib/get-img-props";
import imageLoader from "next/dist/shared/lib/image-loader";
import { preload } from "react-dom";

/**
 * `next/image` without the next/image client component. getImageProps produces the exact same
 * optimizer URLs, srcset and attributes, but the image runtime (head manager, onLoad plumbing,
 * ~5 KB gzip) is not shipped to the browser. Without width/height the image fills its parent,
 * which must be `relative` with a size. `priority` also preloads it, like next/image does.
 */
type Props = {
  src: string; alt: string; sizes: string; className?: string; priority?: boolean;
  width?: number; height?: number;
};

export function StoreImage({ src, alt, sizes, className, priority, width, height }: Props) {
  const input: ImageProps = {
    src, alt, sizes, className,
    ...(width && height ? { width, height } : { fill: true as const }),
    ...(priority ? { priority: true, fetchPriority: "high" as const } : {}),
  };
  const { props } = getImgProps(input, {
    defaultLoader: imageLoader,
    // Replaced at build time by Next's define plugin (server and client), same as next/image.
    imgConf: process.env.__NEXT_IMAGE_OPTS as unknown as Parameters<typeof getImgProps>[1]["imgConf"],
  });
  for (const [key, value] of Object.entries(props)) if (value === undefined) delete (props as Record<string, unknown>)[key];
  if (priority) {
    preload(props.src, { as: "image", imageSrcSet: props.srcSet, imageSizes: props.sizes, fetchPriority: "high" });
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} />;
}
