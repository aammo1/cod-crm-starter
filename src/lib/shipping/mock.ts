import type {
  City,
  CreateParcelInput,
  CreateParcelResult,
  DeliveryNoteHandles,
  DeliveryProvider,
  ParcelInfoResult,
  PdfFormat,
  TrackingResult,
} from "./provider";

/**
 * Deterministic in-memory provider for scratch tests (tasks 09/14/15).
 * Status values are obviously fake ("MOCK_*") and never reach Ozon.
 *
 * `trackingStatuses` (and setTrackingStatus) let tests choose the raw status
 * each code reports from track() — default remains "MOCK_CREATED". Codes must
 * be registered via createParcel(); setTrackingStatus only overrides the
 * status their track() entry reports.
 *
 * In the running app a single shared instance is used (see getProvider in
 * ./index.ts); this factory stays instantiable for isolated tests.
 */
export interface MockProviderOptions {
  trackingStatuses?: Map<string, string>;
}

export function createMockProvider(
  options: MockProviderOptions = {},
): DeliveryProvider & { setTrackingStatus(trackingNumber: string, status: string): void } {
  const trackingStatuses = options.trackingStatuses ?? new Map<string, string>();
  const cities: City[] = [
    { id: 1, name: "Casablanca" },
    { id: 2, name: "Rabat" },
    { id: 3, name: "Marrakech" },
    { id: 4, name: "Fès" },
    { id: 5, name: "Agadir" },
  ];
  const parcels = new Map<string, CreateParcelInput>();
  const notes = new Map<string, { codes: string[]; saved: boolean }>();
  // Per-instance boot id keeps generated numbers unique across process
  // restarts (the sequence alone restarts at 1 and would collide with codes
  // already stored in the database).
  const bootId = Date.now().toString(36).toUpperCase();
  let parcelSeq = 0;
  let noteSeq = 0;

  return {
    async listCities(): Promise<City[]> {
      return cities.map((city) => ({ ...city }));
    },
    async createParcel(input: CreateParcelInput): Promise<CreateParcelResult> {
      parcelSeq += 1;
      const trackingNumber = `OZEMOCK${bootId}${String(parcelSeq).padStart(9, "0")}`;
      parcels.set(trackingNumber, input);
      return {
        trackingNumber,
        raw: {
          "TRACKING-NUMBER": trackingNumber,
          RECEIVER: input.receiver,
          PRICE: String(input.priceMad),
        },
      };
    },
    async getParcelInfo(trackingNumber: string): Promise<ParcelInfoResult> {
      const input = parcels.get(trackingNumber);
      if (!input) return { raw: null };
      return {
        raw: {
          "TRACKING-NUMBER": trackingNumber,
          RECEIVER: input.receiver,
          PRICE: String(input.priceMad),
        },
        trackingNumber,
      };
    },
    async track(trackingNumbers: string[]): Promise<TrackingResult[]> {
      return trackingNumbers.map((trackingNumber) => {
        // Codes minted by an earlier process are still known to this stateless
        // mock (its in-memory registry does not survive restarts).
        const found = parcels.has(trackingNumber) || trackingNumber.startsWith("OZEMOCK");
        const status = trackingStatuses.get(trackingNumber) ?? "MOCK_CREATED";
        return {
          trackingNumber,
          rawStatus: found ? status : null,
          raw: found ? { status } : null,
          found,
        };
      });
    },
    setTrackingStatus(trackingNumber: string, status: string): void {
      trackingStatuses.set(trackingNumber, status);
    },
    async createDeliveryNote(): Promise<DeliveryNoteHandles> {
      noteSeq += 1;
      const ref = `BLMOCK${bootId}${String(noteSeq).padStart(6, "0")}`;
      notes.set(ref, { codes: [], saved: false });
      return { ref };
    },
    async addParcelsToDeliveryNote(ref: string, codes: string[]): Promise<void> {
      const note = notes.get(ref);
      if (note) note.codes.push(...codes);
    },
    async saveDeliveryNote(ref: string): Promise<void> {
      const note = notes.get(ref);
      if (note) note.saved = true;
    },
    deliveryNotePdfUrl(ref: string, format: PdfFormat): string {
      return `mock://pdf/${format}/${encodeURIComponent(ref)}`;
    },
  };
}
