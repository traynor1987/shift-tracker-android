import {
  LIVE_DATA_START_AT,
  QUICK_TASK_CATEGORIES,
  QUICK_TASK_JOBS,
  migrateAppData,
  normaliseQuickTaskLabel,
  prepareAppDataForBackup,
  validateData,
  type AppData,
  type QuickTaskCategoryId,
} from "./domain.ts";

export const BACKUP_KIND = "dominos-shift-tracker-backup" as const;
export const BACKUP_FORMAT_VERSION = 1 as const;
export const BACKUP_VALIDATION_PROFILE = "nested-record-validation-v1" as const;

export interface BackupRecordCounts {
  shifts: number;
  deliveries: number;
  activities: number;
  routePoints: number;
  payments: number;
  cleaningTasks: number;
  betaShifts: number;
}

export interface ShiftTrackerBackup {
  kind: typeof BACKUP_KIND;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  appVersion: string;
  schemaVersion: 1;
  recordCounts: BackupRecordCounts;
  validation: { profile: typeof BACKUP_VALIDATION_PROFILE };
  data: AppData;
}

export interface BackupPreview {
  createdAt: string | null;
  appVersion: string;
  schemaVersion: number;
  formatVersion: number | null;
  counts: BackupRecordCounts;
  dateFrom: string | null;
  dateTo: string | null;
  hasBetaRecords: boolean;
  historicalFormat: boolean;
  warnings: string[];
}

export type BackupValidationResult =
  | { ok: true; data: AppData; preview: BackupPreview }
  | { ok: false; message: string; issues: string[] };

type UnknownRecord = Record<string, unknown>;
type ValidationContext = { issues: string[]; warnings: string[]; enforceRelationships: boolean };
export type AppDataValidationOptions = { enforceRelationships?: boolean };

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value && typeof value === "object" && !Array.isArray(value));
const validDateOnly = (value: unknown) => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const validDate = (value: unknown) => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validDateOnly(match[1]) || !Number.isFinite(Date.parse(value))) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false;
  if (match[5] !== "Z") {
    const [offsetHour, offsetMinute] = match[5].slice(1).split(":").map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
};
const validNullableDate = (value: unknown) => value == null || validDate(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const stringValue = (value: unknown): value is string => typeof value === "string";
const oneOf = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const validPreTrackerAdjustment = (value: unknown) =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    integer(value.grossPayPence) &&
    nonNegative(value.grossPayPence) &&
    integer(value.paidMs) &&
    nonNegative(value.paidMs));
const validPayslipSnapshot = (value: unknown) =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    integer(value.grossPayPence) &&
    nonNegative(value.grossPayPence) &&
    integer(value.paidMs) &&
    value.paidMs > 0 &&
    validPreTrackerAdjustment(value.preTrackerAdjustment) &&
    validDate(value.recordedAt) &&
    validDate(value.updatedAt));
const addIssue = (context: ValidationContext, path: string, message: string) => { if (context.issues.length < 12) context.issues.push(`${path}: ${message}`); };

// History edits use minute-precision controls. Older valid records can therefore
// retain up to 59.999 seconds of activity/segment end evidence beyond an
// edited clock-out even though the visible shift time is unchanged. Accept
// only that one-sided, mechanically explainable case. A separately bounded
// five-second allowance preserves an old store marker written by an in-flight
// GPS callback just after clock-out; new callbacks are now guarded. Starts,
// canonical break and delivery records, and larger errors still fail.
const MINUTE_BOUNDARY_COMPATIBILITY_MS = 59_999;
const GEOFENCE_MARKER_COMMIT_GRACE_MS = 5_000;
const minuteAligned = (timestamp: string) => Date.parse(timestamp) % 60_000 === 0;
const startsBeforeShift = (timestamp: string, bounds: { start: string }) => Date.parse(timestamp) < Date.parse(bounds.start);
function endsAfterShift(timestamp: string, bounds: { end: string | null }, allowMinuteCompatibility = false, additionalGraceMs = 0) {
  if (bounds.end == null) return false;
  const minuteTolerance = allowMinuteCompatibility && minuteAligned(bounds.end) ? MINUTE_BOUNDARY_COMPATIBILITY_MS : 0;
  const tolerance = Math.max(minuteTolerance, additionalGraceMs);
  return Date.parse(timestamp) > Date.parse(bounds.end) + tolerance;
}

function validateSegments(value: unknown, path: string, context: ValidationContext, bounds?: { start: string; end: string | null }) {
  if (!Array.isArray(value)) return addIssue(context, path, "expected a list of timed segments");
  value.forEach((segment, index) => {
    if (!isRecord(segment) || !validDate(segment.start) || !validNullableDate(segment.end)) return addIssue(context, `${path}[${index}]`, "invalid segment timestamps");
    if (segment.end != null && Date.parse(segment.end as string) < Date.parse(segment.start as string)) addIssue(context, `${path}[${index}]`, "segment end is before its start");
    if (context.enforceRelationships && bounds && (startsBeforeShift(segment.start as string, bounds) || (segment.end != null && endsAfterShift(segment.end as string, bounds, true)))) addIssue(context, `${path}[${index}]`, "segment falls outside its shift");
  });
}

function validateRoute(route: unknown, path: string, context: ValidationContext) {
  if (!isRecord(route)) return addIssue(context, path, "invalid GPS route");
  if (route.status !== undefined && !oneOf(route.status, ["recording", "complete", "partial", "expired", "disabled"])) addIssue(context, `${path}.status`, "invalid GPS route status");
  if (!validDate(route.startedAt) || (route.completedAt !== undefined && !validNullableDate(route.completedAt))) addIssue(context, path, "invalid GPS route timestamps");
  if (!Array.isArray(route.points)) addIssue(context, `${path}.points`, "GPS route points must be a list");
  else route.points.forEach((point, index) => {
    if (!isRecord(point)) return addIssue(context, `${path}.points[${index}]`, "malformed GPS route point");
    const latitude = Number(point.latitude ?? point.lat);
    const longitude = Number(point.longitude ?? point.lng ?? point.lon);
    const timestamp = point.timestamp ?? point.time;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !(typeof timestamp === "string" || typeof timestamp === "number") || !Number.isFinite(new Date(timestamp).getTime())) addIssue(context, `${path}.points[${index}]`, "invalid GPS coordinates or timestamp");
    if (point.accuracy !== undefined && (!nonNegative(point.accuracy))) addIssue(context, `${path}.points[${index}].accuracy`, "GPS accuracy must be zero or greater");
    if (point.speed != null && !nonNegative(point.speed)) addIssue(context, `${path}.points[${index}].speed`, "GPS speed must be zero or greater");
    if (point.heading != null && !finite(point.heading)) addIssue(context, `${path}.points[${index}].heading`, "GPS heading must be numeric");
  });
  if (route.recordedPointCount !== undefined && (!integer(route.recordedPointCount) || !nonNegative(route.recordedPointCount))) addIssue(context, `${path}.recordedPointCount`, "invalid GPS route count");
  if (route.distanceMetres !== undefined && !nonNegative(route.distanceMetres)) addIssue(context, `${path}.distanceMetres`, "invalid GPS route distance");
  if (route.detail !== undefined && !oneOf(route.detail, ["standard", "high"])) addIssue(context, `${path}.detail`, "invalid GPS detail setting");
  if (route.retention !== undefined && !oneOf(route.retention, ["30", "90", "forever"])) addIssue(context, `${path}.retention`, "invalid GPS retention setting");
  if ((route.expiresAt !== undefined && !validNullableDate(route.expiresAt)) || (route.expiredAt !== undefined && !validNullableDate(route.expiredAt))) addIssue(context, path, "invalid GPS retention timestamp");
  if (route.gaps !== undefined) {
    if (!Array.isArray(route.gaps)) addIssue(context, `${path}.gaps`, "GPS gaps must be a list");
    else route.gaps.forEach((gap, index) => { if (!isRecord(gap) || !validDate(gap.from) || !validDate(gap.to) || !nonNegative(gap.durationMs)) addIssue(context, `${path}.gaps[${index}]`, "malformed GPS gap"); });
  }
  if (route.issues !== undefined) {
    if (!Array.isArray(route.issues)) addIssue(context, `${path}.issues`, "GPS issues must be a list");
    else route.issues.forEach((issue, index) => { if (!isRecord(issue) || !validDate(issue.timestamp) || !oneOf(issue.type, ["permission", "unavailable", "timeout", "resume"]) || !stringValue(issue.message)) addIssue(context, `${path}.issues[${index}]`, "malformed GPS issue"); });
  }
  if (route.stops !== undefined) {
    if (!Array.isArray(route.stops)) addIssue(context, `${path}.stops`, "GPS stops must be a list");
    else route.stops.forEach((stop, index) => { if (!isRecord(stop) || !finite(stop.latitude) || !finite(stop.longitude) || !validDate(stop.startedAt) || !validDate(stop.endedAt) || !nonNegative(stop.durationMs) || !oneOf(stop.kind, ["traffic_delay", "probable_traffic_light"])) addIssue(context, `${path}.stops[${index}]`, "malformed GPS stop"); });
  }
}

