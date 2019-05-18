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

export interface RegionAck {
  hash: string;
}

export interface ClientUpdateAckPayload {
  regions: Record<string, RegionAck | undefined>;
}

export interface ClickEventPayload {
  regionId: string;
  eventName: string;
}
