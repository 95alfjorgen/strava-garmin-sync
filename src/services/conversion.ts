import { createRequire } from 'module';
import type { StravaActivity, StravaActivityStreams } from '../types/strava';

// Use createRequire to import CommonJS module in ESM context
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fitsdk: any = require('@garmin/fitsdk');
const { Encoder, Profile } = fitsdk;

// Message numbers from Profile.MesgNum
const MesgNum = Profile.MesgNum;

// FIT Protocol constants
const FIT = {
  File: { activity: 4 },
  Manufacturer: { development: 255 },
  Activity: { manual: 0 },
  Event: { timer: 0, session: 8, lap: 9, activity: 26 },
  EventType: { start: 0, stop: 1, stopAll: 4 },
  SessionTrigger: { activityEnd: 0 },
  LapTrigger: { sessionEnd: 0 },
  Sport: {
    generic: 0,
    running: 1,
    cycling: 2,
    transition: 3,
    fitnessEquipment: 4,
    swimming: 5,
    tennis: 8,
    training: 10,
    walking: 11,
    crossCountrySkiing: 12,
    alpineSkiing: 13,
    snowboarding: 14,
    rowing: 15,
    hiking: 17,
    eBiking: 21,
    golf: 25,
    kayaking: 41,
    standUpPaddleboarding: 37,
  },
  SubSport: {
    generic: 0,
    treadmill: 1,
    trail: 3,
    mountain: 8,
    gravelCycling: 46,
    virtualActivity: 58,
    strengthTraining: 20,
    yoga: 43,
    elliptical: 15,
  },
};

// Strava to Garmin sport type mapping
const SPORT_TYPE_MAP: Record<string, { sport: number; subSport: number }> = {
  // Running
  Run: { sport: FIT.Sport.running, subSport: FIT.SubSport.generic },
  TrailRun: { sport: FIT.Sport.running, subSport: FIT.SubSport.trail },
  VirtualRun: { sport: FIT.Sport.running, subSport: FIT.SubSport.treadmill },
  // Cycling
  Ride: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.generic },
  MountainBikeRide: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.mountain },
  GravelRide: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.gravelCycling },
  VirtualRide: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.virtualActivity },
  EBikeRide: { sport: FIT.Sport.eBiking, subSport: FIT.SubSport.generic },
  // Swimming
  Swim: { sport: FIT.Sport.swimming, subSport: FIT.SubSport.generic },
  // Walking/Hiking
  Walk: { sport: FIT.Sport.walking, subSport: FIT.SubSport.generic },
  Hike: { sport: FIT.Sport.hiking, subSport: FIT.SubSport.generic },
  // Fitness
  Workout: { sport: FIT.Sport.fitnessEquipment, subSport: FIT.SubSport.generic },
  WeightTraining: { sport: FIT.Sport.fitnessEquipment, subSport: FIT.SubSport.strengthTraining },
  Yoga: { sport: FIT.Sport.training, subSport: FIT.SubSport.yoga },
  // Winter Sports
  AlpineSki: { sport: FIT.Sport.alpineSkiing, subSport: FIT.SubSport.generic },
  NordicSki: { sport: FIT.Sport.crossCountrySkiing, subSport: FIT.SubSport.generic },
  Snowboard: { sport: FIT.Sport.snowboarding, subSport: FIT.SubSport.generic },
  // Water Sports
  Rowing: { sport: FIT.Sport.rowing, subSport: FIT.SubSport.generic },
  Kayaking: { sport: FIT.Sport.kayaking, subSport: FIT.SubSport.generic },
  StandUpPaddling: { sport: FIT.Sport.standUpPaddleboarding, subSport: FIT.SubSport.generic },
  // Other
  Elliptical: { sport: FIT.Sport.fitnessEquipment, subSport: FIT.SubSport.elliptical },
  Golf: { sport: FIT.Sport.golf, subSport: FIT.SubSport.generic },
  Tennis: { sport: FIT.Sport.tennis, subSport: FIT.SubSport.generic },
};

/**
 * Convert degrees to semicircles (FIT format for GPS coordinates)
 */
function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (2147483648 / 180));
}

/**
 * Convert Strava activity and streams to FIT file
 */
