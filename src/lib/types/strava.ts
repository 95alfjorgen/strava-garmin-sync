export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: StravaAthlete;
}

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  profile: string;
  profile_medium: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  kilojoules?: number;
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  map?: {
    id: string;
    polyline: string;
    summary_polyline: string;
  };
}

export interface StravaActivityStream {
  type: string;
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface StravaActivityStreams {
  time?: StravaActivityStream;
  distance?: StravaActivityStream;
  latlng?: { type: string; data: [number, number][] };
  altitude?: StravaActivityStream;
  heartrate?: StravaActivityStream;
  cadence?: StravaActivityStream;
  watts?: StravaActivityStream;
  temp?: StravaActivityStream;
}

export interface StravaWebhookEvent {
  aspect_type: 'create' | 'update' | 'delete';
  event_time: number;
  object_id: number;
  object_type: 'activity' | 'athlete';
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
}

export interface StravaWebhookValidation {
  'hub.mode': string;
  'hub.challenge': string;
  'hub.verify_token': string;
}