function validateExpectedRoute(value: unknown, path: string, context: ValidationContext) {
  if (!isRecord(value)) return addIssue(context, path, "malformed expected-route analysis");
  if (!oneOf(value.status, ["waiting_for_connection", "connection_verified", "snapshot", "ready", "unavailable"]) || !validDate(value.calculatedAt) || value.calculationVersion !== 1 || !nonNegative(value.serviceAllowanceSeconds)) addIssue(context, path, "invalid expected-route status, version or timestamp");
  if (value.customer != null) {
    if (!isRecord(value.customer) || !finite(value.customer.latitude) || value.customer.latitude < -90 || value.customer.latitude > 90 || !finite(value.customer.longitude) || value.customer.longitude < -180 || value.customer.longitude > 180 || (value.customer.accuracy != null && !nonNegative(value.customer.accuracy)) || !oneOf(value.customer.source, ["manual_delivered", "user_selected_route_point", "detected_stop", "gps_estimate"])) addIssue(context, `${path}.customer`, "invalid customer location evidence");
  }
  ["outboundSeconds", "outboundMetres", "returnSeconds", "returnMetres", "totalSeconds", "actualSeconds"].forEach((key) => { if (value[key] !== undefined && !nonNegative(value[key])) addIssue(context, `${path}.${key}`, "must be zero or greater"); });
  if (value.differenceSeconds !== undefined && !finite(value.differenceSeconds)) addIssue(context, `${path}.differenceSeconds`, "must be numeric");
  if (value.routingSource !== undefined && !oneOf(value.routingSource, ["osrm", "google_routes"])) addIssue(context, `${path}.routingSource`, "invalid routing source");
  if (value.travelMode !== undefined && !oneOf(value.travelMode, ["driving", "walking"])) addIssue(context, `${path}.travelMode`, "invalid travel mode");
  if (!optionalBoolean(value.perDeliveryLimitOverride) || !optionalString(value.reason)) addIssue(context, path, "invalid expected-route flags");
  if (value.connectionCheck !== undefined) {
    const check = value.connectionCheck;
    if (!isRecord(check) || !validDate(check.startedAt) || !validDate(check.deadlineAt) || !validDate(check.nextCheckAt) || !integer(check.successfulChecks) || !nonNegative(check.successfulChecks) || !integer(check.attempts) || !nonNegative(check.attempts)) addIssue(context, `${path}.connectionCheck`, "malformed connection-check metadata");
  }
}

function validateDestination(value: unknown, path: string, context: ValidationContext) {
  if (!isRecord(value)) return addIssue(context, path, "malformed delivery destination");
  ["fullAddress", "houseNumberOrName", "street", "locality", "postcode"].forEach((key) => { if (!optionalString(value[key])) addIssue(context, `${path}.${key}`, "must be text"); });
  if (value.destination !== undefined) {
    const destination = value.destination;
    if (!isRecord(destination) || !finite(destination.latitude) || destination.latitude < -90 || destination.latitude > 90 || !finite(destination.longitude) || destination.longitude < -180 || destination.longitude > 180 || (destination.accuracy != null && !nonNegative(destination.accuracy))) addIssue(context, `${path}.destination`, "invalid destination coordinates");
  }
  if (value.addressSource !== undefined && !oneOf(value.addressSource, ["manual", "pasted", "autocomplete", "postcode_lookup", "other"])) addIssue(context, `${path}.addressSource`, "invalid address source");
  if (value.privacyStatus !== undefined && !oneOf(value.privacyStatus, ["precise", "sanitised"])) addIssue(context, `${path}.privacyStatus`, "invalid privacy status");
  if (value.confirmedAt !== undefined && !validDate(value.confirmedAt)) addIssue(context, `${path}.confirmedAt`, "invalid confirmation timestamp");
  if (!optionalBoolean(value.scanned)) addIssue(context, `${path}.scanned`, "expected an on/off value");
}

function validateLocalRoadFeature(value: unknown, path: string, context: ValidationContext) {
  if (!isRecord(value) || !stringValue(value.id) || !value.id || !finite(value.latitude) || value.latitude < -90 || value.latitude > 90 || !finite(value.longitude) || value.longitude < -180 || value.longitude > 180 || !oneOf(value.featureType, ["TRAFFIC_SIGNAL", "JUNCTION", "PEDESTRIAN_CROSSING", "GIVE_WAY", "OTHER"]) || value.source !== "USER_CONFIRMED_LOCAL" || !validDate(value.createdAt) || (value.approachBearing != null && !finite(value.approachBearing)) || !optionalString(value.label)) addIssue(context, path, "malformed local road feature");
}

