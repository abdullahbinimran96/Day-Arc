// Pure Offline Namaz Calculation Engine
// Method: University of Islamic Sciences, Karachi
// Asr Madhab: Hanafi (Shadow Factor: 2)

class NamazCalculator {
  constructor() {
    this.methods = {
      Karachi: {
        fajrAngle: 18,
        ishaAngle: 18,
        name: 'University of Islamic Sciences, Karachi'
      }
    };

    // Pre-populated offline cities database
    this.cities = [
      { name: 'Karachi', country: 'Pakistan', lat: 24.8607, lng: 67.0011, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Lahore', country: 'Pakistan', lat: 31.5204, lng: 74.3587, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Islamabad', country: 'Pakistan', lat: 33.6844, lng: 73.0479, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Rawalpindi', country: 'Pakistan', lat: 33.5651, lng: 73.0169, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Faisalabad', country: 'Pakistan', lat: 31.4504, lng: 73.1350, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Multan', country: 'Pakistan', lat: 30.1575, lng: 71.5249, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Peshawar', country: 'Pakistan', lat: 34.0151, lng: 71.5249, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'Quetta', country: 'Pakistan', lat: 30.1798, lng: 66.9750, timezone: 'Asia/Karachi', gmtOffset: 5 },
      { name: 'London', country: 'United Kingdom', lat: 51.5074, lng: -0.1278, timezone: 'Europe/London', gmtOffset: 0 },
      { name: 'Manchester', country: 'United Kingdom', lat: 53.4808, lng: -2.2426, timezone: 'Europe/London', gmtOffset: 0 },
      { name: 'Birmingham', country: 'United Kingdom', lat: 52.4862, lng: -1.8904, timezone: 'Europe/London', gmtOffset: 0 },
      { name: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lng: 55.2708, timezone: 'Asia/Dubai', gmtOffset: 4 },
      { name: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4539, lng: 54.3773, timezone: 'Asia/Dubai', gmtOffset: 4 },
      { name: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lng: 46.6753, timezone: 'Asia/Riyadh', gmtOffset: 3 },
      { name: 'Makkah', country: 'Saudi Arabia', lat: 21.3891, lng: 39.8579, timezone: 'Asia/Riyadh', gmtOffset: 3 },
      { name: 'Madinah', country: 'Saudi Arabia', lat: 24.5247, lng: 39.5692, timezone: 'Asia/Riyadh', gmtOffset: 3 },
      { name: 'New York', country: 'United States', lat: 40.7128, lng: -74.0060, timezone: 'America/New_York', gmtOffset: -4 },
      { name: 'Chicago', country: 'United States', lat: 41.8781, lng: -87.6298, timezone: 'America/Chicago', gmtOffset: -5 },
      { name: 'Houston', country: 'United States', lat: 29.7604, lng: -95.3698, timezone: 'America/Chicago', gmtOffset: -5 },
      { name: 'Los Angeles', country: 'United States', lat: 34.0522, lng: -118.2437, timezone: 'America/Los_Angeles', gmtOffset: -7 },
      { name: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832, timezone: 'America/Toronto', gmtOffset: -4 },
      { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lng: 28.9784, timezone: 'Europe/Istanbul', gmtOffset: 3 },
      { name: 'Dhaka', country: 'Bangladesh', lat: 23.8103, lng: 90.4125, timezone: 'Asia/Dhaka', gmtOffset: 6 },
      { name: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090, timezone: 'Asia/Kolkata', gmtOffset: 5.5 },
      { name: 'Mumbai', country: 'India', lat: 19.0760, lng: 72.8777, timezone: 'Asia/Kolkata', gmtOffset: 5.5 },
      { name: 'Kuala Lumpur', country: 'Malaysia', lat: 3.1390, lng: 101.6869, timezone: 'Asia/Kuala_Lumpur', gmtOffset: 8 },
      { name: 'Jakarta', country: 'Indonesia', lat: -6.2088, lng: 106.8456, timezone: 'Asia/Jakarta', gmtOffset: 7 },
      { name: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093, timezone: 'Australia/Sydney', gmtOffset: 10 }
    ];
  }

  degToRad(d) {
    return (d * Math.PI) / 180.0;
  }

  radToDeg(r) {
    return (r * 180.0) / Math.PI;
  }

