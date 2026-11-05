import type { OverviewMetadata, OverviewOptions, OverviewSource, ParseOverviewOptions } from '../types.js';
export interface AiModePlace {
  title: string;
  index: number;
  /** Raw values observed in the place-card header; omitted when that row is absent. */
  type?: string;
  priceLevel?: string;
  status?: string;
  /** Only an explicitly labelled data-place-id; CID/MID/directions identifiers are not converted. */
  placeId?: string;
  /** Only a visible tel: link, never inferred from a Call button. */
  phone?: string;
  rating?: number;
  reviews?: string;
  thumbnail?: string;
  website?: string;
  directions?: string;
  address?: string;
}
export interface AiModeImage { url: string; alt?: string }
export interface AiModeTurn {
  /** From an actual "AI Mode reply for ..." heading, never inferred from the request. */
  prompt?: string;
  text: string;
  markdown?: string;
  sources: OverviewSource[];
  places?: AiModePlace[];
  images?: AiModeImage[];
}
export interface AiModeResult {
  status: 'present' | 'blocked' | 'unverified';
  query: string;
  /** Latest turn's prompt, only when an actual reply heading supplied it. */
  prompt?: string;
  text?: string;
  markdown?: string;
  sources: OverviewSource[];
  places?: AiModePlace[];
  images?: AiModeImage[];
  /** Only turns actually present in the supplied snapshot; no inferred conversation history. */
  turns: AiModeTurn[];
  reason: string;
  metadata: OverviewMetadata;
}
export type AiModeOptions = OverviewOptions;
export type ParseAiModeOptions = ParseOverviewOptions;