function validateActivity(activity: unknown, path: string, shiftId: string, deliveryIds: Set<string>, context: ValidationContext, shiftBounds: { start: string; end: string | null }) {
  if (!isRecord(activity)) return addIssue(context, path, "invalid activity record");
  if (!stringValue(activity.id) || !activity.id || activity.shiftId !== shiftId || !oneOf(activity.type, ["clock_in", "clock_out", "single_delivery", "double_delivery", "cleaning_task", "prep_task", "break", "other_task", "blocked_time", "store_exit", "store_entry"]) || !validDate(activity.start) || !validNullableDate(activity.end)) addIssue(context, path, "invalid activity identity, type or timestamps");
  if (validDate(activity.start) && validDate(activity.end) && Date.parse(activity.end as string) < Date.parse(activity.start as string)) addIssue(context, path, "activity end is before its start");
  const lateGeofenceMarkerGrace = activity.type === "store_exit" || activity.type === "store_entry" ? GEOFENCE_MARKER_COMMIT_GRACE_MS : 0;
  if (context.enforceRelationships && validDate(activity.start) && (startsBeforeShift(activity.start as string, shiftBounds) || (validDate(activity.end) && endsAfterShift(activity.end as string, shiftBounds, true, lateGeofenceMarkerGrace)))) addIssue(context, path, "activity falls outside its shift");
  if (activity.deliveryEventId !== undefined && (!stringValue(activity.deliveryEventId) || !deliveryIds.has(activity.deliveryEventId))) addIssue(context, `${path}.deliveryEventId`, "linked delivery event is missing");
  if (activity.segments !== undefined) validateSegments(activity.segments, `${path}.segments`, context, shiftBounds);
  ["quickCompleted", "completedBySomeoneElse"].forEach((key) => { if (!optionalBoolean(activity[key])) addIssue(context, `${path}.${key}`, "expected an on/off value"); });
  if (activity.type === "blocked_time" && (!oneOf(activity.blockedReason, ["waiting_for_instruction", "manager_stopped_task", "no_task_permitted", "nothing_available", "idiot_in_charge", "other"]) || !optionalString(activity.blockedNote))) addIssue(context, path, "malformed blocked-time record");
  if (activity.type !== "blocked_time" && (activity.blockedReason !== undefined || activity.blockedNote !== undefined)) addIssue(context, path, "blocked-time details require a blocked-time activity");
  ["storeExitAt", "storeEntryAt", "storeReturnConfirmedAt", "backAtStoreAt", "dominosStoreExitAt", "dominosStoreEntryAt", "dominosDispatchStartedAt", "dominosGeofenceExitedAt", "realDeliveryStartedAt", "realGeofenceExitedAt"].forEach((key) => { if (activity[key] !== undefined && !validNullableDate(activity[key])) addIssue(context, `${path}.${key}`, "invalid Hustle timestamp"); });
  ["geofenceLatitude", "geofenceLongitude", "geofenceRadius", "locationAccuracy", "dominosGeofenceLatitude", "dominosGeofenceLongitude", "dominosGeofenceRadius"].forEach((key) => { if (activity[key] != null && !finite(activity[key])) addIssue(context, `${path}.${key}`, "expected a numeric location value"); });
  ["earlyDispatchGapSeconds", "dominosHustleSeconds", "realHustleSeconds"].forEach((key) => { if (activity[key] != null && !nonNegative(activity[key])) addIssue(context, `${path}.${key}`, "expected a non-negative duration"); });
  if (activity.storePresenceProof !== undefined) {
    const proof = activity.storePresenceProof;
    if (!isRecord(proof) || proof.version !== 1 || !optionalBoolean(proof.enabledAtStart) || !optionalBoolean(proof.startEnabledAtStart) || !integer(proof.radiusMetres) || Number(proof.radiusMetres) < 5 || Number(proof.radiusMetres) > 15 || !finite(proof.latitude) || !finite(proof.longitude) || !Array.isArray(proof.changes) || proof.changes.length > 24 || !proof.changes.every((item) => isRecord(item) && validDate(item.at) && optionalBoolean(item.enabled))) addIssue(context, `${path}.storePresenceProof`, "invalid store-presence proof");
    else if (proof.startAttempt !== undefined && (!isRecord(proof.startAttempt) || !validDate(proof.startAttempt.at) || !oneOf(proof.startAttempt.outcome, ["confirmed", "not_required"]) || ["latitude", "longitude", "accuracy", "distanceMetres"].some((key) => (proof.startAttempt as UnknownRecord)[key] != null && !finite((proof.startAttempt as UnknownRecord)[key])) || (proof.startAttempt.sampleAt !== undefined && !validDate(proof.startAttempt.sampleAt)))) addIssue(context, `${path}.storePresenceProof.startAttempt`, "invalid store-presence start result");
    else if (proof.returnAttempt !== undefined && (!isRecord(proof.returnAttempt) || !validDate(proof.returnAttempt.at) || !oneOf(proof.returnAttempt.outcome, ["confirmed", "not_required", "not_confirmed"]) || ["latitude", "longitude", "accuracy", "distanceMetres"].some((key) => (proof.returnAttempt as UnknownRecord)[key] != null && !finite((proof.returnAttempt as UnknownRecord)[key])) || (proof.returnAttempt.sampleAt !== undefined && !validDate(proof.returnAttempt.sampleAt)))) addIssue(context, `${path}.storePresenceProof.returnAttempt`, "invalid store-presence return result");
  }
  ["dominosStoreExitObserved", "dominosStoreEntryObserved", "dominosStoreExitUnobserved", "dominosStoreEntryUnobserved", "dominosStartedOutsideStore", "wasEarlyDispatched"].forEach((key) => { if (!optionalBoolean(activity[key])) addIssue(context, `${path}.${key}`, "expected an on/off value"); });
  if (activity.routeEvidence != null) validateRoute(activity.routeEvidence, `${path}.routeEvidence`, context);
  if (activity.customerEvents !== undefined) {
    if (!Array.isArray(activity.customerEvents)) addIssue(context, `${path}.customerEvents`, "Delivered events must be a list");
    else activity.customerEvents.forEach((event, index) => { if (!isRecord(event) || !validDate(event.timestamp) || !oneOf(event.source, ["manual_delivered", "user_selected_route_point"]) || (event.latitude != null && !finite(event.latitude)) || (event.longitude != null && !finite(event.longitude)) || (event.accuracy != null && !nonNegative(event.accuracy)) || (event.pointIndex != null && (!integer(event.pointIndex) || event.pointIndex < 0))) addIssue(context, `${path}.customerEvents[${index}]`, "malformed Delivered event"); });
  }
  if (activity.customerWaitExplanation != null) {
    const wait = activity.customerWaitExplanation;
    if (!isRecord(wait) || !oneOf(wait.status, ["recorded", "skipped"]) || !Array.isArray(wait.reasons) || !wait.reasons.every((reason) => oneOf(reason, ["no_answer_door", "no_answer_phone", "slow_to_answer", "customer_not_ready", "payment_or_collection", "other"])) || !optionalString(wait.note) || !validDate(wait.recordedAt)) addIssue(context, `${path}.customerWaitExplanation`, "malformed customer-wait record");
  }
  if (activity.routePointContexts !== undefined) {
    if (!Array.isArray(activity.routePointContexts)) addIssue(context, `${path}.routePointContexts`, "route annotations must be a list");
    else activity.routePointContexts.forEach((item, index) => { if (!isRecord(item) || !integer(item.pointIndex) || item.pointIndex < 0 || !oneOf(item.context, ["customer_house", "traffic_light", "road_delay", "waiting"]) || !validDate(item.setAt)) addIssue(context, `${path}.routePointContexts[${index}]`, "malformed route annotation"); });
  }
  if (activity.routeEventClassifications !== undefined) {
    if (!Array.isArray(activity.routeEventClassifications)) addIssue(context, `${path}.routeEventClassifications`, "route classifications must be a list");
    else activity.routeEventClassifications.forEach((item, index) => { if (!isRecord(item) || !integer(item.pointIndex) || item.pointIndex < 0 || !oneOf(item.classification, ["traffic_signal", "general_traffic", "junction", "pedestrian_crossing", "customer_parking", "other_road_delay", "unclassified"]) || item.source !== "MANUALLY_CLASSIFIED" || !validDate(item.setAt)) addIssue(context, `${path}.routeEventClassifications[${index}]`, "malformed route classification"); });
  }
  if (activity.expectedRoute != null) validateExpectedRoute(activity.expectedRoute, `${path}.expectedRoute`, context);
  if (activity.travelMode !== undefined && !oneOf(activity.travelMode, ["driving", "walking"])) addIssue(context, `${path}.travelMode`, "invalid travel mode");
  if (activity.deliveryDestinations !== undefined) {
    if (!Array.isArray(activity.deliveryDestinations)) addIssue(context, `${path}.deliveryDestinations`, "delivery destinations must be a list");
    else activity.deliveryDestinations.forEach((destination, index) => validateDestination(destination, `${path}.deliveryDestinations[${index}]`, context));
  }
  if (activity.quickItems !== undefined && (!Array.isArray(activity.quickItems) || !activity.quickItems.every(stringValue))) addIssue(context, `${path}.quickItems`, "quick-task history must be a text list");
  if (!optionalBoolean(activity.tracked) || !optionalBoolean(activity.testOnly) || !optionalBoolean(activity.badDelivery) || !optionalBoolean(activity.quickStack)) addIssue(context, path, "invalid activity flags");
}

function validateTask(task: unknown, path: string, context: ValidationContext, snapshot = false, shiftBounds?: { start: string; end: string | null }) {
  if (!isRecord(task) || !stringValue(task.id) || !stringValue(task.name) || !stringValue(task.area) || !stringValue(task.description) || !integer(task.weekday) || !optionalBoolean(task.enabled) || !finite(task.order)) return addIssue(context, path, "malformed cleaning/task record");
  if (task.category !== undefined && !oneOf(task.category, ["cleaning", "prep"])) addIssue(context, `${path}.category`, "invalid task category");
  if (!optionalBoolean(task.allowNotRequired) || !optionalBoolean(task.notRequiredByDefault)) addIssue(context, path, "invalid not-required task settings");
  if (snapshot) {
    if (!oneOf(task.status, ["not_started", "active", "paused", "complete"]) || !Array.isArray(task.segments) || !validNullableDate(task.completedAt) || typeof task.quickCompleted !== "boolean") addIssue(context, path, "malformed task history");
    else validateSegments(task.segments, `${path}.segments`, context, shiftBounds);
    if (!optionalString(task.sourceTaskId) || !optionalBoolean(task.completedBySomeoneElse) || !optionalString(task.shiftNotes)) addIssue(context, path, "invalid task-history metadata");
    if (!optionalBoolean(task.notRequired) || (task.notRequiredAt !== undefined && task.notRequiredAt !== null && !validDate(task.notRequiredAt))) addIssue(context, path, "invalid not-required outcome");
    if (task.unableReason !== undefined && task.unableReason !== null && !oneOf(task.unableReason, ["store_too_busy", "assigned_to_preparation", "manager_direction", "equipment_or_safety", "shift_ended", "other_operational"])) addIssue(context, `${path}.unableReason`, "invalid unable-to-complete reason");
    if ((task.unableManager !== undefined && task.unableManager !== null && !stringValue(task.unableManager)) || (task.unableAt !== undefined && task.unableAt !== null && !validDate(task.unableAt))) addIssue(context, path, "invalid unable-to-complete metadata");
    const hasUnableOutcome = task.unableReason != null || task.unableManager != null || task.unableAt != null;
    if (hasUnableOutcome && (!oneOf(task.unableReason, ["store_too_busy", "assigned_to_preparation", "manager_direction", "equipment_or_safety", "shift_ended", "other_operational"]) || typeof task.unableManager !== "string" || !task.unableManager.trim() || !validDate(task.unableAt))) addIssue(context, path, "incomplete unable-to-complete outcome");
    if ((task.managementBlockedAt !== undefined && task.managementBlockedAt !== null && !validDate(task.managementBlockedAt)) || (task.managementBlockedBatchId !== undefined && task.managementBlockedBatchId !== null && !stringValue(task.managementBlockedBatchId))) addIssue(context, path, "invalid management-blocked outcome");
    if ((task.managementBlockedAt == null) !== (task.managementBlockedBatchId == null)) addIssue(context, path, "incomplete management-blocked outcome");
    if (task.managementBlockedAt != null && (task.status === "complete" || task.completedAt != null || task.unableAt != null || task.notRequired === true)) addIssue(context, path, "management-blocked task has a conflicting outcome");
    const validatePhotoProof = (proof: unknown, proofPath: string) => {
      if (proof == null) return;
      if (!isRecord(proof) || typeof proof.photoProof !== "boolean" || !validDate(proof.attachedAt)) return addIssue(context, proofPath, "malformed cleaning photo record");
      ["highRes", "compressed"].forEach((key) => {
        const variant = proof[key];
        if (variant != null && (!isRecord(variant) || !stringValue(variant.storageId) || !validDate(variant.createdAt) || !validDate(variant.expiresAt) || !nonNegative(variant.width) || !nonNegative(variant.height) || !nonNegative(variant.size))) addIssue(context, `${proofPath}.${key}`, "malformed cleaning photo metadata");
      });
    };
    validatePhotoProof(task.photoProof, `${path}.photoProof`);
    if (task.photoProofs !== undefined) {
      if (!Array.isArray(task.photoProofs)) addIssue(context, `${path}.photoProofs`, "cleaning photo history must be a list");
      else task.photoProofs.forEach((proof, index) => validatePhotoProof(proof, `${path}.photoProofs[${index}]`));
    }
  }
}

