export interface City {
  id: number;
  name: string;
}

export interface CreateParcelInput {
  receiver: string;
  /** Local Moroccan format 06XXXXXXXX — converted by the caller, re-validated here. */
  phone: string;
  cityId: number;
  address: string;
  /** Final COD amount in integer MAD. */
  priceMad: number;
  declaredValueMad?: number;
  note?: string;
  nature?: string;
  /** 1 = Ozon stock, 0 = ramassage — this CRM sends 0 (docs/operations.md). */
  stock: 0 | 1;
  /** 1 = opening allowed, 2 = not allowed — NOT a 0/1 boolean (docs/operations.md). */
  open?: 1 | 2;
  fragile?: 0 | 1;
  replace?: 0 | 1;
  products?: { ref: string; qty: number }[];
  /** Only sent when OZON_USE_CUSTOM_TRACKING=1 — semantics unverified, keep off (docs §9.5). */
  customTrackingCode?: string;
}

export interface CreateParcelResult {
  trackingNumber: string;
  raw: unknown;
}

export interface ParcelInfoResult {
  raw: unknown;
  trackingNumber?: string;
}

export interface TrackingResult {
  trackingNumber: string;
  rawStatus: string | null;
  raw: unknown;
  found: boolean;
}

export interface DeliveryNoteHandles {
  ref: string;
}

export type PdfFormat = "standard" | "a4" | "tickets10x10";

/**
 * Courier abstraction. Business logic (submission worker, tracking poller)
 * only ever sees these typed results and ProviderError kinds — never raw
 * courier response shapes.
 */
export interface DeliveryProvider {
  listCities(): Promise<City[]>;
  createParcel(input: CreateParcelInput): Promise<CreateParcelResult>;
  getParcelInfo(trackingNumber: string): Promise<ParcelInfoResult>;
  /** Caller decides batch size; the implementation sends one bulk JSON request. */
  track(trackingNumbers: string[]): Promise<TrackingResult[]>;
  createDeliveryNote(): Promise<DeliveryNoteHandles>;
  addParcelsToDeliveryNote(ref: string, codes: string[]): Promise<void>;
  saveDeliveryNote(ref: string): Promise<void>;
  /** Built server-side only — never shipped to the client bundle. */
  deliveryNotePdfUrl(ref: string, format: PdfFormat): string;
}
