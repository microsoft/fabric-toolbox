import type { 
  ADFRecurrence, 
  FabricScheduleConfig,
  CronScheduleConfig,
  DailyScheduleConfig,
  WeeklyScheduleConfig,
  MonthlyScheduleConfig,
  DayOfWeek
} from '../types';

/**
 * Service for converting ADF/Synapse schedule triggers to Fabric schedule configurations
 * Handles intelligent mapping based on complexity and frequency patterns
 * 
 * Mapping Strategy:
 * - Simple periodic (Minute/Hour/Day/Week without schedule object) → Cron
 * - Day + schedule (specific times) → Daily
 * - Week + schedule (specific days/times) → Weekly  
 * - Month + schedule (specific dates/times) → Monthly
 */
export class ScheduleConversionService {
  
  /**
   * Main conversion method - determines appropriate Fabric schedule type
   * Based on ADF recurrence frequency and presence of nested schedule object
   */
  convertADFToFabricSchedule(adfRecurrence: ADFRecurrence): FabricScheduleConfig {
    const { frequency, schedule } = adfRecurrence;
    
    console.log('[SCHEDULE CONVERSION] Converting ADF recurrence:', {
      frequency,
      interval: adfRecurrence.interval,
      hasScheduleObject: Boolean(schedule)
    });
    
    // Complex schedules with nested schedule object
    if (schedule) {
      if (frequency === 'Day' && schedule.minutes && schedule.hours) {
        console.log('[SCHEDULE CONVERSION] Using Daily schedule type');
        return this.convertToDailySchedule(adfRecurrence);
      }
      if (frequency === 'Week' && schedule.weekDays) {
        console.log('[SCHEDULE CONVERSION] Using Weekly schedule type');
        return this.convertToWeeklySchedule(adfRecurrence);
      }
      if (frequency === 'Month' && schedule.monthDays) {
        console.log('[SCHEDULE CONVERSION] Using Monthly schedule type');
        return this.convertToMonthlySchedule(adfRecurrence);
      }
    }
    
    // Simple periodic schedules → Cron type
    console.log('[SCHEDULE CONVERSION] Using Cron schedule type');
    return this.convertToCronSchedule(adfRecurrence);
  }

  /**
   * Convert to Cron type (periodic execution at fixed intervals)
   * Used for: Minute, Hour, Day, Week, Month frequencies without schedule object
   */
  private convertToCronSchedule(adfRecurrence: ADFRecurrence): CronScheduleConfig {
    const { frequency, interval, startTime, endTime, timeZone } = adfRecurrence;
    
    let intervalInMinutes = interval;
    
    // Convert to minutes based on frequency
    switch (frequency) {
      case 'Minute':
        intervalInMinutes = interval;
        break;
      case 'Hour':
        intervalInMinutes = interval * 60;
        break;
      case 'Day':
        intervalInMinutes = interval * 1440; // 24 * 60
        break;
      case 'Week':
        intervalInMinutes = interval * 10080; // 7 * 24 * 60
        break;
      case 'Month':
        // Approximate: 30 days (Fabric max is 10 years = 5270400 minutes)
        intervalInMinutes = interval * 43200; // 30 * 24 * 60
        console.warn('[SCHEDULE CONVERSION] Month frequency approximated to 30 days');
        break;
    }
    
    // Validate max interval (10 years = 5270400 minutes)
    if (intervalInMinutes > 5270400) {
      console.warn(`[SCHEDULE CONVERSION] Interval ${intervalInMinutes} exceeds max (5270400), capping`);
      intervalInMinutes = 5270400;
    }
    
    if (intervalInMinutes < 1) {
      console.warn(`[SCHEDULE CONVERSION] Interval ${intervalInMinutes} below min (1), setting to 1`);
      intervalInMinutes = 1;
    }
    
    return {
      type: 'Cron',
      startDateTime: this.convertToISO8601(startTime),
      endDateTime: this.convertToISO8601(endTime || this.calculateDefaultEndTime(startTime)),
      localTimeZoneId: timeZone,
      interval: intervalInMinutes
    };
  }