function validateShift(shift: unknown, index: number, context: ValidationContext) {
  const path = `shifts[${index}]`;
  if (!isRecord(shift)) return addIssue(context, path, "invalid shift record");
  if (shift.storeId !== undefined && !oneOf(shift.storeId, ["ormskirk", "maghull"])) addIssue(context, `${path}.storeId`, "invalid store identity");
  if (!stringValue(shift.id) || !shift.id || !oneOf(shift.status, ["working", "break", "completed"]) || !validDate(shift.clockIn) || !validNullableDate(shift.clockOut) || (shift.createdAt !== undefined && !validDate(shift.createdAt)) || (shift.updatedAt !== undefined && !validDate(shift.updatedAt))) addIssue(context, path, "invalid shift identity, status or timestamps");
  if (shift.status === "completed" && !validDate(shift.clockOut)) addIssue(context, `${path}.clockOut`, "completed shift is missing clock-out");
  if (validDate(shift.clockIn) && validDate(shift.clockOut) && Date.parse(shift.clockOut as string) <= Date.parse(shift.clockIn as string)) addIssue(context, path, "clock-out must be after clock-in");
  const shiftBounds = { start: validDate(shift.clockIn) ? shift.clockIn as string : "1970-01-01T00:00:00.000Z", end: validDate(shift.clockOut) ? shift.clockOut as string : null };
  if (!Array.isArray(shift.breaks)) addIssue(context, `${path}.breaks`, "breaks must be a list");
  else {
    shift.breaks.forEach((item, breakIndex) => {
      if (!isRecord(item) || !stringValue(item.id) || !validDate(item.start) || !validNullableDate(item.end) || (validDate(item.start) && validDate(item.end) && Date.parse(item.end as string) < Date.parse(item.start as string))) return addIssue(context, `${path}.breaks[${breakIndex}]`, "malformed break");
      if (context.enforceRelationships && shift.status === "completed" && item.end == null) addIssue(context, `${path}.breaks[${breakIndex}]`, "completed shift contains an open break");
      if (context.enforceRelationships && (startsBeforeShift(item.start as string, shiftBounds) || (validDate(item.end) && endsAfterShift(item.end as string, shiftBounds)))) addIssue(context, `${path}.breaks[${breakIndex}]`, "break falls outside its shift");
    });
    if (context.enforceRelationships) {
      const closedBreaks = shift.breaks.filter(isRecord).filter((item) => validDate(item.start) && validDate(item.end)).map((item, breakIndex) => ({ breakIndex, start: Date.parse(item.start as string), end: Date.parse(item.end as string) })).sort((left, right) => left.start - right.start);
      let furthestEnd = Number.NEGATIVE_INFINITY;
      closedBreaks.forEach((item) => {
        if (item.start < furthestEnd) addIssue(context, `${path}.breaks[${item.breakIndex}]`, "break overlaps another recorded break");
        furthestEnd = Math.max(furthestEnd, item.end);
      });
    }
  }
  if (!Array.isArray(shift.deliveries)) addIssue(context, `${path}.deliveries`, "deliveries must be a list");
  const deliveryIds = new Set<string>();
  if (Array.isArray(shift.deliveries)) shift.deliveries.forEach((delivery, deliveryIndex) => {
    if (!isRecord(delivery) || !stringValue(delivery.id) || !delivery.id || !oneOf(delivery.type, ["single", "double"]) || !validDate(delivery.timestamp) || !nonNegative(delivery.reimbursementPence) || !optionalString(delivery.activityId)) addIssue(context, `${path}.deliveries[${deliveryIndex}]`, "malformed delivery");
    else if (context.enforceRelationships && (startsBeforeShift(delivery.timestamp as string, shiftBounds) || endsAfterShift(delivery.timestamp as string, shiftBounds))) addIssue(context, `${path}.deliveries[${deliveryIndex}].timestamp`, "delivery falls outside its shift");
    else if (deliveryIds.has(delivery.id)) addIssue(context, `${path}.deliveries[${deliveryIndex}].id`, "duplicate delivery id");
    else deliveryIds.add(delivery.id);
  });
  const mileage = shift.mileage;
  if (!isRecord(mileage) || !oneOf(mileage.method, ["direct", "odometer"]) || !["startTenths", "endTenths", "directTenths", "gpsBaselineTenths"].every((key) => mileage[key] == null || nonNegative(mileage[key]))) addIssue(context, `${path}.mileage`, "invalid mileage record");
  else if (context.enforceRelationships && mileage.method === "odometer" && finite(mileage.startTenths) && finite(mileage.endTenths) && mileage.endTenths < mileage.startTenths) addIssue(context, `${path}.mileage`, "ending odometer is lower than starting odometer");
  ["hourlyRatePence", "singleRatePence", "doubleRatePence"].forEach((key) => { if (!nonNegative(shift[key])) addIssue(context, `${path}.${key}`, "must be zero or greater"); });
  if (shift.manualDeliveryCount != null && (!integer(shift.manualDeliveryCount) || shift.manualDeliveryCount < 0)) addIssue(context, `${path}.manualDeliveryCount`, "invalid delivery count");
  if (!oneOf(shift.reimbursementStatus, ["awaiting", "paid"]) || !(shift.reimbursementPaymentId == null || stringValue(shift.reimbursementPaymentId))) addIssue(context, path, "invalid fuel reimbursement status");
  if (shift.role !== undefined && !oneOf(shift.role, ["open", "second", "other"])) addIssue(context, `${path}.role`, "invalid shift role");
  if (shift.rotaEntryId !== undefined && !stringValue(shift.rotaEntryId)) addIssue(context, `${path}.rotaEntryId`, "invalid rota link");
  if (shift.scheduledDate !== undefined && !validDateOnly(shift.scheduledDate)) addIssue(context, `${path}.scheduledDate`, "invalid scheduled date");
  if (shift.scheduledStart !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(shift.scheduledStart))) addIssue(context, `${path}.scheduledStart`, "invalid scheduled start");
  if (shift.scheduledShiftType !== undefined && !oneOf(shift.scheduledShiftType, ["R", "L", "close", "custom"])) addIssue(context, `${path}.scheduledShiftType`, "invalid scheduled shift type");
  if (!optionalString(shift.scheduledShiftLabel) || !optionalString(shift.scheduledEnd)) addIssue(context, path, "invalid schedule snapshot text");
  if (shift.punctualityToleranceMinutes !== undefined && (!integer(shift.punctualityToleranceMinutes) || Number(shift.punctualityToleranceMinutes) < 0 || Number(shift.punctualityToleranceMinutes) > 60)) addIssue(context, `${path}.punctualityToleranceMinutes`, "invalid punctuality tolerance");
  if (shift.clockInApproval !== undefined) {
    const approval = shift.clockInApproval;
    if (!isRecord(approval) || !oneOf(approval.reason, ["unscheduled", "early"]) || !stringValue(approval.managerName) || approval.areaManagerApprovalConfirmed !== true || !validDate(approval.recordedAt) || !optionalString(approval.scheduledStart) || (approval.minutesEarly !== undefined && (!integer(approval.minutesEarly) || Number(approval.minutesEarly) < 0))) addIssue(context, `${path}.clockInApproval`, "invalid clock-in approval evidence");
  }
  if (shift.lateClockInExplanation !== undefined) {
    const explanation = shift.lateClockInExplanation;
    if (!isRecord(explanation) || !oneOf(explanation.reason, ["traffic", "public_transport", "vehicle_issue", "weather", "personal_emergency", "manager_delayed_start", "rota_changed", "other"]) || !optionalString(explanation.note) || !validDate(explanation.recordedAt) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(explanation.scheduledStart ?? "")) || !integer(explanation.minutesLate) || Number(explanation.minutesLate) < 1) addIssue(context, `${path}.lateClockInExplanation`, "invalid late clock-in explanation");
  }
  if (shift.manualEntry !== undefined) {
    const entry = shift.manualEntry;
    if (!isRecord(entry) || entry.reason !== "missed_tracking" || !optionalString(entry.note) || !validDate(entry.recordedAt)) addIssue(context, `${path}.manualEntry`, "invalid manual shift record");
  }
  if (shift.context !== undefined) {
    const value = shift.context;
    const tags = ["asked_to_stay_late", "sent_home_early", "covering_driver", "unexpectedly_busy", "unexpectedly_quiet", "rota_changed", "store_operational_issue", "understaffed", "no_work_assigned", "management_blocked", "equipment_issue", "good_teamwork", "other"];
    if (!isRecord(value) || !Array.isArray(value.tags) || value.tags.some((tag) => !oneOf(tag, tags)) || !optionalString(value.managerOnDuty) || !optionalString(value.note) || !validDate(value.recordedAt) || !validDate(value.updatedAt)) addIssue(context, `${path}.context`, "invalid shift context");
  }
  if (shift.ratingReview !== undefined) {
    const review = shift.ratingReview;
    if (!isRecord(review) || !integer(review.overallRating) || Number(review.overallRating) < 1 || Number(review.overallRating) > 5 || !integer(review.managerRating) || Number(review.managerRating) < 1 || Number(review.managerRating) > 5 || !validDate(review.recordedAt) || !validDate(review.updatedAt)) addIssue(context, `${path}.ratingReview`, "invalid shift rating review");
  }
  if (shift.incidents !== undefined) {
    const categories = ["delivery_issue", "customer_delay", "store_issue", "manager_instruction", "vehicle_issue", "safety_issue", "other"];
    if (!Array.isArray(shift.incidents)) addIssue(context, `${path}.incidents`, "incident markers must be a list");
    else shift.incidents.forEach((value, incidentIndex) => {
      if (!isRecord(value) || !stringValue(value.id) || value.shiftId !== shift.id || !validDate(value.capturedAt) || (value.category !== undefined && !oneOf(value.category, categories)) || !optionalString(value.activityId) || !optionalString(value.note) || !optionalString(value.manager) || (value.updatedAt !== undefined && !validDate(value.updatedAt))) addIssue(context, `${path}.incidents[${incidentIndex}]`, "invalid incident marker");
    });
  }
  if (shift.anomalyReviews !== undefined) {
    if (!Array.isArray(shift.anomalyReviews)) addIssue(context, `${path}.anomalyReviews`, "anomaly reviews must be a list");
    else shift.anomalyReviews.forEach((value, reviewIndex) => {
      if (!isRecord(value) || !stringValue(value.rule) || !oneOf(value.status, ["dismissed", "expected"]) || !optionalString(value.note) || !validDate(value.updatedAt)) addIssue(context, `${path}.anomalyReviews[${reviewIndex}]`, "invalid anomaly review");
    });
  }
  if (shift.noBreakRecord != null) {
    const record = shift.noBreakRecord;
    if (!isRecord(record) || typeof record.expectedDeduction !== "boolean" || !stringValue(record.reason) || !optionalString(record.note) || !validDate(record.recordedAt)) addIssue(context, `${path}.noBreakRecord`, "malformed no-break record");
  }
  if (shift.reviewStatus !== undefined && !oneOf(shift.reviewStatus, ["incomplete", "complete"])) addIssue(context, `${path}.reviewStatus`, "invalid review status");
  ["isLocked", "cleaningRequired"].forEach((key) => { if (!optionalBoolean(shift[key])) addIssue(context, `${path}.${key}`, "expected an on/off value"); });
  if (shift.cleaningOverride !== undefined && shift.cleaningOverride !== null && typeof shift.cleaningOverride !== "boolean") addIssue(context, `${path}.cleaningOverride`, "expected an on/off value");
  if (shift.pendingResumeTaskId !== undefined && shift.pendingResumeTaskId !== null && !stringValue(shift.pendingResumeTaskId)) addIssue(context, `${path}.pendingResumeTaskId`, "invalid linked task id");
  if (shift.pendingResumeBlockedTime !== undefined && shift.pendingResumeBlockedTime !== null) {
    const pending = shift.pendingResumeBlockedTime;
    const reasons = ["waiting_for_instruction", "manager_stopped_task", "no_task_permitted", "nothing_available", "idiot_in_charge", "other"];
    if (!isRecord(pending) || !oneOf(pending.reason, reasons) || !optionalString(pending.note)) addIssue(context, `${path}.pendingResumeBlockedTime`, "invalid Blocked Time continuation");
  }
  if (shift.pendingEarlyDispatch !== undefined && shift.pendingEarlyDispatch !== null) {
    const pending = shift.pendingEarlyDispatch;
    if (!isRecord(pending) || !validDate(pending.dominosDispatchStartedAt) || !validNullableDate(pending.dominosGeofenceExitedAt) || !finite(pending.dominosGeofenceLatitude) || !finite(pending.dominosGeofenceLongitude) || !finite(pending.dominosGeofenceRadius)) addIssue(context, `${path}.pendingEarlyDispatch`, "invalid pending early-dispatch timer");
  }
  if (shift.queuedEarlyDispatch !== undefined && shift.queuedEarlyDispatch !== null) {
    const queued = shift.queuedEarlyDispatch;
    if (!isRecord(queued) || !validDate(queued.dominosDispatchStartedAt) || !validNullableDate(queued.dominosGeofenceExitedAt) || !finite(queued.dominosGeofenceLatitude) || !finite(queued.dominosGeofenceLongitude) || !finite(queued.dominosGeofenceRadius)) addIssue(context, `${path}.queuedEarlyDispatch`, "invalid queued early-dispatch timer");
  }
  if (shift.taskSnapshot !== undefined) {
    if (!Array.isArray(shift.taskSnapshot)) addIssue(context, `${path}.taskSnapshot`, "task history must be a list");
    else shift.taskSnapshot.forEach((task, taskIndex) => {
      validateTask(task, `${path}.taskSnapshot[${taskIndex}]`, context, true, shiftBounds);
      if (!context.enforceRelationships || shift.status !== "completed" || !isRecord(task)) return;
      if (task.status === "active") addIssue(context, `${path}.taskSnapshot[${taskIndex}]`, "completed shift contains an active task");
      if (Array.isArray(task.segments)) task.segments.forEach((segment, segmentIndex) => {
        if (isRecord(segment) && segment.end == null) addIssue(context, `${path}.taskSnapshot[${taskIndex}].segments[${segmentIndex}]`, "completed shift contains an open task segment");
      });
    });
  }
  if (!optionalBoolean(shift.firstTaskPromptHandled)) addIssue(context, `${path}.firstTaskPromptHandled`, "invalid first-task prompt state");
  if (shift.activities !== undefined) {
    if (!Array.isArray(shift.activities)) addIssue(context, `${path}.activities`, "activities must be a list");
    else {
      shift.activities.forEach((activity, activityIndex) => {
        validateActivity(activity, `${path}.activities[${activityIndex}]`, String(shift.id), deliveryIds, context, shiftBounds);
        if (!context.enforceRelationships || shift.status !== "completed" || !isRecord(activity)) return;
        if (activity.end == null) addIssue(context, `${path}.activities[${activityIndex}]`, "completed shift contains an open activity");
        if (Array.isArray(activity.segments)) activity.segments.forEach((segment, segmentIndex) => {
          if (isRecord(segment) && segment.end == null) addIssue(context, `${path}.activities[${activityIndex}].segments[${segmentIndex}]`, "completed shift contains an open activity segment");
        });
      });
      const activityIds = new Set(shift.activities.filter(isRecord).map((activity) => activity.id).filter(stringValue));
      if (activityIds.size !== shift.activities.filter((activity) => isRecord(activity) && stringValue(activity.id)).length) addIssue(context, `${path}.activities`, "duplicate activity id");
      if (Array.isArray(shift.deliveries)) shift.deliveries.forEach((delivery, deliveryIndex) => { if (isRecord(delivery) && stringValue(delivery.activityId) && !activityIds.has(delivery.activityId)) addIssue(context, `${path}.deliveries[${deliveryIndex}].activityId`, "linked delivery activity is missing"); });
    }
  }
}

