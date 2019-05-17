export interface ClientReadyPayload {
  regionIds: string[];
}

export interface RegionInit {
  source: string;
  hash: string;
  templateData: unknown;
}

export interface InitPayload {
  regions: Record<string, RegionInit | undefined>;
}