  /**
   * Convert to Daily schedule (specific times each day)
   * Example: Run at 2:33 AM and 5:00 PM every day
   */
  private convertToDailySchedule(adfRecurrence: ADFRecurrence): DailyScheduleConfig {
    const { schedule, startTime, endTime, timeZone } = adfRecurrence;
    
    if (!schedule?.minutes || !schedule?.hours) {
      throw new Error('Daily schedule requires minutes and hours in schedule object');
    }
    
    // Generate all time slot combinations (Cartesian product)
    const times: string[] = [];
    for (const hour of schedule.hours) {
      for (const minute of schedule.minutes) {
        times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    
    // Validate max 100 time slots
    if (times.length > 100) {
      console.warn(`[SCHEDULE CONVERSION] Daily schedule has ${times.length} time slots, max is 100. Truncating.`);
      times.length = 100;
    }
    
    console.log(`[SCHEDULE CONVERSION] Created Daily schedule with ${times.length} time slots:`, times);
    
    return {
      type: 'Daily',
      startDateTime: this.convertToISO8601(startTime),
      endDateTime: this.convertToISO8601(endTime || this.calculateDefaultEndTime(startTime)),
      localTimeZoneId: timeZone,
      times: times.sort() // Sort chronologically
    };
  }

  /**
   * Convert to Weekly schedule (specific days and times)
   * Example: Run on Monday, Wednesday, Friday at 9:00 AM
   */
  private convertToWeeklySchedule(adfRecurrence: ADFRecurrence): WeeklyScheduleConfig {
    const { schedule, startTime, endTime, timeZone } = adfRecurrence;
    
    if (!schedule?.weekDays || !schedule?.minutes || !schedule?.hours) {
      throw new Error('Weekly schedule requires weekDays, minutes, and hours');
    }
    
    // Generate time slots (Cartesian product)
    const times: string[] = [];
    for (const hour of schedule.hours) {
      for (const minute of schedule.minutes) {
        times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    
    if (times.length > 100) {
      console.warn(`[SCHEDULE CONVERSION] Weekly schedule has ${times.length} time slots, truncating to 100`);
      times.length = 100;
    }
    
    // Convert ADF weekday names to Fabric format
    // ADF uses full names like "Monday", Fabric expects same format
    const weekdays: DayOfWeek[] = schedule.weekDays.map(day => {
      return day as DayOfWeek;
    });
    
    if (weekdays.length > 7) {
      console.warn('[SCHEDULE CONVERSION] Weekly schedule cannot have more than 7 weekdays, truncating');
      weekdays.length = 7;
    }
    
    console.log(`[SCHEDULE CONVERSION] Created Weekly schedule with ${weekdays.length} days × ${times.length} times`);
    
    return {
      type: 'Weekly',
      startDateTime: this.convertToISO8601(startTime),
      endDateTime: this.convertToISO8601(endTime || this.calculateDefaultEndTime(startTime)),
      localTimeZoneId: timeZone,
      times: times.sort(),
      weekdays: weekdays
    };
  }

  /**
   * Convert to Monthly schedule (specific day of month and times)
   * Example: Run on the 15th of each month at 3:00 AM
   * 
   * Note: ADF supports multiple monthDays, but Fabric supports only ONE occurrence.
   * We use the first monthDay if multiple are provided.
   */
  private convertToMonthlySchedule(adfRecurrence: ADFRecurrence): MonthlyScheduleConfig {
    const { schedule, interval, startTime, endTime, timeZone } = adfRecurrence;
    
    if (!schedule?.monthDays || !schedule?.minutes || !schedule?.hours) {
      throw new Error('Monthly schedule requires monthDays, minutes, and hours');
    }
    
    // Generate time slots (Cartesian product)
    const times: string[] = [];
    for (const hour of schedule.hours) {
      for (const minute of schedule.minutes) {
        times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    
    if (times.length > 100) {
      console.warn(`[SCHEDULE CONVERSION] Monthly schedule has ${times.length} time slots, truncating to 100`);
      times.length = 100;
    }
    
    // Use first monthDay for occurrence
    // Note: ADF supports multiple monthDays, Fabric supports only one occurrence
    const dayOfMonth = schedule.monthDays[0];
    
    if (schedule.monthDays.length > 1) {
      console.warn(`[SCHEDULE CONVERSION] ADF trigger has ${schedule.monthDays.length} monthDays, Fabric supports 1. Using first: ${dayOfMonth}`);
    }
    
    console.log(`[SCHEDULE CONVERSION] Created Monthly schedule: recurrence=${interval}, day=${dayOfMonth}, ${times.length} time slots`);
    
    return {
      type: 'Monthly',
      startDateTime: this.convertToISO8601(startTime),
      endDateTime: this.convertToISO8601(endTime || this.calculateDefaultEndTime(startTime)),
      localTimeZoneId: timeZone,
      recurrence: interval, // Monthly interval (1-12)
      occurrence: {
        occurrenceType: 'DayOfMonth',
        dayOfMonth: dayOfMonth
      },
      times: times.sort()
    };
  }

  /**
   * Convert ADF time format to ISO 8601
   * ADF: "2025-10-15T17:16:00" → Fabric: "2025-10-15T17:16:00Z"
   */
  private convertToISO8601(dateTime: string): string {
    if (!dateTime) {
      throw new Error('DateTime is required');
    }
    
    // If already has timezone indicator, return as-is
    if (dateTime.endsWith('Z') || dateTime.includes('+') || dateTime.match(/-\d{2}:\d{2}$/)) {
      return dateTime;
    }
    
    // Assume UTC if no timezone
    return dateTime + 'Z';
  }

  /**
   * Calculate default end time (1 year from start)
   */
  private calculateDefaultEndTime(startTime: string): string {
    const start = new Date(startTime);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1); // Default: 1 year
    return end.toISOString();
  }

  /**
   * Generate user-friendly description of schedule for UI display
   */
  getScheduleDescription(config: FabricScheduleConfig): string {
    switch (config.type) {
      case 'Cron':
        if (config.interval === 1) {
          return 'Every minute';
        } else if (config.interval < 60) {
          return `Every ${config.interval} minutes`;
        } else if (config.interval === 60) {
          return 'Every hour';
        } else if (config.interval < 1440) {
          const hours = Math.floor(config.interval / 60);
          return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
        } else if (config.interval === 1440) {
          return 'Every day';
        } else if (config.interval < 10080) {
          const days = Math.floor(config.interval / 1440);
          return `Every ${days} day${days > 1 ? 's' : ''}`;
        } else if (config.interval === 10080) {
          return 'Every week';
        } else {
          const weeks = Math.floor(config.interval / 10080);
          return `Every ${weeks} week${weeks > 1 ? 's' : ''}`;
        }
      
      case 'Daily':
        const timeCount = config.times.length;
        if (timeCount === 1) {
          return `Daily at ${config.times[0]}`;
        }
        return `Daily at ${timeCount} time${timeCount > 1 ? 's' : ''}: ${config.times.slice(0, 3).join(', ')}${timeCount > 3 ? '...' : ''}`;
      
      case 'Weekly':
        const dayCount = config.weekdays.length;
        const dayList = dayCount <= 3 ? config.weekdays.join(', ') : `${config.weekdays.slice(0, 2).join(', ')}... (${dayCount} days)`;
        const weekTimeCount = config.times.length;
        return `Weekly on ${dayList} at ${weekTimeCount} time${weekTimeCount > 1 ? 's' : ''}`;
      
      case 'Monthly':
        const occ = config.occurrence;
        const occDesc = occ.occurrenceType === 'DayOfMonth' 
          ? `day ${occ.dayOfMonth}` 
          : `${occ.weekIndex} ${occ.weekday}`;
        const monthlyRecurrence = config.recurrence === 1 ? 'Monthly' : `Every ${config.recurrence} months`;
        const monthTimeCount = config.times.length;
        return `${monthlyRecurrence} on ${occDesc} at ${monthTimeCount} time${monthTimeCount > 1 ? 's' : ''}`;
      
      default:
        return 'Unknown schedule type';
    }
  }

  /**
   * Get detailed schedule configuration summary for validation display
   */
  getScheduleSummary(config: FabricScheduleConfig): {
    type: string;
    description: string;
    details: string[];
  } {
    const details: string[] = [];
    details.push(`Start: ${new Date(config.startDateTime).toLocaleString()}`);
    details.push(`End: ${new Date(config.endDateTime).toLocaleString()}`);
    details.push(`Time Zone: ${config.localTimeZoneId}`);

    switch (config.type) {
      case 'Cron':
        details.push(`Interval: ${config.interval} minutes`);
        break;
      case 'Daily':
        details.push(`Time slots: ${config.times.join(', ')}`);
        break;
      case 'Weekly':
        details.push(`Weekdays: ${config.weekdays.join(', ')}`);
        details.push(`Time slots: ${config.times.join(', ')}`);
        break;
      case 'Monthly':
        details.push(`Recurrence: Every ${config.recurrence} month(s)`);
        const occ = config.occurrence;
        if (occ.occurrenceType === 'DayOfMonth') {
          details.push(`Day: ${occ.dayOfMonth}`);
        } else {
          details.push(`Day: ${occ.weekIndex} ${occ.weekday}`);
        }
        details.push(`Time slots: ${config.times.join(', ')}`);
        break;
    }

    return {
      type: config.type,
      description: this.getScheduleDescription(config),
      details
    };
  }
}

export const scheduleConversionService = new ScheduleConversionService();