function validateSettings(settings: unknown, context: ValidationContext) {
  if (!isRecord(settings)) return addIssue(context, "settings", "settings are missing or malformed");
  ["hourlyRatePence", "singleRatePence", "doubleRatePence"].forEach((key) => { if (!nonNegative(settings[key])) addIssue(context, `settings.${key}`, "must be zero or greater"); });
  if (!integer(settings.paymentDay) || settings.paymentDay < 0 || settings.paymentDay > 6) addIssue(context, "settings.paymentDay", "invalid payment day");
  if (!oneOf(settings.mileagePreference, ["direct", "odometer", "ask"]) || !oneOf(settings.theme, ["system", "light", "dark"])) addIssue(context, "settings", "invalid mileage or theme setting");
  if (!optionalBoolean(settings.legacyView)) addIssue(context, "settings.legacyView", "expected an on/off view preference");
  if (settings.settingsStyle !== undefined && !oneOf(settings.settingsStyle, ["original", "android"])) addIssue(context, "settings.settingsStyle", "invalid settings style");
  if (settings.deliveryDays !== undefined && (!Array.isArray(settings.deliveryDays) || !settings.deliveryDays.every((day) => integer(day) && day >= 0 && day <= 6))) addIssue(context, "settings.deliveryDays", "invalid delivery days");
  if (settings.shelfLifeHiddenProductIds !== undefined && (!Array.isArray(settings.shelfLifeHiddenProductIds) || settings.shelfLifeHiddenProductIds.length > 200 || !settings.shelfLifeHiddenProductIds.every((id) => stringValue(id) && id.length <= 80))) addIssue(context, "settings.shelfLifeHiddenProductIds", "invalid shelf-life product preferences");
  if (settings.customQuickTasks !== undefined && (!Array.isArray(settings.customQuickTasks) || settings.customQuickTasks.length > 24 || !settings.customQuickTasks.every((label) => stringValue(label) && label.trim() === label && label.length <= 60))) addIssue(context, "settings.customQuickTasks", "invalid custom quick tasks");
  const quickTaskCategoryIds = new Set(QUICK_TASK_CATEGORIES.map((category) => category.id));
  const customQuickTaskLabels = Array.isArray(settings.customQuickTasks)
    ? settings.customQuickTasks.filter(stringValue).map(normaliseQuickTaskLabel)
    : [];
  const validQuickTaskIds = new Set([
    ...QUICK_TASK_JOBS.map((job) => job.id),
    ...customQuickTaskLabels.map((label) => `custom:${label}`),
  ]);
  ["hiddenQuickTaskIds", "quickTaskOrder"].forEach((key) => {
    const value = settings[key];
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 64 || !value.every((id) => stringValue(id) && validQuickTaskIds.has(id)) || new Set(value).size !== value.length)
      addIssue(context, `settings.${key}`, "invalid quick-job selection");
  });
  if (settings.quickTaskCategoryOrder !== undefined &&
    (!Array.isArray(settings.quickTaskCategoryOrder) || settings.quickTaskCategoryOrder.length !== quickTaskCategoryIds.size ||
      !settings.quickTaskCategoryOrder.every((id) => stringValue(id) && quickTaskCategoryIds.has(id as QuickTaskCategoryId)) ||
      new Set(settings.quickTaskCategoryOrder).size !== settings.quickTaskCategoryOrder.length))
    addIssue(context, "settings.quickTaskCategoryOrder", "invalid quick-job category order");
  if (settings.customQuickTaskCategories !== undefined) {
    if (!isRecord(settings.customQuickTaskCategories)) addIssue(context, "settings.customQuickTaskCategories", "invalid custom quick-job categories");
    else Object.entries(settings.customQuickTaskCategories).forEach(([key, value]) => {
      if (!customQuickTaskLabels.includes(key) || !stringValue(value) || !quickTaskCategoryIds.has(value as QuickTaskCategoryId))
        addIssue(context, `settings.customQuickTaskCategories.${key}`, "invalid custom quick-job category");
    });
  }
  if (settings.jamesOsShiftRetractions !== undefined && (!Array.isArray(settings.jamesOsShiftRetractions) || !settings.jamesOsShiftRetractions.every((value) => isRecord(value) && stringValue(value.shiftId) && value.shiftId.length <= 128 && integer(value.revision) && Number(value.revision) >= 0 && Number(value.revision) <= 1_000_000 && finite(value.retractedAtEpochMs) && Number(value.retractedAtEpochMs) > 0))) addIssue(context, "settings.jamesOsShiftRetractions", "invalid James OS shift retractions");
  if (settings.firstTaskPromptTaskIds !== undefined && (!Array.isArray(settings.firstTaskPromptTaskIds) || settings.firstTaskPromptTaskIds.length > 100 || !settings.firstTaskPromptTaskIds.every((id) => stringValue(id) && id.trim().length > 0 && id.length <= 128))) addIssue(context, "settings.firstTaskPromptTaskIds", "invalid first-task prompt selection");
  if (settings.defaultShiftRole !== undefined && !oneOf(settings.defaultShiftRole, ["open", "second", "other"])) addIssue(context, "settings.defaultShiftRole", "invalid default shift role");
  if (settings.dominosReferenceRadiusMetres !== undefined && (!integer(settings.dominosReferenceRadiusMetres) || Number(settings.dominosReferenceRadiusMetres) < 40 || Number(settings.dominosReferenceRadiusMetres) > 150)) addIssue(context, "settings.dominosReferenceRadiusMetres", "Domino's reference radius must be 40–150 metres");
  if (settings.storePresenceStartProofRadiusMetres !== undefined && (!integer(settings.storePresenceStartProofRadiusMetres) || Number(settings.storePresenceStartProofRadiusMetres) < 5 || Number(settings.storePresenceStartProofRadiusMetres) > 50)) addIssue(context, "settings.storePresenceStartProofRadiusMetres", "store-start proof radius must be 5–50 metres");
  ["locationAssistEnabled", "geofenceSoundEnabled", "storePresenceProofEnabled", "storePresenceStartProofEnabled", "recordDeliveryRoutes", "showGpsPointsByDefault", "googleRoutesEnabled", "deliveryAddressEnabled", "receiptScanningEnabled", "googleAddressValidationEnabled", "osmRoadIntelligenceEnabled", "includeBetaData", "includeBetaCleaningData", "includeQuestionableBetaHustle", "startupPromptsEnabled", "clockInRolePromptEnabled", "firstTaskPromptEnabled", "firstTaskPromptIncludeRushReady", "quickTasksEnabled", "rotaNotificationsEnabled", "rotaMorningReminderEnabled", "rotaOneHourReminderEnabled", "rotaFifteenMinuteReminderEnabled", "rotaSundayReminderEnabled"].forEach((key) => { if (!optionalBoolean(settings[key])) addIssue(context, `settings.${key}`, "expected an on/off value"); });
  if (settings.geofenceChimeStyle !== undefined && !["classic", "bell", "double", "soft", "digital", "attention", "alarm", "siren"].includes(String(settings.geofenceChimeStyle))) addIssue(context, "settings.geofenceChimeStyle", "expected a supported geofence chime style");
  ["rotaMorningReminderTime", "rotaSundayReminderTime"].forEach((key) => { if (settings[key] !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings[key]))) addIssue(context, `settings.${key}`, "invalid reminder time"); });
  ["punctualityToleranceMinutes", "rotaOneHourMinutesBefore", "rotaFifteenMinuteMinutesBefore"].forEach((key) => { if (settings[key] !== undefined && (!integer(settings[key]) || Number(settings[key]) < 0 || Number(settings[key]) > 720)) addIssue(context, `settings.${key}`, "invalid reminder/tolerance minutes"); });
  if (settings.routeGpsDetail !== undefined && !oneOf(settings.routeGpsDetail, ["standard", "high"])) addIssue(context, "settings.routeGpsDetail", "invalid GPS detail setting");
  if (settings.routeRetention !== undefined && !oneOf(settings.routeRetention, ["30", "90", "forever"])) addIssue(context, "settings.routeRetention", "invalid route retention setting");
  if (settings.historicalDeliveryLocationPrivacy !== undefined && !oneOf(settings.historicalDeliveryLocationPrivacy, ["street_postcode", "street_sector", "street_only", "sector_only", "none"])) addIssue(context, "settings.historicalDeliveryLocationPrivacy", "invalid privacy setting");
  if (settings.deletePreciseAddressAfter !== undefined && !oneOf(settings.deletePreciseAddressAfter, ["back_at_store", "delivered"])) addIssue(context, "settings.deletePreciseAddressAfter", "invalid address deletion setting");
  if (settings.osmRoadFeatureSettings !== undefined && (!isRecord(settings.osmRoadFeatureSettings) || !["trafficSignals", "junctionControls", "pedestrianCrossings", "calmingAndRoundabouts", "roadMetadata", "restrictions"].every((key) => typeof (settings.osmRoadFeatureSettings as UnknownRecord)[key] === "boolean"))) addIssue(context, "settings.osmRoadFeatureSettings", "invalid OSM feature settings");
  if (settings.hustleStatsSource !== undefined && !oneOf(settings.hustleStatsSource, ["real", "dominos"])) addIssue(context, "settings.hustleStatsSource", "invalid Hustle source");
  if (settings.localRoadFeatures !== undefined) {
    if (!Array.isArray(settings.localRoadFeatures)) addIssue(context, "settings.localRoadFeatures", "local road features must be a list");
    else settings.localRoadFeatures.forEach((feature, index) => validateLocalRoadFeature(feature, `settings.localRoadFeatures[${index}]`, context));
  }
  if (settings.operationalAllowances !== undefined) {
    const allowances = settings.operationalAllowances;
    if (!isRecord(allowances) || !["comfortMinutesPerHour", "orderHandlingMinutesPerOrder", "transitionSeconds", "returnResetMinutes", "maximumMinutesPerHour"].every((key) => nonNegative(allowances[key]))) addIssue(context, "settings.operationalAllowances", "invalid operational allowances");
  }
  if (settings.trafficClassification !== undefined) {
    const traffic = settings.trafficClassification;
    if (!isRecord(traffic) || !["freeFlowMph", "moderateMph", "slowMph", "stationarySeconds"].every((key) => nonNegative(traffic[key])) || (traffic.signalQueueLookAheadMetres !== undefined && !nonNegative(traffic.signalQueueLookAheadMetres))) addIssue(context, "settings.trafficClassification", "invalid traffic classification settings");
  }
  ["storeLatitude", "storeLongitude", "storeDisplayLatitude", "storeDisplayLongitude"].forEach((key) => { if (settings[key] !== undefined && !finite(settings[key])) addIssue(context, `settings.${key}`, "must be numeric"); });
  ["storeRadiusMetres", "signalQueueLookAheadMetres"].forEach((key) => { if (settings[key] !== undefined && !nonNegative(settings[key])) addIssue(context, `settings.${key}`, "must be zero or greater"); });
  if (!optionalString(settings.storeDisplayLabel)) addIssue(context, "settings.storeDisplayLabel", "must be text");
}

