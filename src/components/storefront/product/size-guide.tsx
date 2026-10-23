import { storeConfig } from "@/config";
import { t } from "@/config/i18n";

export function SizeGuide({ category }: { category: string }) {
  const guide = storeConfig.product.sizeGuides[category];
  if (!guide) return null;
  return (
    <details className="rounded-store border border-store-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {guide.title || t(storeConfig.locale, "sizeGuide")}
      </summary>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {guide.headers.map((h) => (
                <th key={h} className="border-b border-store-border py-2 pe-3 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="border-b border-store-border py-2 pe-3">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