export function convertToFit(
  activity: StravaActivity,
  streams: StravaActivityStreams
): Buffer {
  const encoder = new Encoder();

  // Get sport type mapping
  const sportType = SPORT_TYPE_MAP[activity.sport_type] ||
                    SPORT_TYPE_MAP[activity.type] ||
                    { sport: FIT.Sport.generic, subSport: FIT.SubSport.generic };

  // Parse start time - FIT uses seconds since UTC 00:00 Dec 31 1989
  const startTime = new Date(activity.start_date);
  const fitEpoch = new Date('1989-12-31T00:00:00Z').getTime();
  const startTimestamp = Math.floor((startTime.getTime() - fitEpoch) / 1000);
  const endTimestamp = startTimestamp + activity.elapsed_time;

  // Write file ID message (must be first)
  encoder.writeMesg({
    mesgNum: MesgNum.FILE_ID,
    type: FIT.File.activity,
    manufacturer: FIT.Manufacturer.development,
    product: 0,
    serialNumber: 12345,
    timeCreated: startTimestamp,
  });

  // Write start event
  encoder.writeMesg({
    mesgNum: MesgNum.EVENT,
    timestamp: startTimestamp,
    event: FIT.Event.timer,
    eventType: FIT.EventType.start,
  });

  // Write record messages if streams are available
  if (streams.time?.data) {
    const timeData = streams.time.data;
    const latlngData = streams.latlng?.data;
    const altitudeData = streams.altitude?.data;
    const heartrateData = streams.heartrate?.data;
    const cadenceData = streams.cadence?.data;
    const powerData = streams.watts?.data;
    const distanceData = streams.distance?.data;

    for (let i = 0; i < timeData.length; i++) {
      const recordTimestamp = startTimestamp + timeData[i];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const record: Record<string, any> = {
        mesgNum: MesgNum.RECORD,
        timestamp: recordTimestamp,
      };

      // Add GPS coordinates (semicircles)
      if (latlngData && latlngData[i]) {
        const [lat, lng] = latlngData[i];
        record.positionLat = degreesToSemicircles(lat);
        record.positionLong = degreesToSemicircles(lng);
      }

      // Add altitude (scaled, in meters)
      if (altitudeData && altitudeData[i] !== undefined) {
        record.altitude = altitudeData[i];
      }

      // Add heart rate
      if (heartrateData && heartrateData[i] !== undefined) {
        record.heartRate = heartrateData[i];
      }

      // Add cadence
      if (cadenceData && cadenceData[i] !== undefined) {
        record.cadence = cadenceData[i];
      }

      // Add power
      if (powerData && powerData[i] !== undefined) {
        record.power = powerData[i];
      }

      // Add distance (cumulative, in meters)
      if (distanceData && distanceData[i] !== undefined) {
        record.distance = distanceData[i];
      }

      encoder.writeMesg(record);
    }
  }

  // Write stop event
  encoder.writeMesg({
    mesgNum: MesgNum.EVENT,
    timestamp: endTimestamp,
    event: FIT.Event.timer,
    eventType: FIT.EventType.stopAll,
  });

  // Write lap message
  encoder.writeMesg({
    mesgNum: MesgNum.LAP,
    timestamp: endTimestamp,
    startTime: startTimestamp,
    totalElapsedTime: activity.elapsed_time,
    totalTimerTime: activity.moving_time,
    sport: sportType.sport,
    subSport: sportType.subSport,
    totalDistance: activity.distance,
    totalAscent: Math.round(activity.total_elevation_gain),
    avgSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
    avgCadence: activity.average_cadence ? Math.round(activity.average_cadence) : undefined,
    event: FIT.Event.lap,
    eventType: FIT.EventType.stop,
    lapTrigger: FIT.LapTrigger.sessionEnd,
  });

  // Write session message
  encoder.writeMesg({
    mesgNum: MesgNum.SESSION,
    timestamp: endTimestamp,
    startTime: startTimestamp,
    totalElapsedTime: activity.elapsed_time,
    totalTimerTime: activity.moving_time,
    sport: sportType.sport,
    subSport: sportType.subSport,
    totalDistance: activity.distance,
    totalAscent: Math.round(activity.total_elevation_gain),
    avgSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
    avgCadence: activity.average_cadence ? Math.round(activity.average_cadence) : undefined,
    avgPower: activity.average_watts ? Math.round(activity.average_watts) : undefined,
    totalCalories: activity.kilojoules ? Math.round(activity.kilojoules * 0.239) : undefined,
    event: FIT.Event.session,
    eventType: FIT.EventType.stop,
    trigger: FIT.SessionTrigger.activityEnd,
    firstLapIndex: 0,
    numLaps: 1,
  });

  // Write activity message
  encoder.writeMesg({
    mesgNum: MesgNum.ACTIVITY,
    timestamp: endTimestamp,
    totalTimerTime: activity.moving_time,
    numSessions: 1,
    type: FIT.Activity.manual,
    event: FIT.Event.activity,
    eventType: FIT.EventType.stop,
    localTimestamp: startTimestamp,
  });

  // Close encoder and get the file data
  const fileData = encoder.close();

  return Buffer.from(fileData);
}

/**
 * Generate a filename for the FIT file
 */
export function generateFileName(activity: StravaActivity): string {
  const date = new Date(activity.start_date);
  const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const activityType = activity.sport_type || activity.type || 'activity';
  return `${dateStr}_${activityType}_${activity.id}.fit`;
}