export function backupRecordCounts(data: AppData): BackupRecordCounts {
  const activities = data.shifts.flatMap((shift) => shift.activities ?? []);
  return {
    shifts: data.shifts.length,
    deliveries: data.shifts.reduce((sum, shift) => sum + shift.deliveries.length, 0),
    activities: activities.length,
    routePoints: activities.reduce((sum, activity) => sum + (activity.routeEvidence?.points.length ?? 0), 0),
    payments: data.payments.length,
    cleaningTasks: data.shifts.reduce((sum, shift) => sum + (shift.taskSnapshot?.length ?? 0), 0),
    betaShifts: data.shifts.filter((shift) => Date.parse(shift.clockIn) < Date.parse(LIVE_DATA_START_AT)).length,
  };
}

export function createBackupDocument(value: AppData, appVersion: string, stamp = new Date()): ShiftTrackerBackup {
  const createdAt = stamp.toISOString();
  const data = prepareAppDataForBackup(value);
  data.lastBackupAt = createdAt;
  return { kind: BACKUP_KIND, formatVersion: BACKUP_FORMAT_VERSION, createdAt, appVersion, schemaVersion: data.version, recordCounts: backupRecordCounts(data), validation: { profile: BACKUP_VALIDATION_PROFILE }, data };
}

export function validateAppDataStructure(value: unknown, options: AppDataValidationOptions = {}): { ok: true; data: AppData; warnings: string[] } | { ok: false; message: string; issues: string[] } {
  const context: ValidationContext = { issues: [], warnings: [], enforceRelationships: options.enforceRelationships !== false };
  if (!isRecord(value)) return { ok: false, message: "Backup data is not a valid object.", issues: ["backup: expected a Shift Tracker data object"] };
  if (value.version !== 1) return { ok: false, message: `Unsupported data schema version ${String(value.version ?? "missing")}.`, issues: ["version: only Shift Tracker schema version 1 is supported"] };
  validateSettings(value.settings, context);
  if (!Array.isArray(value.shifts)) addIssue(context, "shifts", "shift history must be a list");
  else {
    value.shifts.forEach((shift, index) => validateShift(shift, index, context));
    const shiftIds = value.shifts.filter(isRecord).map((shift) => shift.id).filter(stringValue);
    if (new Set(shiftIds).size !== shiftIds.length) addIssue(context, "shifts", "duplicate shift id");
  }
  if (!Array.isArray(value.payments)) addIssue(context, "payments", "payment history must be a list");
  else {
    value.payments.forEach((payment, index) => {
    if (!isRecord(payment) || !stringValue(payment.id) || !validDate(payment.date) || !nonNegative(payment.amountPence) || (payment.expectedAmountPence !== undefined && !nonNegative(payment.expectedAmountPence)) || !Array.isArray(payment.shiftIds) || !payment.shiftIds.every(stringValue) || !validNullableDate(payment.reversedAt)) addIssue(context, `payments[${index}]`, "malformed fuel reimbursement payment");
    });
    const paymentIds = value.payments.filter(isRecord).map((payment) => payment.id).filter(stringValue);
    if (new Set(paymentIds).size !== paymentIds.length) addIssue(context, "payments", "duplicate payment id");
  }
  if (value.payrollSchedules !== undefined) {
    if (!Array.isArray(value.payrollSchedules)) addIssue(context, "payrollSchedules", "payroll schedules must be a list");
    else {
      const periodKeys = new Set<string>();
      value.payrollSchedules.forEach((schedule, index) => {
        const path = `payrollSchedules[${index}]`;
        if (!isRecord(schedule) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(schedule.monthKey ?? "")) || !validDateOnly(schedule.cutoffDate) || !validDateOnly(schedule.paydayDate) || (schedule.periodStartDate !== undefined && !validDateOnly(schedule.periodStartDate)) || !optionalBoolean(schedule.isFiveWeekPay) || !validNullableDate(schedule.paidAt) || !validPayslipSnapshot(schedule.payslip)) return addIssue(context, path, "malformed payroll schedule");
        if (!context.enforceRelationships) return;
        const periodStart = typeof schedule.periodStartDate === "string" ? schedule.periodStartDate : null;
        const cutoff = schedule.cutoffDate as string;
        const payday = schedule.paydayDate as string;
        if (periodStart && periodStart > cutoff) addIssue(context, path, "period start is after pay cut-off");
        if (payday < cutoff) addIssue(context, path, "payday is before pay cut-off");
        const key = `${periodStart ?? "legacy"}|${cutoff}`;
        if (periodKeys.has(key)) addIssue(context, path, "duplicate payroll period");
        periodKeys.add(key);
      });
      if (context.enforceRelationships) {
        const ranges = value.payrollSchedules.filter(isRecord).filter((schedule) => validDateOnly(schedule.periodStartDate) && validDateOnly(schedule.cutoffDate)).map((schedule, index) => ({ index, start: schedule.periodStartDate as string, end: schedule.cutoffDate as string })).sort((left, right) => left.start.localeCompare(right.start));
        ranges.forEach((range, index) => { if (index > 0 && range.start <= ranges[index - 1].end) addIssue(context, `payrollSchedules[${range.index}]`, "payroll period overlaps another period"); });
      }
    }
  }
  [["cleaningRota", value.cleaningRota], ["preparationRota", value.preparationRota]].forEach(([key, list]) => { if (list !== undefined) { if (!Array.isArray(list)) addIssue(context, String(key), "rota must be a list"); else list.forEach((task, index) => validateTask(task, `${String(key)}[${index}]`, context)); } });
  if (value.rotaWeeks !== undefined) {
    if (!Array.isArray(value.rotaWeeks)) addIssue(context, "rotaWeeks", "weekly rota must be a list");
    else {
      const weekIds = new Set<string>(); const entryIds = new Set<string>();
      value.rotaWeeks.forEach((week, weekIndex) => {
        const path = `rotaWeeks[${weekIndex}]`;
        if (!isRecord(week) || !stringValue(week.id) || !validDateOnly(week.weekStartDate) || !validDate(week.createdAt) || !validDate(week.updatedAt) || !Array.isArray(week.entries) || week.entries.length !== 7) return addIssue(context, path, "malformed rota week");
        if (weekIds.has(week.id as string)) addIssue(context, `${path}.id`, "duplicate rota week id"); else weekIds.add(week.id as string);
        week.entries.forEach((entry, entryIndex) => {
          const entryPath = `${path}.entries[${entryIndex}]`;
          if (!isRecord(entry) || !stringValue(entry.id) || !validDateOnly(entry.date) || !oneOf(entry.status, ["working", "off"]) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(entry.startTime ?? "")) || !oneOf(entry.shiftType, ["R", "L", "close", "custom"]) || !optionalString(entry.customLabel) || !optionalString(entry.scheduledEndTime) || !validDate(entry.createdAt) || !validDate(entry.updatedAt) || !(entry.linkedShiftId == null || stringValue(entry.linkedShiftId))) return addIssue(context, entryPath, "malformed rota entry");
          if (entryIds.has(entry.id as string)) addIssue(context, `${entryPath}.id`, "duplicate rota entry id"); else entryIds.add(entry.id as string);
          if (entry.attendance != null) {
            const attendance = entry.attendance;
            if (!isRecord(attendance) || !oneOf(attendance.category, ["sick", "holiday", "authorised_absence", "store_cancelled", "shift_swapped", "forgot_to_track", "other"]) || !optionalString(attendance.note) || !validDate(attendance.recordedAt) || (attendance.replacementDate !== undefined && !validDateOnly(attendance.replacementDate)) || (attendance.replacementStartTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(attendance.replacementStartTime)))) addIssue(context, `${entryPath}.attendance`, "malformed attendance result");
          }
        });
      });
    }
  }
  if (value.lastBackupAt !== undefined && !validNullableDate(value.lastBackupAt)) addIssue(context, "lastBackupAt", "invalid backup timestamp");
  if (value.settingsRevision !== undefined && (!integer(value.settingsRevision) || value.settingsRevision < 0)) addIssue(context, "settingsRevision", "invalid settings revision");
  if (!context.issues.length && Array.isArray(value.shifts) && Array.isArray(value.payments)) {
    const shiftIds = new Set(value.shifts.filter(isRecord).map((shift) => shift.id).filter(stringValue));
    const paymentIds = new Set(value.payments.filter(isRecord).map((payment) => payment.id).filter(stringValue));
    value.payments.forEach((payment, index) => { if (isRecord(payment) && Array.isArray(payment.shiftIds) && payment.shiftIds.some((id) => stringValue(id) && !shiftIds.has(id))) context.warnings.push(`Payment ${index + 1} references a shift no longer present in this historical backup.`); });
    value.shifts.forEach((shift, index) => { if (isRecord(shift) && stringValue(shift.reimbursementPaymentId) && !paymentIds.has(shift.reimbursementPaymentId)) context.warnings.push(`Shift ${index + 1} references a payment no longer present in this historical backup.`); });
  }
  if (context.issues.length) return { ok: false, message: context.issues[0], issues: context.issues };
  return { ok: true, data: value as unknown as AppData, warnings: context.warnings };
}

