import { CompactDiff } from './diff';

export type LeanFormData = Record<string, string | undefined>;

export interface ElementInfo {
  id: string;
  dataset: Record<string, string | undefined>;
  nodeName: string;
}

export interface FormInfo extends ElementInfo {
  name: string;
  data: LeanFormData;
}

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

export interface FullUpdatePayload {
  regionId: string;
  source: string;
  hash: string;
}

export interface DiffUpdatePayload {
  regionId: string;
  diff: CompactDiff;
  fromHash: string;
  hash: string;
}

export interface BaseEventPayload {
  regionId: string;
  event: string;
  sender: ElementInfo;
}

export interface ClickEventPayload extends BaseEventPayload {}

export interface FormChangeEventPayload extends BaseEventPayload {
  sender: FormInfo;
}