  dsin(d) {
    return Math.sin(this.degToRad(d));
  }

  dcos(d) {
    return Math.cos(this.degToRad(d));
  }

  dtan(d) {
    return Math.tan(this.degToRad(d));
  }

  darcsin(x) {
    return this.radToDeg(Math.asin(x));
  }

  darccos(x) {
    return this.radToDeg(Math.acos(x));
  }

  darctan2(y, x) {
    return this.radToDeg(Math.atan2(y, x));
  }

  darccot(x) {
    return this.radToDeg(Math.atan(1.0 / x));
  }

  fixHour(h) {
    h = h - 24.0 * Math.floor(h / 24.0);
    return h < 0 ? h + 24.0 : h;
  }

  julianDate(year, month, day) {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = 357.529 + 0.98560028 * D;
    const q = 280.459 + 0.98564736 * D;
    const L = q + 1.915 * this.dsin(g) + 0.020 * this.dsin(2 * g);
    const e = 23.439 - 0.00000036 * D;
    const RA = this.darctan2(this.dcos(e) * this.dsin(L), this.dcos(L)) / 15.0;
    const declination = this.darcsin(this.dsin(e) * this.dsin(L));
    const eqOfTime = q / 15.0 - this.fixHour(RA);
    return { declination, eqOfTime };
  }

  computeMidDay(eqOfTime, lng, gmtOffset) {
    return this.fixHour(12 + gmtOffset - lng / 15.0 - eqOfTime);
  }

  computeSunAngleTime(angle, midDay, lat, declination, direction = 'ccw') {
    const val = (-this.dsin(angle) - this.dsin(lat) * this.dsin(declination)) /
                (this.dcos(lat) * this.dcos(declination));
    if (val < -1.0 || val > 1.0) return null;
    const T = (1.0 / 15.0) * this.darccos(val);
    return direction === 'ccw' ? midDay - T : midDay + T;
  }

  computeAsrTime(shadowFactor, midDay, lat, declination) {
    // shadowFactor: 2 for Hanafi
    const D = shadowFactor + this.dtan(Math.abs(lat - declination));
    const angle = this.darccot(D);
    return this.computeSunAngleTime(-angle, midDay, lat, declination, 'cw');
  }

  formatTime(decHours) {
    if (decHours === null || isNaN(decHours)) return '--:--';
    decHours = this.fixHour(decHours + 0.5 / 60.0); // round to nearest minute
    const hours = Math.floor(decHours);
    const minutes = Math.floor((decHours - hours) * 60);
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  calculate(date = new Date(), lat = 24.8607, lng = 67.0011, gmtOffset = 5) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const jd = this.julianDate(year, month, day);
    const { declination, eqOfTime } = this.sunPosition(jd);

    const midDay = this.computeMidDay(eqOfTime, lng, gmtOffset);

    // Karachi method: Fajr angle 18°, Isha angle 18°
    const fajrHours = this.computeSunAngleTime(18, midDay, lat, declination, 'ccw');
    const sunriseHours = this.computeSunAngleTime(0.833, midDay, lat, declination, 'ccw');
    const dhuhrHours = midDay + (1.0 / 60.0); // Solar noon + 1 min buffer
    const asrHours = this.computeAsrTime(2.0, midDay, lat, declination); // Hanafi: shadowFactor = 2
    const sunsetHours = this.computeSunAngleTime(0.833, midDay, lat, declination, 'cw');
    const maghribHours = sunsetHours + (2.0 / 60.0); // Maghrib = Sunset + 2 min buffer
    const ishaHours = this.computeSunAngleTime(18, midDay, lat, declination, 'cw');

    return {
      fajr: this.formatTime(fajrHours),
      sunrise: this.formatTime(sunriseHours),
      zuhr: this.formatTime(dhuhrHours),
      asr: this.formatTime(asrHours),
      maghrib: this.formatTime(maghribHours),
      isha: this.formatTime(ishaHours),
      raw: {
        fajr: fajrHours,
        sunrise: sunriseHours,
        zuhr: dhuhrHours,
        asr: asrHours,
        maghrib: maghribHours,
        isha: ishaHours
      }
    };
  }

  findCity(query) {
    if (!query) return this.cities;
    const q = query.toLowerCase();
    return this.cities.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.country.toLowerCase().includes(q)
    );
  }
}

module.exports = new NamazCalculator();