export function validateBackupDocument(value: unknown): BackupValidationResult {
  let dataValue = value;
  let createdAt: string | null = null;
  let appVersion = "Earlier Shift Tracker release";
  let formatVersion: number | null = null;
  let historicalFormat = true;
  let declaredCounts: BackupRecordCounts | null = null;
  if (isRecord(value) && (value.kind !== undefined || value.formatVersion !== undefined)) {
    if (value.kind !== BACKUP_KIND) return { ok: false, message: "This is not a Domino’s Shift Tracker backup.", issues: ["backup kind is missing or unsupported"] };
    if (value.formatVersion !== BACKUP_FORMAT_VERSION) return { ok: false, message: `Unsupported backup format version ${String(value.formatVersion ?? "missing")}.`, issues: ["only backup format version 1 is supported"] };
    if (!validDate(value.createdAt) || !stringValue(value.appVersion) || value.appVersion.length < 1 || value.schemaVersion !== 1 || !isRecord(value.recordCounts) || !isRecord(value.validation) || value.validation.profile !== BACKUP_VALIDATION_PROFILE) return { ok: false, message: "Backup metadata is incomplete or malformed.", issues: ["backup metadata failed validation"] };
    createdAt = value.createdAt as string;
    appVersion = value.appVersion as string;
    formatVersion = BACKUP_FORMAT_VERSION;
    historicalFormat = false;
    declaredCounts = value.recordCounts as unknown as BackupRecordCounts;
    dataValue = value.data;
  }
  // Migration repairs missing legacy fields, but it may also discard malformed
  // route points. Validate any route evidence that is already present before
  // migration so corrupt GPS data cannot be silently normalised into a backup
  // that appears valid. All fields added by later releases remain optional in
  // validateRoute, preserving historical compatibility.
  if (isRecord(dataValue) && Array.isArray(dataValue.shifts)) {
    const preflight: ValidationContext = { issues: [], warnings: [], enforceRelationships: false };
    dataValue.shifts.forEach((shift, shiftIndex) => {
      if (!isRecord(shift) || !Array.isArray(shift.activities)) return;
      shift.activities.forEach((activity, activityIndex) => {
        if (isRecord(activity) && activity.routeEvidence != null) validateRoute(activity.routeEvidence, `shifts[${shiftIndex}].activities[${activityIndex}].routeEvidence`, preflight);
      });
    });
    if (preflight.issues.length) return { ok: false, message: preflight.issues[0], issues: preflight.issues };
  }
  if (!validateData(dataValue)) return { ok: false, message: "Backup data is not a valid Shift Tracker dataset.", issues: ["backup: required top-level records are missing or malformed"] };
  // Migration may add fields that were absent in older releases, but it must
  // never replace a malformed collection that is actually present. Validate
  // source structure first with compatibility relationships disabled, then
  // migrate and apply the full current integrity rules below.
  const sourceStructure = validateAppDataStructure(dataValue, { enforceRelationships: false });
  if (!sourceStructure.ok) return sourceStructure;
  // Envelope metadata describes the exact document that was exported. Legacy
  // compatibility migration may add default task snapshots/settings on import,
  // so comparing declared counts after migration can reject an otherwise valid
  // backup even though its original count metadata is accurate.
  let sourceCounts: BackupRecordCounts | null = null;
  if (declaredCounts) {
    try {
      sourceCounts = backupRecordCounts(dataValue);
    } catch {
      return { ok: false, message: "Backup data contains a malformed nested record.", issues: ["backup: record counts could not be verified safely"] };
    }
  }
  let migrated: AppData;
  try {
    migrated = migrateAppData(dataValue);
  } catch {
    return { ok: false, message: "Backup data could not be migrated safely.", issues: ["backup: migration failed"] };
  }
  const validated = validateAppDataStructure(migrated);
  if (!validated.ok) return validated;
  const data = validated.data;
  const counts = backupRecordCounts(data);
  if (declaredCounts && sourceCounts && (Object.keys(sourceCounts) as Array<keyof BackupRecordCounts>).some((key) => !integer(declaredCounts![key]) || declaredCounts![key] !== sourceCounts[key])) return { ok: false, message: "Backup record counts do not match its data.", issues: ["backup validation metadata is inconsistent"] };
  const timestamps = data.shifts.map((shift) => Date.parse(shift.clockIn)).filter(Number.isFinite).sort((left, right) => left - right);
  const inferredCreatedAt = validDate(data.lastBackupAt) ? data.lastBackupAt! : null;
  return { ok: true, data, preview: { createdAt: createdAt ?? inferredCreatedAt, appVersion, schemaVersion: data.version, formatVersion, counts, dateFrom: timestamps.length ? new Date(timestamps[0]).toISOString() : null, dateTo: timestamps.length ? new Date(timestamps.at(-1)!).toISOString() : null, hasBetaRecords: counts.betaShifts > 0, historicalFormat, warnings: validated.warnings } };
}

/** Returns the original object unless a fully validated replacement is explicitly confirmed. */
export function applyValidatedBackup(current: AppData, validation: BackupValidationResult, confirmed: boolean): AppData {
  if (!confirmed || !validation.ok) return current;
  return structuredClone(validation.data);
}
