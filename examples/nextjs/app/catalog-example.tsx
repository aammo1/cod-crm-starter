import Image from "next/image";
import { crm } from "../lib/crm";

/** Render from your own dynamic page.tsx; this file mounts no route in the CRM. */
export default async function CatalogExample() {
  const { products, settings } = await crm().listCatalog({ limit: 20 });
  return <section aria-label="Catalogue">
    <h1>{settings.storeName}</h1>
    {products.map((product) => <article key={product.id}>
      <h2>{product.name}</h2>
      {product.images[0] && <Image src={product.images[0]} alt={product.name} width={320} height={320} />}
      <p>{product.price} MAD</p>
      <p>{product.description}</p>
      <ul>{product.variants.map((variant) => <li key={variant.id}>
        {variant.options.length ? variant.options.map(({ name, value }) => `${name} : ${value}`).join(" · ") : variant.label}
        {!variant.available && " — Épuisé"}
      </li>)}</ul>
    </article>)}
  </section>;
}
