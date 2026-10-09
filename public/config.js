window.EVENT_CONFIG = {
  organizerName: "Stichting Bharat Cultuur Friesland",
  organizerShortName: "SBCF",
  eventName: "Diwali Celebration 2026",
  eventDateLabel: "Date to be confirmed",
  eventTimeLabel: "Time to be confirmed",
  venueName: "Venue to be confirmed",
  venueAddress: "",
  contactEmail: "Update organizer email",
  whatsappUrl: "",

  // Registration categories and contribution amounts.
  currency: "EUR",
  feeRegular12Plus: 20,  // Age 12+ (non-student)
  feeUnder12: 0,        // Below 12
  feeStudent: 15,       // Student rate

  // Enable after final date/time is confirmed. Use local event time in YYYYMMDDTHHMMSS.
  calendarEnabled: false,
  calendarStart: "",
  calendarEnd: "",

  // Required after deploying Code.gs from Google Apps Script.

  maxAttendeesPerRegistration: 30
};

// Google Apps Script is now configured server-side in Cloudflare as APPS_SCRIPT_URL.
