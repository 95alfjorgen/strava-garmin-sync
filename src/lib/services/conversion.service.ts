import { Encoder, Stream } from '@garmin/fitsdk';
import type { StravaActivity, StravaActivityStreams } from '@/lib/types/strava';

// FIT Protocol constants (from FIT SDK profile)
const FIT = {
  File: { activity: 4 },
  Manufacturer: { development: 255 },
  Activity: { manual: 0 },
  Event: { timer: 0, session: 8, lap: 9, activity: 26 },
  EventType: { start: 0, stop: 1, stop_all: 4 },
  SessionTrigger: { activity_end: 0 },
  LapTrigger: { session_end: 0 },
  Sport: {
    generic: 0,
    running: 1,
    cycling: 2,
    transition: 3,
    fitness_equipment: 4,
    swimming: 5,
    tennis: 8,
    training: 10,
    walking: 11,
    cross_country_skiing: 12,
    alpine_skiing: 13,
    snowboarding: 14,
    rowing: 15,
    hiking: 17,
    e_biking: 21,
    golf: 25,
    kayaking: 41,
    stand_up_paddleboarding: 37,
  },
  SubSport: {
    generic: 0,
    treadmill: 1,
    trail: 3,
    mountain: 8,
    gravel_cycling: 46,
    virtual_activity: 58,
    strength_training: 20,
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
  GravelRide: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.gravel_cycling },
  VirtualRide: { sport: FIT.Sport.cycling, subSport: FIT.SubSport.virtual_activity },
  EBikeRide: { sport: FIT.Sport.e_biking, subSport: FIT.SubSport.generic },
  // Swimming
  Swim: { sport: FIT.Sport.swimming, subSport: FIT.SubSport.generic },
  // Walking/Hiking
  Walk: { sport: FIT.Sport.walking, subSport: FIT.SubSport.generic },
  Hike: { sport: FIT.Sport.hiking, subSport: FIT.SubSport.generic },
  // Fitness
  Workout: { sport: FIT.Sport.fitness_equipment, subSport: FIT.SubSport.generic },
  WeightTraining: { sport: FIT.Sport.fitness_equipment, subSport: FIT.SubSport.strength_training },
  Yoga: { sport: FIT.Sport.training, subSport: FIT.SubSport.yoga },
  // Winter Sports
  AlpineSki: { sport: FIT.Sport.alpine_skiing, subSport: FIT.SubSport.generic },
  NordicSki: { sport: FIT.Sport.cross_country_skiing, subSport: FIT.SubSport.generic },
  Snowboard: { sport: FIT.Sport.snowboarding, subSport: FIT.SubSport.generic },
  // Water Sports
  Rowing: { sport: FIT.Sport.rowing, subSport: FIT.SubSport.generic },
  Kayaking: { sport: FIT.Sport.kayaking, subSport: FIT.SubSport.generic },
  StandUpPaddling: { sport: FIT.Sport.stand_up_paddleboarding, subSport: FIT.SubSport.generic },
  // Other
  Elliptical: { sport: FIT.Sport.fitness_equipment, subSport: FIT.SubSport.elliptical },
  Golf: { sport: FIT.Sport.golf, subSport: FIT.SubSport.generic },
  Tennis: { sport: FIT.Sport.tennis, subSport: FIT.SubSport.generic },
};

export class ConversionService {
  private static instance: ConversionService;

  static getInstance(): ConversionService {
    if (!ConversionService.instance) {
      ConversionService.instance = new ConversionService();
    }
    return ConversionService.instance;
  }

  /**
   * Convert Strava activity and streams to FIT file
   */
  convertToFit(
    activity: StravaActivity,
    streams: StravaActivityStreams
  ): Buffer {
    const stream = new Stream();
    const encoder = new Encoder(stream);

    // Get sport type mapping
    const sportType = SPORT_TYPE_MAP[activity.sport_type] ||
                      SPORT_TYPE_MAP[activity.type] ||
                      { sport: FIT.Sport.generic, subSport: FIT.SubSport.generic };

    // Parse start time
    const startTime = new Date(activity.start_date);
    const startTimestamp = Math.floor(startTime.getTime() / 1000);

    // Write file ID message
    encoder.writeFileId({
      type: FIT.File.activity,
      manufacturer: FIT.Manufacturer.development,
      product: 0,
      serialNumber: 12345,
      timeCreated: startTimestamp,
    });

    // Write activity message
    encoder.writeMessage('activity', {
      timestamp: startTimestamp,
      totalTimerTime: activity.moving_time,
      numSessions: 1,
      type: FIT.Activity.manual,
      event: FIT.Event.activity,
      eventType: FIT.EventType.stop,
      localTimestamp: startTimestamp,
    });

    // Write session message
    encoder.writeMessage('session', {
      timestamp: startTimestamp + activity.elapsed_time,
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
      trigger: FIT.SessionTrigger.activity_end,
    });

    // Write lap message
    encoder.writeMessage('lap', {
      timestamp: startTimestamp + activity.elapsed_time,
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
      lapTrigger: FIT.LapTrigger.session_end,
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
      const tempData = streams.temp?.data;

      for (let i = 0; i < timeData.length; i++) {
        const recordTimestamp = startTimestamp + timeData[i];

        const record: Record<string, number | undefined> = {
          timestamp: recordTimestamp,
        };

        // Add GPS coordinates (semicircles)
        if (latlngData && latlngData[i]) {
          const [lat, lng] = latlngData[i];
          record.positionLat = this.degreesToSemicircles(lat);
          record.positionLong = this.degreesToSemicircles(lng);
        }

        // Add altitude
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

        // Add temperature
        if (tempData && tempData[i] !== undefined) {
          record.temperature = tempData[i];
        }

        encoder.writeMessage('record', record);
      }
    }

    // Write event messages
    encoder.writeMessage('event', {
      timestamp: startTimestamp,
      event: FIT.Event.timer,
      eventType: FIT.EventType.start,
    });

    encoder.writeMessage('event', {
      timestamp: startTimestamp + activity.elapsed_time,
      event: FIT.Event.timer,
      eventType: FIT.EventType.stop_all,
    });

    // Close encoder
    encoder.close();

    // Get the buffer from the stream
    return Buffer.from(stream.getBuffer());
  }

  /**
   * Convert degrees to semicircles (FIT format for GPS coordinates)
   */
  private degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * (2147483648 / 180));
  }

  /**
   * Generate a filename for the FIT file
   */
  generateFileName(activity: StravaActivity): string {
    const date = new Date(activity.start_date);
    const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const activityType = activity.sport_type || activity.type || 'activity';
    return `${dateStr}_${activityType}_${activity.id}.fit`;
  }
}

export const conversionService = ConversionService.getInstance();
