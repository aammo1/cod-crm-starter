import { toOzonPhone } from "@/lib/phone";
import type { OrderRow } from "@/lib/db";
import type { CreateParcelInput } from "./provider";

export interface ParcelPayloadSnapshot {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  city_id: number | null;
  city_name: string | null;
  total: number;
  items: {
    product_id: string;
    name: string;
    color: string;
    size: string;
    quantity: number;
  }[];
}

export function buildSnapshotObject(order: OrderRow): ParcelPayloadSnapshot {
  const upsellItems =
    order.upsellStatus === "accepted" ? (order.upsellItems ?? []) : [];
  return {
    order_id: order.id,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    address: order.address,
    city_id: order.cityId,
    city_name: order.cityName,
    total: order.total,
    items: [...order.items, ...upsellItems].map((item) => ({
      product_id: item.product_id,
      name: item.name,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
    })),
  };
}

/** Frozen snapshot of the parcel data at job-creation time — later order edits never alter an already-queued parcel. */
export function buildPayloadSnapshot(order: OrderRow): string {
  return JSON.stringify(buildSnapshotObject(order));
}

function snapshotFrom(
  payloadJson: string | null,
  order: OrderRow,
): ParcelPayloadSnapshot {
  if (payloadJson) {
    try {
      const parsed: unknown = JSON.parse(payloadJson);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof (parsed as { order_id?: unknown }).order_id === "string" &&
        typeof (parsed as { customer_phone?: unknown }).customer_phone === "string" &&
        typeof (parsed as { total?: unknown }).total === "number"
      ) {
        return parsed as ParcelPayloadSnapshot;
      }
    } catch {
      // Fall through to a fresh snapshot from the order row.
    }
  }
  return buildSnapshotObject(order);
}

export function buildCreateParcelInput(
  submission: { payload: string | null },
  order: OrderRow,
): CreateParcelInput {
  const snapshot = snapshotFrom(submission.payload, order);
  return {
    receiver: snapshot.customer_name,
    phone: toOzonPhone(snapshot.customer_phone),
    cityId: snapshot.city_id ?? 0,
    address: snapshot.address ?? "",
    priceMad: snapshot.total,
    nature: "Chaussures femme",
    stock: 0,
  };
}
