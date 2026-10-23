import type { CustomSectionProps } from "./index";

/** Generic example: a 3-column feature grid driven by `product.materials`. */
export default function ExampleFeatureGrid({ product }: CustomSectionProps) {
  if (product.materials.length === 0) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {product.materials.map((item) => (
        <div key={item} className="rounded-store bg-store-muted p-4 text-center text-sm font-medium">
          {item}
        </div>
      ))}
    </section>
  );
}
