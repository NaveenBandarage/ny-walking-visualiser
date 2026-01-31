export interface WalkPoint {
  longitude: number;
  latitude: number;
  elevation?: number;
  time?: Date;
}

export interface Walk {
  id: string;
  name: string;
  description?: string;
  summary?: string; // AI-generated summary of the route
  date: Date;
  coordinates: [number, number][];
  points: WalkPoint[];
  distance: number; // in kilometers
  duration: number; // in minutes
  elevationGain?: number;
  elevationLoss?: number;
  color?: [number, number, number, number];
}

export interface WalkStats {
  totalWalks: number;
  totalDistance: number; // in kilometers
  totalDuration: number; // in minutes
  averageDistance: number;
  averageDuration: number;
}

export interface PickedWalk {
  walk: Walk;
  x: number;
  y: number;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}
