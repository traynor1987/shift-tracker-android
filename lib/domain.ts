export type ShiftStatus = "working" | "break" | "completed";
export type DeliveryKind = "single" | "double";
export type MileageMethod = "odometer" | "direct";
export type MileagePreference = MileageMethod | "ask";
export type ThemePreference = "system" | "light" | "dark";
export type ShiftRole = "open" | "second" | "other";
export type RotaShiftType = "R" | "L" | "close" | "custom";
export type RotaAttendanceCategory = "sick" | "holiday" | "authorised_absence" | "store_cancelled" | "shift_swapped" | "forgot_to_track" | "other";
export interface RotaAttendanceRecord { category: RotaAttendanceCategory; note?: string; replacementDate?: string; replacementStartTime?: string; recordedAt: string }
export interface RotaEntry { id: string; date: string; status: "working" | "off"; startTime: string; shiftType: RotaShiftType; customLabel?: string; scheduledEndTime?: string; attendance?: RotaAttendanceRecord | null; linkedShiftId?: string | null; createdAt: string; updatedAt: string }
export interface RotaWeek { id: string; weekStartDate: string; entries: RotaEntry[]; createdAt: string; updatedAt: string }
export type TaskUnableReason = "store_too_busy" | "assigned_to_preparation" | "manager_direction" | "equipment_or_safety" | "shift_ended" | "other_operational";
export type ActivityType = "clock_in" | "clock_out" | "single_delivery" | "double_delivery" | "cleaning_task" | "prep_task" | "break" | "other_task" | "blocked_time" | "store_exit" | "store_entry";
export type BlockedTimeReason = "waiting_for_instruction" | "manager_stopped_task" | "no_task_permitted" | "nothing_available" | "idiot_in_charge" | "other";
export type TaskStatus = "not_started" | "active" | "paused" | "complete";
export type RouteGpsDetail = "standard" | "high";
export type RouteRetention = "30" | "90" | "forever";
export type GeofenceChimeStyle = "classic" | "bell" | "double" | "soft" | "digital" | "attention" | "alarm" | "siren";
export type HistoricalDeliveryLocationPrivacy = "street_postcode" | "street_sector" | "street_only" | "sector_only" | "none";
export type DeliveryAddressSource = "manual" | "pasted" | "autocomplete" | "postcode_lookup" | "other";

export interface ActivitySegment { start: string; end: string | null }
export interface DeliveryRoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
}
/**
 * Optional, deliberately separate return-button safeguard.  This is an
 * action-time presence check around the physical store pin; it never feeds
 * the protected Real/DOMINO'S geofence evaluators or their statistics.
 */
export interface StorePresenceProof {
  version: 1;
  /** Whether the separate Beta start-at-store safeguard was enabled for this run. */
  startEnabledAtStart?: boolean;
  /** Radius selected for the separate Beta start check, kept with the evidence. */
  startRadiusMetres?: number;
  enabledAtStart: boolean;
  radiusMetres: number;
  latitude: number;
  longitude: number;
  changes: { at: string; enabled: boolean }[];
  startAttempt?: {
    at: string;
    outcome: "confirmed" | "not_required";
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    distanceMetres?: number;
    sampleAt?: string;
  };
  returnAttempt?: {
    at: string;
    outcome: "confirmed" | "not_required" | "not_confirmed";
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    distanceMetres?: number;
    sampleAt?: string;
  };
}
export interface DeliveryRouteGap { from: string; to: string; durationMs: number }
export interface DeliveryRouteIssue { timestamp: string; type: "permission" | "unavailable" | "timeout" | "resume"; message: string }
/** A locally inferred stationary period. It is evidence of a delay, not a claim about its cause. */
export interface DeliveryRouteStop { latitude: number; longitude: number; startedAt: string; endedAt: string; durationMs: number; kind: "traffic_delay" | "probable_traffic_light" }
export type MovementClass = "free" | "moderate" | "slow" | "heavy" | "stationary" | "customer" | "store";
export interface RouteMovementSegment { startIndex: number; endIndex: number; startAt: string; endAt: string; durationMs: number; distanceMetres: number; averageMph: number; minimumMph: number; maximumMph: number; classification: MovementClass; confidence: "high" | "medium" | "low"; }
export interface SameRoadComparison { outboundStartIndex: number; outboundEndIndex: number; returnStartIndex: number; returnEndIndex: number; sharedMetres: number; outboundMs: number; returnMs: number; outboundMph: number; returnMph: number; outboundSlowMs: number; returnSlowMs: number; confidence: "high" | "medium" | "low"; }
export type RoadFeatureSource = "OSM" | "USER_CONFIRMED_LOCAL";
export type LocalRoadFeatureType = "TRAFFIC_SIGNAL" | "JUNCTION" | "PEDESTRIAN_CROSSING" | "GIVE_WAY" | "OTHER";
export interface TrafficSignal {
  id: string;
  latitude: number;
  longitude: number;
  /** Source is deliberately explicit so local corrections are never shown as OSM evidence. */
  source?: RoadFeatureSource;
  featureType?: LocalRoadFeatureType;
  createdAt?: string;
  approachBearing?: number | null;
}
export interface LocalRoadFeature {
  id: string;
  latitude: number;
  longitude: number;
  featureType: LocalRoadFeatureType;
  source: "USER_CONFIRMED_LOCAL";
  createdAt: string;
  approachBearing?: number | null;
  label?: string;
}
export type RouteEventClassification = "traffic_signal" | "general_traffic" | "junction" | "pedestrian_crossing" | "customer_parking" | "other_road_delay" | "unclassified";
export interface TrafficLightStop { latitude: number; longitude: number; startedAt: string; endedAt: string; durationMs: number; nearestSignalMetres: number; signalId: string; confidence: "high" | "medium" | "low"; startIndex: number; endIndex: number; source?: "GPS_DERIVED" | "OSM_MATCHED" | "USER_CONFIRMED_LOCAL" | "MANUALLY_CLASSIFIED"; }
export interface SignalQueueEvent { signalId: string; startIndex: number; endIndex: number; startAt: string; endAt: string; durationMs: number; queueDistanceMetres: number; stationaryMs: number; crawlingMs: number; stopCycles: number; averageMph: number; signalDistanceAtStart: number; signalPassDistance: number; confidence: "high" | "medium" | "low"; }
export interface DeliveryRouteEvidence {
  status: "recording" | "complete" | "partial" | "expired" | "disabled";
  startedAt: string;
  completedAt: string | null;
  points: DeliveryRoutePoint[];
  recordedPointCount: number;
  distanceMetres: number;
  gaps: DeliveryRouteGap[];
  issues: DeliveryRouteIssue[];
  stops?: DeliveryRouteStop[];
  detail: RouteGpsDetail;
  retention: RouteRetention;
  expiresAt: string | null;
  expiredAt?: string | null;
}
export type CustomerLocationSource = "manual_delivered" | "user_selected_route_point" | "detected_stop" | "gps_estimate";
/** Chosen before a run begins. Missing values on older deliveries mean driving. */
export type DeliveryTravelMode = "driving" | "walking";
export interface DeliveryExpectedRoute {
  /** A snapshot is captured only from a live Delivered action.  It becomes ready once Back at Store records the actual total. */
  status: "waiting_for_connection" | "connection_verified" | "snapshot" | "ready" | "unavailable";
  customer: { latitude: number; longitude: number; accuracy: number | null; source: CustomerLocationSource } | null;
  outboundSeconds?: number;
  outboundMetres?: number;
  serviceAllowanceSeconds: number;
  returnSeconds?: number;
  returnMetres?: number;
  totalSeconds?: number;
  actualSeconds?: number;
  differenceSeconds?: number;
  routingSource?: "osrm" | "google_routes";
  /** The Google benchmark mode; driving may include traffic while walking does not. */
  travelMode?: DeliveryTravelMode;
  /** A driver-confirmed, one-off Google refresh may exceed the normal two-call allowance for this delivery only. */
  perDeliveryLimitOverride?: boolean;
  calculatedAt: string;
  calculationVersion: 1;
  reason?: string;
  /**
   * Device-local preflight state. It records only connection checks, never an
   * address, API key or provider response. A Google request is not reserved
   * until two uncached health checks have passed ten seconds apart.
   */
  connectionCheck?: { startedAt: string; deadlineAt: string; nextCheckAt: string; successfulChecks: number; attempts: number };
}
export interface CustomerEvent {
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  source: "manual_delivered" | "user_selected_route_point";
  pointIndex: number | null;
  /** 1-based customer position within a single/double run. Older records may omit this. */
  customerIndex?: number;
}
/** A driver-entered explanation for an unusually long customer stop.
 * This is local context only: it never changes GPS, delivery timings, mileage
 * or any Google / OSM result. */
export type CustomerWaitReason = "no_answer_door" | "no_answer_phone" | "slow_to_answer" | "customer_not_ready" | "payment_or_collection" | "other";
export interface CustomerWaitExplanation {
  status: "recorded" | "skipped";
  reasons: CustomerWaitReason[];
  note?: string;
  recordedAt: string;
}
export interface DeliveryDestinationAddress {
  /** Precise fields are retained only while the activity is active. */
  fullAddress?: string;
  houseNumberOrName?: string;
  street?: string;
  locality?: string;
  postcode?: string;
  destination?: { latitude: number; longitude: number; accuracy?: number | null };
  addressSource?: DeliveryAddressSource;
  confirmedAt?: string;
  scanned?: boolean;
  privacyStatus?: "precise" | "sanitised";
}
export interface ActivityRecord {
  id: string;
  shiftId: string;
  type: ActivityType;
  start: string;
  end: string | null;
  taskId?: string;
  taskName?: string;
  notes?: string;
  /** Paid time when the driver was available but management prevented useful work. */
  blockedReason?: BlockedTimeReason;
  blockedNote?: string;
  /** Outcome metadata for repeatable named store work such as Rush Ready. */
  quickCompleted?: boolean;
  completedBySomeoneElse?: boolean;
  deliveryEventId?: string;
  customerDeliveries?: number;
  tracked?: boolean;
  segments?: ActivitySegment[];
  /** Store geofence facts and optional device-local delivery route evidence. */
  storeExitAt?: string | null;
  storeEntryAt?: string | null;
  /** Confirmed inside fix after Delivered; not an exact crossing/Hustle time. */
  storeReturnConfirmedAt?: string | null;
  backAtStoreAt?: string | null;
  storeExitObserved?: boolean;
  storeEntryObserved?: boolean;
  storeExitUnobserved?: boolean;
  storeEntryUnobserved?: boolean;
  locationAssistEnabled?: boolean;
  geofenceLatitude?: number;
  geofenceLongitude?: number;
  geofenceRadius?: number;
  locationAccuracy?: number | null;
  startedOutsideStore?: boolean;
  /** Independent comparison evidence from the Domino's reference boundary. Never drives operational controls or chimes. */
  dominosStoreExitAt?: string | null;
  dominosStoreEntryAt?: string | null;
  dominosStoreExitObserved?: boolean;
  dominosStoreEntryObserved?: boolean;
  dominosStoreExitUnobserved?: boolean;
  dominosStoreEntryUnobserved?: boolean;
  dominosStartedOutsideStore?: boolean;
  dominosGeofenceLatitude?: number;
  dominosGeofenceLongitude?: number;
  dominosGeofenceRadius?: number;
  /** Optional early-dispatch comparison data. Real Hustle still begins at ActivityRecord.start. */
  dominosDispatchStartedAt?: string | null;
  dominosGeofenceExitedAt?: string | null;
  realDeliveryStartedAt?: string | null;
  realGeofenceExitedAt?: string | null;
  earlyDispatchGapSeconds?: number | null;
  dominosHustleSeconds?: number | null;
  realHustleSeconds?: number | null;
  wasEarlyDispatched?: boolean;
  routeEvidence?: DeliveryRouteEvidence | null;
  /** Explicit, local-only customer arrival evidence. Never stores an address or customer identity. */
  customerEvents?: CustomerEvent[];
  /** Optional driver context for a customer wait over three minutes. Never changes recorded evidence. */
  customerWaitExplanation?: CustomerWaitExplanation | null;
  /** Driver-applied context for a waiting/stationary GPS point. This is an annotation, never fabricated GPS data. */
  routePointContexts?: { pointIndex: number; context: "customer_house" | "traffic_light" | "road_delay" | "waiting"; setAt: string }[];
  /** Optional manual classification of one recorded event. This is never presented as independent OSM evidence. */
  routeEventClassifications?: { pointIndex: number; classification: RouteEventClassification; source: "MANUALLY_CLASSIFIED"; setAt: string }[];
  /** A separately calculated road-route benchmark. It never changes the recorded route, timing or mileage. */
  expectedRoute?: DeliveryExpectedRoute | null;
  /** The mode selected for this delivery only. It never changes GPS recording or geofence statistics. */
  travelMode?: DeliveryTravelMode;
  /** A one-off integration check. It follows the normal live delivery flow but is excluded from pay, delivery and work-time totals. */
  testOnly?: boolean;
  /** Keep count/payment, but exclude unreliable delivery GPS and timing from statistics. */
  badDelivery?: boolean;
  /** A stock collection follows the protected delivery GPS journey, but is never a customer delivery or a fuel reimbursement. */
  stockRun?: boolean;
  /** Temporary destination details while active; sanitised at completion. */
  deliveryDestinations?: DeliveryDestinationAddress[];
  /** A stack of short operational jobs tracked as one continuous timer. */
  quickStack?: boolean;
  quickItems?: string[];
  /** Beta audit for the optional 10m physical-store return proof. */
  storePresenceProof?: StorePresenceProof;
}
export interface CleaningTaskDefinition {
  id: string;
  name: string;
  area: string;
  description: string;
  weekday: number;
  enabled: boolean;
  order: number;
  expectedMinutes?: number | null;
  notes?: string;
  category?: "cleaning" | "prep";
  /** Preparation jobs that may legitimately not be needed on a particular delivery day. */
  allowNotRequired?: boolean;
  /** Starts each new shift as not required until the driver marks it required. */
  notRequiredByDefault?: boolean;
}
export interface CleaningPhotoVariant { storageId: string; createdAt: string; expiresAt: string; width: number; height: number; size: number }
export interface CleaningPhotoProof { photoProof: boolean; attachedAt: string; highRes: CleaningPhotoVariant | null; compressed: CleaningPhotoVariant | null }
export interface ShiftTaskRecord extends CleaningTaskDefinition {
  sourceTaskId: string;
  status: TaskStatus;
  segments: ActivitySegment[];
  completedAt: string | null;
  quickCompleted: boolean;
  /** The task was completed by another person; no driver work duration is fabricated. */
  completedBySomeoneElse?: boolean;
  /** A documented operational reason the task could not be completed; it remains distinct from completion. */
  unableReason?: TaskUnableReason | null;
  unableManager?: string | null;
  unableAt?: string | null;
  /** Bulk/reversible outcome: scheduled work was prevented by management. */
  managementBlockedAt?: string | null;
  managementBlockedBatchId?: string | null;
  /** A neutral preparation outcome: the item was not needed, rather than missed or completed. */
  notRequired?: boolean;
  notRequiredAt?: string | null;
  shiftNotes?: string;
  photoProof?: CleaningPhotoProof | null;
  /** Additional proof attachments. The legacy photoProof field remains the first attachment for migration compatibility. */
  photoProofs?: CleaningPhotoProof[];
}

export interface BreakPeriod { id: string; start: string; end: string | null }
export interface NoBreakRecord { expectedDeduction: boolean; reason: string; note?: string; recordedAt: string }
export interface DeliveryEvent { id: string; type: DeliveryKind; timestamp: string; reimbursementPence: number; activityId?: string; /** A diagnostic run used only to verify integrations; never included in shift delivery totals. */ testOnly?: boolean }
export interface Mileage {
  method: MileageMethod;
  startTenths: number | null;
  endTenths: number | null;
  directTenths: number | null;
  /** Cumulative GPS delivery miles already represented by the last manual reading. */
  gpsBaselineTenths?: number | null;
}

export interface ClockInApproval {
  reason: "unscheduled" | "early";
  managerName: string;
  areaManagerApprovalConfirmed: true;
  recordedAt: string;
  scheduledStart?: string;
  minutesEarly?: number;
}

export type LateClockInReason = "traffic" | "public_transport" | "vehicle_issue" | "weather" | "personal_emergency" | "manager_delayed_start" | "rota_changed" | "other";

export interface LateClockInExplanation {
  reason: LateClockInReason;
  note?: string;
  recordedAt: string;
  scheduledStart: string;
  minutesLate: number;
}

export interface ManualShiftEntry {
  reason: "missed_tracking" | "payslip_reconciliation";
  note?: string;
  recordedAt: string;
}

export type ShiftContextTag = "asked_to_stay_late" | "sent_home_early" | "covering_driver" | "unexpectedly_busy" | "unexpectedly_quiet" | "rota_changed" | "store_operational_issue" | "understaffed" | "no_work_assigned" | "management_blocked" | "equipment_issue" | "good_teamwork" | "other";
export interface ShiftContext {
  managerOnDuty?: string;
  tags: ShiftContextTag[];
  note?: string;
  recordedAt: string;
  updatedAt: string;
}

export type ShiftRatingValue = 1 | 2 | 3 | 4 | 5;
export interface ShiftRatingReview {
  overallRating: ShiftRatingValue;
  managerRating: ShiftRatingValue;
  recordedAt: string;
  updatedAt: string;
}

export function shiftOverallRatingLabel(
  rating: number,
  audience: "private" | "professional" = "private",
) {
  const labels = audience === "professional"
    ? ["Very difficult", "Difficult", "Satisfactory", "Good", "Excellent"]
    : ["Shit show", "Rough", "Alright", "Good", "Excellent"];
  return labels[Math.max(1, Math.min(5, Math.round(rating))) - 1];
}

export function managerRatingLabel(
  rating: number,
  audience: "private" | "professional" = "private",
) {
  const labels = audience === "professional"
    ? ["Management obstructive", "Poor", "Mixed", "Good", "Excellent"]
    : ["Idiot in charge", "Poor", "Mixed", "Good", "Excellent"];
  return labels[Math.max(1, Math.min(5, Math.round(rating))) - 1];
}

export function shiftContextTagLabel(tag: ShiftContextTag) {
  return ({
    asked_to_stay_late: "Asked to stay late",
    sent_home_early: "Sent home early",
    covering_driver: "Covering another driver",
    unexpectedly_busy: "Unexpectedly busy",
    unexpectedly_quiet: "Unexpectedly quiet",
    rota_changed: "Rota changed",
    store_operational_issue: "Store operational issue",
    understaffed: "Understaffed",
    no_work_assigned: "No work assigned",
    management_blocked: "Management blocked",
    equipment_issue: "Equipment issue",
    good_teamwork: "Good teamwork",
    other: "Other",
  } as const)[tag];
}

const SHIFT_CONTEXT_TAGS = new Set<ShiftContextTag>([
  "asked_to_stay_late", "sent_home_early", "covering_driver",
  "unexpectedly_busy", "unexpectedly_quiet", "rota_changed",
  "store_operational_issue", "understaffed", "no_work_assigned",
  "management_blocked", "equipment_issue", "good_teamwork", "other",
]);

export function applyShiftRatingReview(
  shift: Shift,
  review: {
    overallRating: number;
    managerRating: number;
    managerOnDuty?: string;
    tags: ShiftContextTag[];
    note?: string;
  },
  at = new Date().toISOString(),
): { ok: true } | { ok: false; message: string } {
  if (
    !Number.isInteger(review.overallRating) ||
    review.overallRating < 1 ||
    review.overallRating > 5 ||
    !Number.isInteger(review.managerRating) ||
    review.managerRating < 1 ||
    review.managerRating > 5
  ) return { ok: false, message: "Choose a valid shift and manager rating." };
  if (!Array.isArray(review.tags) || review.tags.some((tag) => !SHIFT_CONTEXT_TAGS.has(tag)))
    return { ok: false, message: "Choose valid shift context tags." };
  if (!Number.isFinite(Date.parse(at)))
    return { ok: false, message: "The review time is invalid." };
  const managerOnDuty = review.managerOnDuty?.trim().slice(0, 100) || undefined;
  const note = review.note?.trim().slice(0, 500) || undefined;
  shift.context = {
    managerOnDuty,
    tags: [...new Set(review.tags)],
    note,
    recordedAt: shift.context?.recordedAt ?? at,
    updatedAt: at,
  };
  shift.ratingReview = {
    overallRating: review.overallRating as ShiftRatingValue,
    managerRating: review.managerRating as ShiftRatingValue,
    recordedAt: shift.ratingReview?.recordedAt ?? at,
    updatedAt: at,
  };
  shift.updatedAt = at;
  return { ok: true };
}

export type ShiftIncidentCategory = "delivery_issue" | "customer_delay" | "store_issue" | "manager_instruction" | "vehicle_issue" | "safety_issue" | "other";
export interface ShiftIncident {
  id: string;
  shiftId: string;
  activityId?: string;
  capturedAt: string;
  category?: ShiftIncidentCategory;
  note?: string;
  manager?: string;
  updatedAt?: string;
}

export type ShiftAnomalyReviewStatus = "dismissed" | "expected";
export interface ShiftAnomalyReview {
  rule: string;
  status: ShiftAnomalyReviewStatus;
  note?: string;
  updatedAt: string;
}

export interface PendingEarlyDispatch {
  dominosDispatchStartedAt: string;
  dominosGeofenceExitedAt: string | null;
  dominosGeofenceLatitude: number;
  dominosGeofenceLongitude: number;
  dominosGeofenceRadius: number;
}

export interface PendingBlockedTimeResume {
  reason: BlockedTimeReason;
  note?: string;
}

export type StoreId = "ormskirk" | "maghull";

export interface Shift {
  /** Absent on older records; do not rewrite their original evidence. */
  storeId?: StoreId;
  id: string;
  status: ShiftStatus;
  clockIn: string;
  clockOut: string | null;
  breaks: BreakPeriod[];
  deliveries: DeliveryEvent[];
  mileage: Mileage;
  hourlyRatePence: number;
  singleRatePence: number;
  doubleRatePence: number;
  manualDeliveryCount: number | null;
  reimbursementStatus: "awaiting" | "paid";
  reimbursementPaymentId: string | null;
  noBreakRecord?: NoBreakRecord | null;
  reviewStatus?: "incomplete" | "complete";
  isLocked?: boolean;
  role?: ShiftRole;
  cleaningOverride?: boolean | null;
  cleaningRequired?: boolean;
  taskSnapshot?: ShiftTaskRecord[];
  activities?: ActivityRecord[];
  /** A cleaning or preparation task paused for a delivery hand-off. */
  pendingResumeTaskId?: string | null;
  /** A named store-work timer (for example Rush Ready) paused for a delivery hand-off. */
  pendingResumeOtherTaskId?: string | null;
  /** Blocked Time interrupted by a delivery, retained so Back at Store can offer a truthful continuation. */
  pendingResumeBlockedTime?: PendingBlockedTimeResume | null;
  /** Temporary Domino's-only timer. It creates no delivery and is consumed by the next normal run. */
  pendingEarlyDispatch?: PendingEarlyDispatch | null;
  /** A verified dispatch notice received while another delivery is still open.
   * It belongs to the next normal run and is consumed only when that run starts. */
  queuedEarlyDispatch?: PendingEarlyDispatch | null;
  /** A separate, optional carryout-zone departure marker. It creates no delivery
   * until the driver explicitly chooses Single or Double. */
  pendingCarryoutDepartureAt?: string | null;
  /** Prevents the post-clock-in first-task prompt from appearing more than once for this shift. */
  firstTaskPromptHandled?: boolean;
  rotaEntryId?: string;
  scheduledDate?: string;
  scheduledStart?: string;
  scheduledShiftType?: RotaShiftType;
  scheduledShiftLabel?: string;
  scheduledEnd?: string;
  punctualityToleranceMinutes?: number;
  /** Approval evidence captured before an unscheduled or 15+ minute early start. */
  clockInApproval?: ClockInApproval;
  /** Driver-provided context captured only when the rota start is missed by more than the allowed tolerance. */
  lateClockInExplanation?: LateClockInExplanation;
  /** Records that this completed shift was added retrospectively rather than clocked live. */
  manualEntry?: ManualShiftEntry;
  /** Optional operational context. It never changes payroll, GPS or delivery calculations. */
  context?: ShiftContext;
  /** Optional personal review. Private labels are translated for professional reports. */
  ratingReview?: ShiftRatingReview;
  /** Exact-time, user-created incident markers. */
  incidents?: ShiftIncident[];
  /** User decisions about derived review suggestions; suggestions themselves are never persisted. */
  anomalyReviews?: ShiftAnomalyReview[];
  createdAt: string;
  updatedAt: string;
}

export interface ReimbursementPayment {
  id: string;
  date: string;
  /** Amount received; expectedAmountPence preserves the original entitlement. */
  amountPence: number;
  expectedAmountPence?: number;
  shiftIds: string[];
  reversedAt: string | null;
}

/** A reconciliation-only balance for work completed before this tracker was started. */
export interface PayrollPreTrackerAdjustment {
  /** Gross wages from before tracking began, in pence. */
  grossPayPence: number;
  /** Paid time from before tracking began, in milliseconds. */
  paidMs: number;
}

/** A saved copy of the figures printed on one Domino's payslip. */
export interface PayrollPayslipSnapshot {
  /** Gross wages from the payslip in pence; delivery fuel stays separate. */
  grossPayPence: number;
  /** Paid hours from the payslip in milliseconds. */
  paidMs: number;
  /** Optional balance kept only for a pay period that began before tracking. */
  preTrackerAdjustment?: PayrollPreTrackerAdjustment | null;
  recordedAt: string;
  updatedAt: string;
}

export interface PayrollSchedule {
  /** Calendar month containing the pay cut-off, e.g. 2026-08. */
  monthKey: string;
  periodStartDate?: string;
  cutoffDate: string;
  paydayDate: string;
  isFiveWeekPay?: boolean;
  paidAt: string | null;
  /** Optional payslip figures kept separately from the tracker ledger. */
  payslip?: PayrollPayslipSnapshot | null;
}

/** Optional OpenStreetMap context groups. GPS evidence, geofence and Hustle do not depend on these. */
export interface OSMRoadFeatureSettings {
  trafficSignals: boolean;
  junctionControls: boolean;
  pedestrianCrossings: boolean;
  calmingAndRoundabouts: boolean;
  roadMetadata: boolean;
  restrictions: boolean;
}

export interface Settings {
  nextStoreId?: StoreId;
  hourlyRatePence: number;
  singleRatePence: number;
  doubleRatePence: number;
  /** Legacy manual stock-run estimate. New calculations use the fixed Corsa baseline below. */
  stockRunFuelCostPencePerMile?: number;
  /** Fixed Corsa 1.4 baseline: 45 litre tank over a 350 mile range. */
  corsaTankLitres?: number;
  corsaMilesPerTank?: number;
  /** Current petrol price, in pence per litre. */
  petrolPricePencePerLitre?: number;
  paymentDay: number;
  mileagePreference: MileagePreference;
  theme: ThemePreference;
  /** Visual treatment for Settings only; the rest of the tracker keeps its chosen app theme. */
  settingsStyle?: "original" | "android";
  /** Presentation preference only; absent means redesigned view. */
  legacyView?: boolean;
  deliveryDays?: number[];
  locationAssistEnabled?: boolean;
  storeLatitude?: number;
  storeLongitude?: number;
  storeRadiusMetres?: number;
  /** Physical store point used only for map context and routing origins/destinations. */
  storeDisplayLatitude?: number;
  storeDisplayLongitude?: number;
  storeDisplayLabel?: string;
  /** Editable comparison radius. The protected Real Hustle boundary is never changed by this value. */
  dominosReferenceRadiusMetres?: number;
  operationalAllowances?: OperationalAllowanceSettings;
  geofenceSoundEnabled?: boolean;
  geofenceChimeStyle?: GeofenceChimeStyle;
  /** Beta-only return-button safeguard; disabled by default. */
  storePresenceProofEnabled?: boolean;
  /** Beta-only delivery-start safeguard; disabled by default. */
  storePresenceStartProofEnabled?: boolean;
  /** Adjustable only for the separate Beta delivery-start proof; never a live geofence radius. */
  storePresenceStartProofRadiusMetres?: number;
  /** A separately calibrated, small carryout box. It never changes the protected Real Hustle boundary. */
  carryoutDepartureAssistEnabled?: boolean;
  carryoutDepartureZone?: CarryoutDepartureZone | null;
  recordDeliveryRoutes?: boolean;
  routeGpsDetail?: RouteGpsDetail;
  routeRetention?: RouteRetention;
  showGpsPointsByDefault?: boolean;
  /** Enables the locally held Google Routes key. The hard safety limits are never configurable. */
  googleRoutesEnabled?: boolean;
  /** Optional intelligence services are explicit device settings, never render-time triggers. */
  /** Shows the address window before a delivery. When false, Single/Double starts GPS-only. */
  deliveryAddressEnabled?: boolean;
  receiptScanningEnabled?: boolean;
  googleAddressValidationEnabled?: boolean;
  osmRoadIntelligenceEnabled?: boolean;
  osmRoadFeatureSettings?: OSMRoadFeatureSettings;
  historicalDeliveryLocationPrivacy?: HistoricalDeliveryLocationPrivacy;
  deletePreciseAddressAfter?: "back_at_store" | "delivered";
  trafficClassification?: { freeFlowMph: number; moderateMph: number; slowMph: number; stationarySeconds: number; signalQueueLookAheadMetres?: number };
  /** Maximum distance upstream used when grouping a GPS stop/move queue to a downstream signal. */
  signalQueueLookAheadMetres?: number;
  /** Device-local, privacy-safe road corrections. Coordinates only; never customer addresses. */
  localRoadFeatures?: LocalRoadFeature[];
  /** Include pre-launch test records in normal reports and history views. */
  includeBetaData?: boolean;
  /** Include pre-launch cleaning checklists in compliance and cleaning statistics. */
  includeBetaCleaningData?: boolean;
  /** Include beta Hustle timings that differ sharply from the typical recorded pattern. */
  includeQuestionableBetaHustle?: boolean;
  /** Which complete boundary dataset is presented in Hustle analytics and WITH HUSTLE benchmarks. */
  hustleStatsSource?: HustleSource;
  punctualityToleranceMinutes?: number;
  rotaNotificationsEnabled?: boolean;
  rotaMorningReminderEnabled?: boolean;
  rotaMorningReminderTime?: string;
  rotaOneHourReminderEnabled?: boolean;
  rotaOneHourMinutesBefore?: number;
  rotaFifteenMinuteReminderEnabled?: boolean;
  rotaFifteenMinuteMinutesBefore?: number;
  rotaSundayReminderEnabled?: boolean;
  rotaSundayReminderTime?: string;
  /** Store-specific products hidden from the Dashboard shelf-life reference. */
  shelfLifeHiddenProductIds?: string[];
  /** User-defined labels shown as an additional Quick Tasks group. */
  customQuickTasks?: string[];
  /** Master switch for the compact Quick Jobs workspace. */
  quickTasksEnabled?: boolean;
  /** Stable built-in/custom job ids deliberately hidden by the owner. */
  hiddenQuickTaskIds?: string[];
  /** Optional owner-defined ordering. Unlisted jobs retain catalogue order. */
  quickTaskOrder?: string[];
  /** Owner-defined category order for the Quick Jobs workspace. */
  quickTaskCategoryOrder?: QuickTaskCategoryId[];
  /** Category assignments for custom labels, keyed by their normalised label. */
  customQuickTaskCategories?: Record<string, QuickTaskCategoryId>;
  /** Controls the optional questions shown immediately after clock-in. */
  startupPromptsEnabled?: boolean;
  /** Ask which driver role applies to this shift. */
  clockInRolePromptEnabled?: boolean;
  /** Role used when the role question is disabled. */
  defaultShiftRole?: ShiftRole;
  /** Ask which task should start first after clock-in. */
  firstTaskPromptEnabled?: boolean;
  /** Selected task source IDs; an empty list means all eligible tasks. */
  firstTaskPromptTaskIds?: string[];
  /** Include the built-in rush preparation option in the first-task question. */
  firstTaskPromptIncludeRushReady?: boolean;
  /** Android companion features mirror web state; the web database remains authoritative. */
  automaticDispatchTimer?: boolean;
  alwaysOnShiftMonitoring?: boolean;
  shiftMonitoringHighAccuracy?: boolean;
  androidLiveShiftNotification?: boolean;
  androidNotificationActions?: boolean;
  androidShiftReminders?: boolean;
  androidBreakReminders?: boolean;
  androidTaskReminders?: boolean;
  androidPhotoCompression?: "automatic" | "original";
  /** Durable, local tombstones for source shifts deleted after they have
   * already been mirrored to James OS. They are replayed idempotently through
   * the normal Android bridge when it next becomes available. */
  jamesOsShiftRetractions?: JamesOsShiftRetraction[];
}

export type QuickTaskCategoryId =
  | "customer"
  | "makeline"
  | "stock"
  | "cleaning"
  | "oven_front"
  | "other";

export interface QuickTaskCategoryDefinition {
  id: QuickTaskCategoryId;
  label: string;
  icon: string;
}

export interface QuickTaskJobDefinition {
  id: string;
  label: string;
  category: QuickTaskCategoryId;
  icon: string;
  aliases?: readonly string[];
  custom?: boolean;
}

export const QUICK_TASK_CATEGORIES: readonly QuickTaskCategoryDefinition[] = [
  { id: "customer", label: "Customer", icon: "☎" },
  { id: "makeline", label: "Makeline / food", icon: "◉" },
  { id: "stock", label: "Stock", icon: "▦" },
  { id: "cleaning", label: "Cleaning", icon: "✦" },
  { id: "oven_front", label: "Oven / front", icon: "▤" },
  { id: "other", label: "Other", icon: "+" },
] as const;

export const QUICK_TASK_JOBS: readonly QuickTaskJobDefinition[] = [
  { id: "take-customer-order", label: "Take customer order", category: "customer", icon: "✎", aliases: ["Take customer orders"] },
  { id: "answer-phone", label: "Answer phone", category: "customer", icon: "☎" },
  { id: "serve-collection", label: "Serve collection", category: "customer", icon: "↗" },
  { id: "take-payment", label: "Take payment", category: "customer", icon: "£" },
  { id: "help-customer", label: "Help customer", category: "customer", icon: "?" },
  { id: "make-pizzas", label: "Make pizzas", category: "makeline", icon: "◉" },
  { id: "top-pizzas", label: "Top pizzas", category: "makeline", icon: "+" },
  { id: "sauce-pizzas", label: "Sauce pizzas", category: "makeline", icon: "◎" },
  { id: "cut-box-pizzas", label: "Cut / box pizzas", category: "makeline", icon: "✣" },
  { id: "bag-order", label: "Bag an order", category: "makeline", icon: "▱" },
  { id: "help-makeline", label: "Help makeline", category: "makeline", icon: "↔" },
  { id: "stock-chiller", label: "Get stock from chiller", category: "stock", icon: "❄" },
  { id: "put-stock-away", label: "Put stock away", category: "stock", icon: "↓" },
  { id: "restock-makeline", label: "Restock makeline", category: "stock", icon: "▦" },
  { id: "restock-boxes", label: "Restock boxes", category: "stock", icon: "□" },
  { id: "refill-drinks", label: "Refill drinks", category: "stock", icon: "◒", aliases: ["Refill drinks / sauces"] },
  { id: "refill-sauces-dips", label: "Refill sauces / dips", category: "stock", icon: "●" },
  { id: "restock-packaging", label: "Restock packaging", category: "stock", icon: "▧" },
  { id: "brush-sweep", label: "Brush / sweep up", category: "cleaning", icon: "⌁", aliases: ["Brushing up"] },
  { id: "mop-floor", label: "Mop floor", category: "cleaning", icon: "⌇" },
  { id: "wipe-counters", label: "Wipe counters", category: "cleaning", icon: "—" },
  { id: "wipe-equipment", label: "Wipe equipment", category: "cleaning", icon: "◇" },
  { id: "wash-dishes", label: "Wash dishes", category: "cleaning", icon: "≈" },
  { id: "empty-bins", label: "Empty bins", category: "cleaning", icon: "▽" },
  { id: "cardboard-rubbish", label: "Cardboard / rubbish", category: "cleaning", icon: "♻" },
  { id: "clean-customer-area", label: "Clean customer area", category: "cleaning", icon: "✦" },
  { id: "clean-collection-area", label: "Clean collection area", category: "cleaning", icon: "✧" },
  { id: "doing-oven", label: "Doing oven", category: "oven_front", icon: "◫" },
  { id: "fold-make-boxes", label: "Fold / make boxes", category: "oven_front", icon: "□", aliases: ["Make boxes"] },
  { id: "organise-orders", label: "Organise orders", category: "oven_front", icon: "≡", aliases: ["Check delivery bags"] },
  { id: "collection-handoff", label: "Collection handoff", category: "oven_front", icon: "⇄" },
  { id: "help-team-member", label: "Help another team member", category: "other", icon: "+" },
  { id: "general-tidy", label: "General tidy", category: "other", icon: "✓" },
  { id: "other-quick-job", label: "Other quick job", category: "other", icon: "…" },
] as const;

export function normaliseQuickTaskLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function quickTaskIdForCustomLabel(label: string): string {
  return `custom:${normaliseQuickTaskLabel(label)}`;
}

export function resolveQuickJobs(settings: Settings): QuickTaskJobDefinition[] {
  if (settings.quickTasksEnabled === false) return [];
  const hidden = new Set(settings.hiddenQuickTaskIds ?? []);
  const builtInLabels = new Set(
    QUICK_TASK_JOBS.flatMap((job) => [job.label, ...(job.aliases ?? [])]).map(normaliseQuickTaskLabel),
  );
  const customJobs = (settings.customQuickTasks ?? [])
    .filter((label) => !builtInLabels.has(normaliseQuickTaskLabel(label)))
    .map((label): QuickTaskJobDefinition => {
      const key = normaliseQuickTaskLabel(label);
      return {
        id: quickTaskIdForCustomLabel(label),
        label,
        category: settings.customQuickTaskCategories?.[key] ?? "other",
        icon: "+",
        custom: true,
      };
    });
  const catalogue = [...QUICK_TASK_JOBS, ...customJobs].filter((job) => !hidden.has(job.id));
  const taskOrder = new Map((settings.quickTaskOrder ?? []).map((id, index) => [id, index]));
  const categoryOrder = new Map(
    (settings.quickTaskCategoryOrder ?? QUICK_TASK_CATEGORIES.map((category) => category.id))
      .map((id, index) => [id, index]),
  );
  const catalogueOrder = new Map(catalogue.map((job, index) => [job.id, index]));
  return catalogue.sort((a, b) =>
    (categoryOrder.get(a.category) ?? QUICK_TASK_CATEGORIES.length) -
      (categoryOrder.get(b.category) ?? QUICK_TASK_CATEGORIES.length) ||
    (taskOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (taskOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
    (catalogueOrder.get(a.id) ?? 0) - (catalogueOrder.get(b.id) ?? 0));
}

export function frequentQuickJobs(
  shifts: Shift[],
  jobs: Array<Pick<QuickTaskJobDefinition, "id" | "label" | "aliases">>,
  limit = 4,
): Array<Pick<QuickTaskJobDefinition, "id" | "label">> {
  const lookup = new Map<string, (typeof jobs)[number]>();
  jobs.forEach((job) => [job.label, ...(job.aliases ?? [])].forEach((label) => lookup.set(normaliseQuickTaskLabel(label), job)));
  const usage = new Map<string, { count: number; lastUsedAt: number; job: (typeof jobs)[number] }>();
  let recognisedCount = 0;
  shifts.forEach((shift) => (shift.activities ?? []).forEach((activity) => {
    if (!activity.quickStack || activity.testOnly) return;
    const usedAt = Date.parse(activity.end ?? activity.start);
    (activity.quickItems ?? []).forEach((label) => {
      const job = lookup.get(normaliseQuickTaskLabel(label));
      if (!job) return;
      recognisedCount += 1;
      const prior = usage.get(job.id);
      usage.set(job.id, {
        count: (prior?.count ?? 0) + 1,
        lastUsedAt: Math.max(prior?.lastUsedAt ?? 0, Number.isFinite(usedAt) ? usedAt : 0),
        job,
      });
    });
  }));
  if (recognisedCount < 3) return [];
  return [...usage.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, Math.max(0, limit))
    .map(({ job }) => ({ id: job.id, label: job.label }));
}

export interface JamesOsShiftRetraction {
  shiftId: string;
  revision: number;
  retractedAtEpochMs: number;
}

export type CarryoutZoneCornerLabel =
  | "front_left"
  | "front_right"
  | "back_right"
  | "back_left";

export interface CarryoutZoneCorner {
  label: CarryoutZoneCornerLabel;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

/** Four driver-recorded samples used to centre the small carryout departure/return box. */
export interface CarryoutDepartureZone {
  version: 1;
  corners: CarryoutZoneCorner[];
  calibratedAt: string;
}

export interface OperationalAllowanceSettings {
  comfortMinutesPerHour: number;
  orderHandlingMinutesPerOrder: number;
  transitionSeconds: number;
  returnResetMinutes: number;
  maximumMinutesPerHour: number;
}

export interface AppData {
  version: 1;
  settings: Settings;
  shifts: Shift[];
  payments: ReimbursementPayment[];
  payrollSchedules?: PayrollSchedule[];
  lastBackupAt?: string | null;
  settingsRevision?: number;
  cleaningRota?: CleaningTaskDefinition[];
  preparationRota?: CleaningTaskDefinition[];
  rotaWeeks?: RotaWeek[];
}

export const DAY_MS = 86_400_000;
/** 24 August 2026 00:00 in Europe/London (BST). Earlier shifts are beta records. */
export const LIVE_DATA_START_AT = "2026-08-23T23:00:00.000Z";
export const BREAK_REQUIRED_MS = 6 * 3_600_000;
export const BREAK_REVIEW_LEEWAY_MS = 5 * 60_000;
/** Protected delivery-statistics geofence. Do not use the display pin here. */
export const REAL_STATS_GEOFENCE = Object.freeze({ latitude: 53.56845, longitude: -2.88802, radius: 35, protected: true });
/** Additive comparison boundary. It never replaces or controls the protected real-stat geofence. */
export const DOMINOS_REFERENCE_GEOFENCE = Object.freeze({ latitude: 53.56822592818352, longitude: -2.887807336362812, radius: 75, protected: true });
/** Backwards-compatible name for the protected geofence centre. */
export const DEFAULT_STORE_LOCATION = Object.freeze({ latitude: REAL_STATS_GEOFENCE.latitude, longitude: REAL_STATS_GEOFENCE.longitude });
/** Physical store/building point used for map markers and route context only. */
export const DEFAULT_STORE_DISPLAY_LOCATION = Object.freeze({ latitude: 53.568186, longitude: -2.887791, label: "Domino's Ormskirk" });
const LEGACY_OLD_STORE_LOCATION = Object.freeze({ latitude: 53.5669481, longitude: -2.8860588 });
export const DEFAULT_SETTINGS: Settings = {
  hourlyRatePence: 1296,
  singleRatePence: 100,
  doubleRatePence: 150,
  stockRunFuelCostPencePerMile: 20.43,
  corsaTankLitres: 45,
  corsaMilesPerTank: 350,
  petrolPricePencePerLitre: 158.9,
  paymentDay: 3,
  mileagePreference: "direct",
  theme: "system",
  settingsStyle: "original",
  legacyView: false,
  deliveryDays: [2, 4, 6],
  locationAssistEnabled: true,
  storeLatitude: DEFAULT_STORE_LOCATION.latitude,
  storeLongitude: DEFAULT_STORE_LOCATION.longitude,
  storeRadiusMetres: REAL_STATS_GEOFENCE.radius,
  storeDisplayLatitude: DEFAULT_STORE_DISPLAY_LOCATION.latitude,
  storeDisplayLongitude: DEFAULT_STORE_DISPLAY_LOCATION.longitude,
  storeDisplayLabel: DEFAULT_STORE_DISPLAY_LOCATION.label,
  dominosReferenceRadiusMetres: DOMINOS_REFERENCE_GEOFENCE.radius,
  operationalAllowances: { comfortMinutesPerHour: 5, orderHandlingMinutesPerOrder: 1, transitionSeconds: 45, returnResetMinutes: 1, maximumMinutesPerHour: 15 },
  geofenceSoundEnabled: true,
  geofenceChimeStyle: "classic",
  storePresenceProofEnabled: false,
  storePresenceStartProofEnabled: false,
  storePresenceStartProofRadiusMetres: 25,
  carryoutDepartureAssistEnabled: false,
  carryoutDepartureZone: null,
  recordDeliveryRoutes: true,
  routeGpsDetail: "standard",
  routeRetention: "90",
  showGpsPointsByDefault: false,
  googleRoutesEnabled: false,
  deliveryAddressEnabled: true,
  receiptScanningEnabled: true,
  googleAddressValidationEnabled: true,
  osmRoadIntelligenceEnabled: true,
  osmRoadFeatureSettings: { trafficSignals: true, junctionControls: true, pedestrianCrossings: true, calmingAndRoundabouts: true, roadMetadata: true, restrictions: true },
  historicalDeliveryLocationPrivacy: "street_postcode",
  deletePreciseAddressAfter: "delivered",
  trafficClassification: { freeFlowMph: 20, moderateMph: 10, slowMph: 5, stationarySeconds: 10, signalQueueLookAheadMetres: 400 },
  signalQueueLookAheadMetres: 400,
  localRoadFeatures: [],
  includeBetaData: false,
  includeBetaCleaningData: false,
  includeQuestionableBetaHustle: false,
  startupPromptsEnabled: true,
  clockInRolePromptEnabled: true,
  defaultShiftRole: "open",
  firstTaskPromptEnabled: true,
  firstTaskPromptTaskIds: [],
  firstTaskPromptIncludeRushReady: true,
  hustleStatsSource: "real",
  punctualityToleranceMinutes: 10,
  rotaNotificationsEnabled: true,
  rotaMorningReminderEnabled: true,
  rotaMorningReminderTime: "08:00",
  rotaOneHourReminderEnabled: true,
  rotaOneHourMinutesBefore: 60,
  rotaFifteenMinuteReminderEnabled: true,
  rotaFifteenMinuteMinutesBefore: 15,
  rotaSundayReminderEnabled: true,
  rotaSundayReminderTime: "18:00",
  shelfLifeHiddenProductIds: [],
  customQuickTasks: [],
  quickTasksEnabled: true,
  hiddenQuickTaskIds: [],
  quickTaskOrder: [],
  quickTaskCategoryOrder: QUICK_TASK_CATEGORIES.map((category) => category.id),
  customQuickTaskCategories: {},
  androidLiveShiftNotification: true,
  androidNotificationActions: true,
  androidShiftReminders: false,
  androidBreakReminders: false,
  androidTaskReminders: false,
  androidPhotoCompression: "automatic",
};

export const CLEANING_ROTA: CleaningTaskDefinition[] = [
  [1,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [1,"MAKELINE AREA","Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned."],
  [1,"MAKELINE AREA — FLOORS","Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign, including behind makeline."],
  [1,"MAKELINE AREA — DEEP CLEAN","Remove shelves; clean fridge seals, outside and top shelf, keyboard holder and herbs container."],
  [1,"TOP OVEN","Clean surface and glass."],
  [2,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [2,"OFFICE","Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned."],
  [2,"OFFICE & STORAGE AREA — FLOORS","Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign."],
  [2,"OVEN HOOD","Remove and clean filters. Deep clean top of oven and hood including lights."],
  [2,"CUT TABLE","Empty underneath, clean out and check dip dates."],
  [2,"BINS","Clean bins and bin lids inside and out."],
  [3,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [3,"BACK OF HOUSE","Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned."],
  [3,"BACK OF HOUSE — FLOORS","Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign."],
  [3,"WALK IN","Deep clean floor, walls and shelves. Ensure fridge fans are clean."],
  [3,"SIGNAGE","Clean signs, posters and banners inside and outside."],
  [4,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [4,"ASHTRAY","Empty ashtrays."],
  [4,"SINK AREA","Deep clean sink area including shelving, walls and floors under sink."],
  [4,"HOT BAGS","Dismantle hot bag shelving and deep clean."],
  [4,"BOTTOM OVEN","Clean surface and glass."],
  [5,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [5,"FLY CATCHER","Clear and clean fly catcher."],
  [5,"BINS","Clean bins and bin lids inside and out."],
  [5,"ICE CREAM FREEZER","Deep clean shelves, glass and seals, clean motor filters, rotate stock and check dates."],
  [5,"AIR CON & HEATER","Air conditioning: Remove and clean filters. Heater: Brush and remove debris."],
  [6,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [6,"OFFICE","Clean shelves and organise paperwork."],
  [6,"COKE FRIDGE","Deep clean shelves, glass and seals, clean motor filters, rotate stock and check dates."],
  [6,"FIRE EXTINGUISHER","Check dates. Clean stands and tanks plus surrounding wall and floor."],
  [6,"FRONT COUNTER","Deep clean keyboards, screens and phones. Organise cupboards and shelves."],
  [0,"CUSTOMER AREA","Windows, skirting and frames. Walls, floors, menu holder and card machine free of debris."],
  [0,"DRIVER MAP / HOT BAGS / FRIDGES","Walls cleaned including skirting, sellotape removed, picture frames and posters cleaned."],
  [0,"FRONT OF SHOP & CUSTOMER AREA — FLOORS","Deep clean floors using degreaser, scrubbing brush, hot water and wet floor sign."],
  [0,"STORAGE AREAS","Clean dunnage racks and box storage and check dip dates."],
  [0,"HOT RACK","Deep clean top shelf and floor underneath. Check dip dates."],
].map(([weekday, name, description], index) => ({
  id: `rota-${weekday}-${String(index).padStart(2,"0")}`,
  weekday: Number(weekday), name: String(name), area: String(name), description: String(description), enabled: true,
  order: index, expectedMinutes: null, notes: "",
}));

export const PREPARATION_ROTA: CleaningTaskDefinition[] = [
  { id: "prep-00", area: "DRY STOCK", name: "Put dry stock away", description: "Rotate stock, keep shelves tidy and check dates." },
  { id: "prep-01", area: "WEDGES", name: "Prepare wedges", description: "Prepare wedges for service following the store method.", allowNotRequired: true },
  { id: "prep-02", area: "FRIES", name: "Prepare fries", description: "Prepare fries for service and replenish the station.", allowNotRequired: true },
  { id: "prep-03", area: "COOKIES", name: "Prepare cookies", description: "Prepare cookies for service and keep the display stocked.", allowNotRequired: true },
  { id: "prep-04", area: "SAUCE TUBS", name: "Prepare sauce tubs", description: "Fill and date sauce tubs, keeping the sauce station ready." },
  { id: "prep-05", area: "TOPPINGS", name: "Prepare sweetcorn, pineapple and jalapeños", description: "Prepare, portion and replenish sweetcorn, pineapple and jalapeños." },
  { id: "prep-06", area: "CHICKEN", name: "Prepare chicken", description: "Prepare and replenish chicken for service.", allowNotRequired: true },
  { id: "prep-07", area: "OTHER", name: "Prepare other", description: "Record any other preparation needed for this delivery day.", allowNotRequired: true, notRequiredByDefault: true },
].map((task, index) => ({ ...task, weekday: -1, enabled: true, order: index, expectedMinutes: null, notes: "", category: "prep" as const }));

const defaultCleaningRota = () => {
  const rota = structuredClone(CLEANING_ROTA);
  for (let weekday = 0; weekday < 7; weekday += 1) rota.push({ id: `cleaning-dishes-${weekday}`, weekday, name: "Cleaning dishes", area: "DISHES", description: "Wash, sanitise and put away dishes, utensils and cleaning equipment.", enabled: true, order: 99, expectedMinutes: null, notes: "", category: "cleaning" });
  return rota;
};
export const emptyData = (): AppData => ({ version: 1, settings: { ...DEFAULT_SETTINGS, deliveryDays: [...(DEFAULT_SETTINGS.deliveryDays ?? [])], jamesOsShiftRetractions: [] }, shifts: [], payments: [], payrollSchedules: [], lastBackupAt: null, settingsRevision: 7, cleaningRota: defaultCleaningRota(), preparationRota: structuredClone(PREPARATION_ROTA), rotaWeeks: [] });
export const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function getRealStatsGeofence(settings: Settings) {
  void settings;
  return {
    latitude: REAL_STATS_GEOFENCE.latitude,
    longitude: REAL_STATS_GEOFENCE.longitude,
    radius: REAL_STATS_GEOFENCE.radius,
  };
}

export function getDominosReferenceGeofence(settings: Settings) {
  const configuredRadius = Number(settings.dominosReferenceRadiusMetres);
  return {
    latitude: DOMINOS_REFERENCE_GEOFENCE.latitude,
    longitude: DOMINOS_REFERENCE_GEOFENCE.longitude,
    radius: Number.isFinite(configuredRadius) ? Math.min(150, Math.max(40, Math.round(configuredRadius))) : DOMINOS_REFERENCE_GEOFENCE.radius,
  };
}

export function getStoreDisplayLocation(settings: Settings) {
  return {
    latitude: Number.isFinite(settings.storeDisplayLatitude) ? settings.storeDisplayLatitude! : DEFAULT_STORE_DISPLAY_LOCATION.latitude,
    longitude: Number.isFinite(settings.storeDisplayLongitude) ? settings.storeDisplayLongitude! : DEFAULT_STORE_DISPLAY_LOCATION.longitude,
    label: settings.storeDisplayLabel?.trim() || DEFAULT_STORE_DISPLAY_LOCATION.label,
  };
}

function postcodeSector(postcode?: string) {
  const compact = postcode?.trim().toUpperCase().replace(/\s+/g, "");
  if (!compact) return "";
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?\d)/);
  return match ? `${match[1].slice(0, -1)} ${match[1].slice(-1)}` : compact.slice(0, Math.max(0, compact.length - 2));
}

export function sanitiseDeliveryAddress(address: DeliveryDestinationAddress, privacy: HistoricalDeliveryLocationPrivacy): DeliveryDestinationAddress {
  const street = address.street?.trim() || undefined;
  const locality = address.locality?.trim() || undefined;
  const postcode = address.postcode?.trim().toUpperCase() || undefined;
  const sector = postcodeSector(postcode);
  const safe: DeliveryDestinationAddress = { addressSource: address.addressSource, privacyStatus: "sanitised" };
  if (privacy === "street_postcode" || privacy === "street_sector" || privacy === "street_only") {
    if (street) safe.street = street;
    if (locality && privacy !== "street_only") safe.locality = locality;
  }
  if (privacy === "street_postcode" && postcode) safe.postcode = postcode;
  if ((privacy === "street_sector" || privacy === "sector_only") && sector) safe.postcode = sector;
  return safe;
}

export function sanitiseDeliveryDestinations(activity: ActivityRecord, privacy: HistoricalDeliveryLocationPrivacy = "street_postcode") {
  if (!Array.isArray(activity.deliveryDestinations)) return false;
  activity.deliveryDestinations = activity.deliveryDestinations.map((address) => sanitiseDeliveryAddress(address, privacy));
  return true;
}

/**
 * Close a delivery through every completion path, including clock-out while a
 * delivery is still open.  Keeping this in the domain layer prevents the UI
 * buttons from accidentally leaving route evidence recording or a precise
 * address in a completed shift.
 */
export function finaliseDeliveryActivity(activity: ActivityRecord, completedAt: string, privacy: HistoricalDeliveryLocationPrivacy = "street_postcode", confirmReturn = true) {
  activity.end = completedAt;
  if (confirmReturn) activity.backAtStoreAt = completedAt;
  if (activity.routeEvidence?.status === "recording") finalizeRouteEvidence(activity.routeEvidence, completedAt);
  if (activity.expectedRoute?.status === "snapshot") {
    if (confirmReturn && activity.expectedRoute.totalSeconds != null) {
      const actualSeconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(activity.start).getTime()) / 1000));
      activity.expectedRoute.status = "ready";
      activity.expectedRoute.actualSeconds = actualSeconds;
      activity.expectedRoute.differenceSeconds = actualSeconds - activity.expectedRoute.totalSeconds;
    } else {
      activity.expectedRoute.status = "unavailable";
      activity.expectedRoute.reason = "Return was not confirmed before clock-out";
    }
  } else if (activity.expectedRoute?.status === "waiting_for_connection" || activity.expectedRoute?.status === "connection_verified") {
    // A queued preflight is never allowed to send a Google request after the
    // live delivery has ended. The recorded GPS evidence remains untouched.
    activity.expectedRoute.status = "unavailable";
    activity.expectedRoute.reason = "GOOGLE_API_CONNECTION_WAIT_CANCELLED";
  }
  sanitiseDeliveryDestinations(activity, privacy);
  return activity;
}

/**
 * Backups are portable copies, so they must not become a second place where
 * an active full address survives.  Route evidence and its timing metadata
 * remain available; only precise text-address fields are reduced for export.
 */
export function prepareAppDataForBackup(value: AppData) {
  const backup = structuredClone(value);
  backup.shifts.forEach((shift) => {
    alignShiftBoundaryActivities(shift);
    shift.activities?.forEach((activity) => {
      if (Array.isArray(activity.deliveryDestinations)) sanitiseDeliveryDestinations(activity, backup.settings.historicalDeliveryLocationPrivacy ?? "street_postcode");
    });
  });
  return backup;
}

export function migrateAppData(value: AppData): AppData {
  const migrated = structuredClone(value);
  const incomingSettingsRevision = migrated.settingsRevision ?? 0;
  if (typeof migrated.settings.legacyView !== "boolean") migrated.settings.legacyView = false;
  if (!Array.isArray(migrated.rotaWeeks)) migrated.rotaWeeks = [];
  const rotaDefaults = DEFAULT_SETTINGS;
  if (!Number.isFinite(migrated.settings.corsaTankLitres) || migrated.settings.corsaTankLitres! <= 0) migrated.settings.corsaTankLitres = 45;
  if (!Number.isFinite(migrated.settings.corsaMilesPerTank) || migrated.settings.corsaMilesPerTank! <= 0) migrated.settings.corsaMilesPerTank = 350;
  if (!Number.isFinite(migrated.settings.petrolPricePencePerLitre) || migrated.settings.petrolPricePencePerLitre! < 0) migrated.settings.petrolPricePencePerLitre = 158.9;
  if (!Number.isFinite(migrated.settings.punctualityToleranceMinutes)) migrated.settings.punctualityToleranceMinutes = rotaDefaults.punctualityToleranceMinutes;
  // Build 2.1.57 makes the agreed ten-minute grace period the active default
  // for existing installs as well as fresh ones. Exact clock-in times remain
  // unchanged and visible; only the punctuality classification is affected.
  if (incomingSettingsRevision < 7) migrated.settings.punctualityToleranceMinutes = 10;
  if (typeof migrated.settings.rotaNotificationsEnabled !== "boolean") migrated.settings.rotaNotificationsEnabled = true;
  if (typeof migrated.settings.rotaMorningReminderEnabled !== "boolean") migrated.settings.rotaMorningReminderEnabled = true;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(migrated.settings.rotaMorningReminderTime ?? "")) migrated.settings.rotaMorningReminderTime = "08:00";
  if (typeof migrated.settings.rotaOneHourReminderEnabled !== "boolean") migrated.settings.rotaOneHourReminderEnabled = true;
  if (!Number.isFinite(migrated.settings.rotaOneHourMinutesBefore)) migrated.settings.rotaOneHourMinutesBefore = 60;
  if (typeof migrated.settings.rotaFifteenMinuteReminderEnabled !== "boolean") migrated.settings.rotaFifteenMinuteReminderEnabled = true;
  if (!Number.isFinite(migrated.settings.rotaFifteenMinuteMinutesBefore)) migrated.settings.rotaFifteenMinuteMinutesBefore = 15;
  if (typeof migrated.settings.rotaSundayReminderEnabled !== "boolean") migrated.settings.rotaSundayReminderEnabled = true;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(migrated.settings.rotaSundayReminderTime ?? "")) migrated.settings.rotaSundayReminderTime = "18:00";
  if (!Array.isArray(migrated.settings.shelfLifeHiddenProductIds)) migrated.settings.shelfLifeHiddenProductIds = [];
  migrated.settings.shelfLifeHiddenProductIds = [...new Set(migrated.settings.shelfLifeHiddenProductIds.filter((value) => typeof value === "string" && value.length > 0 && value.length <= 80))].slice(0, 200);
  if (!Array.isArray(migrated.settings.customQuickTasks)) migrated.settings.customQuickTasks = [];
  if (typeof migrated.settings.automaticDispatchTimer !== "boolean") migrated.settings.automaticDispatchTimer = false;
  if (typeof migrated.settings.androidLiveShiftNotification !== "boolean") migrated.settings.androidLiveShiftNotification = true;
  if (typeof migrated.settings.androidNotificationActions !== "boolean") migrated.settings.androidNotificationActions = true;
  if (typeof migrated.settings.androidShiftReminders !== "boolean") migrated.settings.androidShiftReminders = false;
  if (typeof migrated.settings.androidBreakReminders !== "boolean") migrated.settings.androidBreakReminders = false;
  if (typeof migrated.settings.androidTaskReminders !== "boolean") migrated.settings.androidTaskReminders = false;
  if (migrated.settings.androidPhotoCompression !== "original") migrated.settings.androidPhotoCompression = "automatic";
  if (!Array.isArray(migrated.settings.jamesOsShiftRetractions)) migrated.settings.jamesOsShiftRetractions = [];
  const shiftRetractions = new Map<string, JamesOsShiftRetraction>();
  migrated.settings.jamesOsShiftRetractions.forEach((value) => {
    if (!value || typeof value.shiftId !== "string" || !value.shiftId.trim() || value.shiftId.length > 128 || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 1_000_000 || !Number.isFinite(value.retractedAtEpochMs) || value.retractedAtEpochMs <= 0) return;
    const next = { shiftId: value.shiftId.trim(), revision: value.revision, retractedAtEpochMs: Math.floor(value.retractedAtEpochMs) };
    const prior = shiftRetractions.get(next.shiftId);
    if (!prior || next.revision >= prior.revision) shiftRetractions.set(next.shiftId, next);
  });
  migrated.settings.jamesOsShiftRetractions = [...shiftRetractions.values()];
  const customQuickTaskLabels = new Set<string>();
  migrated.settings.customQuickTasks = migrated.settings.customQuickTasks
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => {
      const key = value.toLocaleLowerCase("en-GB");
      if (!value || value.length > 60 || customQuickTaskLabels.has(key)) return false;
      customQuickTaskLabels.add(key);
      return true;
    })
    .slice(0, 24);
  if (typeof migrated.settings.quickTasksEnabled !== "boolean") migrated.settings.quickTasksEnabled = true;
  const quickTaskCategoryIds = new Set<QuickTaskCategoryId>(QUICK_TASK_CATEGORIES.map((category) => category.id));
  const customQuickTaskIds = new Map(
    migrated.settings.customQuickTasks.map((label) => [`custom:${normaliseQuickTaskLabel(label)}`, label] as const),
  );
  const validQuickTaskIds = new Set([
    ...QUICK_TASK_JOBS.map((job) => job.id),
    ...customQuickTaskIds.keys(),
  ]);
  const normaliseQuickTaskIds = (value: unknown) => {
    const seen = new Set<string>();
    return (Array.isArray(value) ? value : [])
      .filter((id): id is string => typeof id === "string" && validQuickTaskIds.has(id) && !seen.has(id) && Boolean(seen.add(id)));
  };
  migrated.settings.hiddenQuickTaskIds = normaliseQuickTaskIds(migrated.settings.hiddenQuickTaskIds);
  migrated.settings.quickTaskOrder = normaliseQuickTaskIds(migrated.settings.quickTaskOrder);
  const savedCategoryOrder = Array.isArray(migrated.settings.quickTaskCategoryOrder)
    ? migrated.settings.quickTaskCategoryOrder
    : [];
  const seenQuickTaskCategories = new Set<QuickTaskCategoryId>();
  migrated.settings.quickTaskCategoryOrder = [
    ...savedCategoryOrder.filter((id): id is QuickTaskCategoryId =>
      typeof id === "string" && quickTaskCategoryIds.has(id as QuickTaskCategoryId) &&
      !seenQuickTaskCategories.has(id as QuickTaskCategoryId) &&
      Boolean(seenQuickTaskCategories.add(id as QuickTaskCategoryId))),
    ...QUICK_TASK_CATEGORIES.map((category) => category.id).filter((id) => !seenQuickTaskCategories.has(id)),
  ];
  const savedCustomCategories = migrated.settings.customQuickTaskCategories;
  migrated.settings.customQuickTaskCategories = {};
  if (savedCustomCategories && typeof savedCustomCategories === "object" && !Array.isArray(savedCustomCategories)) {
    for (const [key, category] of Object.entries(savedCustomCategories)) {
      const normalisedKey = normaliseQuickTaskLabel(key);
      if (customQuickTaskIds.has(`custom:${normalisedKey}`) && quickTaskCategoryIds.has(category as QuickTaskCategoryId))
        migrated.settings.customQuickTaskCategories[normalisedKey] = category as QuickTaskCategoryId;
    }
  }
  if ((migrated.settingsRevision ?? 0) < 1) {
    if (migrated.settings.mileagePreference === "ask") migrated.settings.mileagePreference = "direct";
    migrated.settingsRevision = 1;
  }
  // Historical records should be protected as soon as this safeguard is introduced.
  migrated.shifts.forEach((shift) => {
    if (incomingSettingsRevision < 7 && shift.scheduledDate && shift.scheduledStart) shift.punctualityToleranceMinutes = 10;
    if (typeof shift.isLocked !== "boolean") shift.isLocked = true;
    if (!Array.isArray(shift.activities)) shift.activities = [];
    if (!Array.isArray(shift.taskSnapshot)) shift.taskSnapshot = [];
    if (shift.cleaningOverride === undefined) shift.cleaningOverride = null;
    if (shift.pendingResumeTaskId === undefined) shift.pendingResumeTaskId = null;
    if (shift.pendingResumeBlockedTime === undefined) shift.pendingResumeBlockedTime = null;
    if (shift.pendingEarlyDispatch === undefined) shift.pendingEarlyDispatch = null;
    if (shift.queuedEarlyDispatch === undefined) shift.queuedEarlyDispatch = null;
    if (shift.pendingCarryoutDepartureAt === undefined) shift.pendingCarryoutDepartureAt = null;
    if (typeof shift.firstTaskPromptHandled !== "boolean") shift.firstTaskPromptHandled = true;
    alignShiftBoundaryActivities(shift);
    shift.activities?.forEach((activity) => {
      const route = activity.routeEvidence;
      if (!route) return;
      route.points = normaliseDeliveryRoutePoints(route.points);
      if (!Array.isArray(route.gaps)) route.gaps = [];
      if (!Array.isArray(route.issues)) route.issues = [];
      if (!Array.isArray(route.stops)) route.stops = [];
      route.recordedPointCount = Math.max(route.recordedPointCount ?? 0, route.points.length);
      if (!Number.isFinite(route.distanceMetres)) route.distanceMetres = routeDistanceMetres(route.points);
      route.detail = route.detail === "high" ? "high" : "standard";
      route.retention = route.retention === "30" || route.retention === "forever" ? route.retention : "90";
      route.completedAt ??= activity.end ?? null;
      if (!route.status) route.status = activity.end ? route.points.length > 1 ? "complete" : "partial" : "recording";
      if (activity.end && route.status === "recording") finalizeRouteEvidence(route, activity.end);
      if (!Array.isArray(activity.customerEvents)) activity.customerEvents = [];
      let migratedCustomerIndex = 0;
      activity.customerEvents = activity.customerEvents.filter((event) => event && Number.isFinite(Date.parse(event.timestamp)) && (event.latitude == null || Number.isFinite(event.latitude)) && (event.longitude == null || Number.isFinite(event.longitude))).map((event) => {
        if (event.source !== "manual_delivered") return { ...event, customerIndex: undefined };
        const customerIndex = typeof event.customerIndex === "number" && Number.isInteger(event.customerIndex) && event.customerIndex > 0 ? event.customerIndex : migratedCustomerIndex + 1;
        migratedCustomerIndex = Math.max(migratedCustomerIndex, customerIndex);
        return { ...event, customerIndex };
      });
      if (!Array.isArray(activity.routePointContexts)) activity.routePointContexts = [];
      activity.routePointContexts = activity.routePointContexts.filter((context) => Number.isInteger(context?.pointIndex) && context.pointIndex >= 0 && context.pointIndex < route.points.length && ["customer_house", "traffic_light", "road_delay", "waiting"].includes(context.context));
      if (!Array.isArray(activity.routeEventClassifications)) activity.routeEventClassifications = [];
      activity.routeEventClassifications = activity.routeEventClassifications.filter((item) => Number.isInteger(item?.pointIndex) && item.pointIndex >= 0 && item.pointIndex < route.points.length && ["traffic_signal", "general_traffic", "junction", "pedestrian_crossing", "customer_parking", "other_road_delay", "unclassified"].includes(item.classification)).map((item) => ({ ...item, source: "MANUALLY_CLASSIFIED" as const }));
    });
    // Older live shifts may already contain a manually entered total. Treat
    // that value as including every completed run, while allowing the route
    // currently in progress to continue increasing the displayed total.
    if (
      shift.status !== "completed" &&
      workMilesTenths(shift) != null &&
      shift.mileage.gpsBaselineTenths == null
    )
      shift.mileage.gpsBaselineTenths = inferredLiveMileageGpsBaselineTenths(shift);
    shift.taskSnapshot?.forEach((task) => {
      if (!("photoProof" in task)) task.photoProof = null;
      if (!Array.isArray(task.photoProofs)) task.photoProofs = task.photoProof?.photoProof ? [structuredClone(task.photoProof)] : [];
      if (typeof task.completedBySomeoneElse !== "boolean") task.completedBySomeoneElse = false;
      task.unableReason ??= null;
      task.unableManager ??= null;
      task.unableAt ??= null;
      task.managementBlockedAt ??= null;
      task.managementBlockedBatchId ??= null;
    });
  });
  if (!Array.isArray(migrated.payrollSchedules)) migrated.payrollSchedules = [];
  migrated.payrollSchedules.forEach((schedule) => {
    schedule.payslip ??= null;
  });
  migrated.payments.forEach((payment) => {
    if (typeof payment.expectedAmountPence !== "number") payment.expectedAmountPence = payment.amountPence;
  });
  if (!Array.isArray(migrated.settings.deliveryDays)) migrated.settings.deliveryDays = [2, 4, 6];
  if (typeof migrated.settings.locationAssistEnabled !== "boolean") migrated.settings.locationAssistEnabled = true;
  if (typeof migrated.settings.includeBetaData !== "boolean") migrated.settings.includeBetaData = false;
  if (typeof migrated.settings.includeBetaCleaningData !== "boolean") migrated.settings.includeBetaCleaningData = false;
  if (typeof migrated.settings.includeQuestionableBetaHustle !== "boolean") migrated.settings.includeQuestionableBetaHustle = false;
  if (typeof migrated.settings.startupPromptsEnabled !== "boolean") migrated.settings.startupPromptsEnabled = true;
  if (typeof migrated.settings.clockInRolePromptEnabled !== "boolean") migrated.settings.clockInRolePromptEnabled = true;
  if (!["open", "second", "other"].includes(String(migrated.settings.defaultShiftRole))) migrated.settings.defaultShiftRole = "open";
  if (typeof migrated.settings.firstTaskPromptEnabled !== "boolean") migrated.settings.firstTaskPromptEnabled = true;
  if (!Array.isArray(migrated.settings.firstTaskPromptTaskIds)) migrated.settings.firstTaskPromptTaskIds = [];
  else migrated.settings.firstTaskPromptTaskIds = migrated.settings.firstTaskPromptTaskIds.filter((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 128).filter((id, index, values) => values.indexOf(id) === index).slice(0, 100);
  if (typeof migrated.settings.firstTaskPromptIncludeRushReady !== "boolean") migrated.settings.firstTaskPromptIncludeRushReady = true;
  if (migrated.settings.hustleStatsSource !== "dominos") migrated.settings.hustleStatsSource = "real";
  const configuredStoreLatitude = Number(migrated.settings.storeLatitude);
  const configuredStoreLongitude = Number(migrated.settings.storeLongitude);
  const hasLegacyOldStoreLocation = Math.abs(configuredStoreLatitude - LEGACY_OLD_STORE_LOCATION.latitude) < 0.00001 && Math.abs(configuredStoreLongitude - LEGACY_OLD_STORE_LOCATION.longitude) < 0.00001;
  // Build 161 briefly pointed the built-in geofence at the old Aughton Street
  // store. Move that exact built-in point back to the configured current-store
  // default once, but never overwrite a different coordinate deliberately set
  // by the driver.
  if (!Number.isFinite(configuredStoreLatitude) || !Number.isFinite(configuredStoreLongitude) || ((migrated.settingsRevision ?? 0) < 5 && hasLegacyOldStoreLocation)) {
    migrated.settings.storeLatitude = DEFAULT_STORE_LOCATION.latitude;
    migrated.settings.storeLongitude = DEFAULT_STORE_LOCATION.longitude;
  }
  if (!Number.isFinite(migrated.settings.storeRadiusMetres) || migrated.settings.storeRadiusMetres! < 10) migrated.settings.storeRadiusMetres = 35;
  if (!Number.isFinite(migrated.settings.storeDisplayLatitude)) migrated.settings.storeDisplayLatitude = DEFAULT_STORE_DISPLAY_LOCATION.latitude;
  if (!Number.isFinite(migrated.settings.storeDisplayLongitude)) migrated.settings.storeDisplayLongitude = DEFAULT_STORE_DISPLAY_LOCATION.longitude;
  if (!migrated.settings.storeDisplayLabel?.trim()) migrated.settings.storeDisplayLabel = DEFAULT_STORE_DISPLAY_LOCATION.label;
  migrated.settings.dominosReferenceRadiusMetres = getDominosReferenceGeofence(migrated.settings).radius;
  migrated.settings.operationalAllowances = { ...DEFAULT_SETTINGS.operationalAllowances!, ...(migrated.settings.operationalAllowances ?? {}) };
  if (typeof migrated.settings.geofenceSoundEnabled !== "boolean") migrated.settings.geofenceSoundEnabled = true;
  if (typeof migrated.settings.storePresenceProofEnabled !== "boolean") migrated.settings.storePresenceProofEnabled = false;
  if (typeof migrated.settings.storePresenceStartProofEnabled !== "boolean") migrated.settings.storePresenceStartProofEnabled = false;
  if (!Number.isFinite(migrated.settings.storePresenceStartProofRadiusMetres) || migrated.settings.storePresenceStartProofRadiusMetres! < 5 || migrated.settings.storePresenceStartProofRadiusMetres! > 50) migrated.settings.storePresenceStartProofRadiusMetres = 25;
  if (typeof migrated.settings.carryoutDepartureAssistEnabled !== "boolean") migrated.settings.carryoutDepartureAssistEnabled = false;
  if (!carryoutDepartureZoneIsValid(migrated.settings.carryoutDepartureZone)) {
    migrated.settings.carryoutDepartureZone = null;
    migrated.settings.carryoutDepartureAssistEnabled = false;
  } else {
    migrated.settings.carryoutDepartureZone = {
      version: 1,
      calibratedAt: typeof migrated.settings.carryoutDepartureZone.calibratedAt === "string"
        ? migrated.settings.carryoutDepartureZone.calibratedAt
        : new Date().toISOString(),
      corners: migrated.settings.carryoutDepartureZone.corners.map((corner) => ({
        label: corner.label,
        latitude: corner.latitude,
        longitude: corner.longitude,
        accuracy: Math.max(0, corner.accuracy),
        capturedAt: corner.capturedAt,
      })),
    };
  }
  if (!["classic", "bell", "double", "soft", "digital", "attention", "alarm", "siren"].includes(String(migrated.settings.geofenceChimeStyle))) migrated.settings.geofenceChimeStyle = "classic";
  if (typeof migrated.settings.recordDeliveryRoutes !== "boolean") migrated.settings.recordDeliveryRoutes = true;
  if (migrated.settings.routeGpsDetail !== "high") migrated.settings.routeGpsDetail = "standard";
  if (migrated.settings.routeRetention !== "30" && migrated.settings.routeRetention !== "forever") migrated.settings.routeRetention = "90";
  if (typeof migrated.settings.showGpsPointsByDefault !== "boolean") migrated.settings.showGpsPointsByDefault = false;
  if (typeof migrated.settings.googleRoutesEnabled !== "boolean") migrated.settings.googleRoutesEnabled = false;
  if (typeof migrated.settings.deliveryAddressEnabled !== "boolean") migrated.settings.deliveryAddressEnabled = true;
  if (typeof migrated.settings.receiptScanningEnabled !== "boolean") migrated.settings.receiptScanningEnabled = true;
  if (typeof migrated.settings.googleAddressValidationEnabled !== "boolean") migrated.settings.googleAddressValidationEnabled = true;
  if (typeof migrated.settings.osmRoadIntelligenceEnabled !== "boolean") migrated.settings.osmRoadIntelligenceEnabled = true;
  const osmFeatureSettings = migrated.settings.osmRoadFeatureSettings ?? {} as Partial<OSMRoadFeatureSettings>;
  migrated.settings.osmRoadFeatureSettings = {
    trafficSignals: typeof osmFeatureSettings.trafficSignals === "boolean" ? osmFeatureSettings.trafficSignals : true,
    junctionControls: typeof osmFeatureSettings.junctionControls === "boolean" ? osmFeatureSettings.junctionControls : true,
    pedestrianCrossings: typeof osmFeatureSettings.pedestrianCrossings === "boolean" ? osmFeatureSettings.pedestrianCrossings : true,
    calmingAndRoundabouts: typeof osmFeatureSettings.calmingAndRoundabouts === "boolean" ? osmFeatureSettings.calmingAndRoundabouts : true,
    roadMetadata: typeof osmFeatureSettings.roadMetadata === "boolean" ? osmFeatureSettings.roadMetadata : true,
    restrictions: typeof osmFeatureSettings.restrictions === "boolean" ? osmFeatureSettings.restrictions : true,
  };
  if (!Array.isArray(migrated.settings.localRoadFeatures)) migrated.settings.localRoadFeatures = [];
  migrated.settings.localRoadFeatures = migrated.settings.localRoadFeatures.filter((feature) => feature && typeof feature.id === "string" && Number.isFinite(feature.latitude) && Number.isFinite(feature.longitude) && feature.source === "USER_CONFIRMED_LOCAL" && ["TRAFFIC_SIGNAL", "JUNCTION", "PEDESTRIAN_CROSSING", "GIVE_WAY", "OTHER"].includes(feature.featureType)).map((feature) => ({ ...feature, createdAt: typeof feature.createdAt === "string" ? feature.createdAt : new Date().toISOString(), approachBearing: Number.isFinite(feature.approachBearing) ? feature.approachBearing : null }));
  if (!["street_postcode", "street_sector", "street_only", "sector_only", "none"].includes(migrated.settings.historicalDeliveryLocationPrivacy ?? "")) migrated.settings.historicalDeliveryLocationPrivacy = "street_postcode";
  if (migrated.settings.deletePreciseAddressAfter !== "delivered") migrated.settings.deletePreciseAddressAfter = "back_at_store";
  migrated.settings.trafficClassification = { ...DEFAULT_SETTINGS.trafficClassification!, ...(migrated.settings.trafficClassification ?? {}) };
  const configuredQueueLookAhead = Number(migrated.settings.signalQueueLookAheadMetres);
  migrated.settings.signalQueueLookAheadMetres = Number.isFinite(configuredQueueLookAhead) ? Math.min(600, Math.max(200, configuredQueueLookAhead)) : DEFAULT_SETTINGS.signalQueueLookAheadMetres;
  const configuredTrafficQueueLookAhead = Number(migrated.settings.trafficClassification.signalQueueLookAheadMetres ?? migrated.settings.signalQueueLookAheadMetres);
  migrated.settings.trafficClassification.signalQueueLookAheadMetres = Number.isFinite(configuredTrafficQueueLookAhead) ? Math.min(600, Math.max(200, configuredTrafficQueueLookAhead)) : DEFAULT_SETTINGS.trafficClassification!.signalQueueLookAheadMetres;
  migrated.settings.signalQueueLookAheadMetres = migrated.settings.trafficClassification.signalQueueLookAheadMetres;
  if (!Array.isArray(migrated.cleaningRota)) migrated.cleaningRota = defaultCleaningRota();
  migrated.cleaningRota.forEach((task) => { task.category ??= "cleaning"; });
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (!migrated.cleaningRota.some((task) => task.weekday === weekday && task.name.trim().toLowerCase() === "cleaning dishes")) migrated.cleaningRota.push({ id: `cleaning-dishes-${weekday}`, weekday, name: "Cleaning dishes", area: "DISHES", description: "Wash, sanitise and put away dishes, utensils and cleaning equipment.", enabled: true, order: 99, expectedMinutes: null, notes: "", category: "cleaning" });
  }
  if (!Array.isArray(migrated.preparationRota)) migrated.preparationRota = structuredClone(PREPARATION_ROTA);
  for (const defaultTask of PREPARATION_ROTA) {
    const existing = migrated.preparationRota.find((task) => task.id === defaultTask.id);
    if (!existing) migrated.preparationRota.push(structuredClone(defaultTask));
    else {
      if (defaultTask.allowNotRequired) existing.allowNotRequired = true;
      if (defaultTask.notRequiredByDefault) existing.notRequiredByDefault = true;
    }
  }
  const preparationRota = migrated.preparationRota!;
  const cleaningRota = migrated.cleaningRota!;
  const deliveryDays = migrated.settings.deliveryDays ?? [2, 4, 6];
  preparationRota.forEach((task) => { task.category = "prep"; task.weekday = -1; });
  migrated.shifts.forEach((shift) => {
    shift.activities?.forEach((activity) => {
      if (activity.storePresenceProof) {
        const proof = activity.storePresenceProof;
        const radius = Number(proof.radiusMetres);
        if (!Number.isFinite(radius) || radius < 5 || radius > 15 || !Number.isFinite(proof.latitude) || !Number.isFinite(proof.longitude)) {
          delete activity.storePresenceProof;
        } else {
          proof.version = 1;
          proof.startEnabledAtStart = proof.startEnabledAtStart === true;
          proof.enabledAtStart = proof.enabledAtStart === true;
          proof.radiusMetres = Math.round(radius);
          proof.changes = Array.isArray(proof.changes) ? proof.changes.filter((item) => item && typeof item.enabled === "boolean" && typeof item.at === "string" && Number.isFinite(Date.parse(item.at))).slice(-24) : [];
        }
      }
      if (!Array.isArray(activity.deliveryDestinations)) return;
      if (activity.end || activity.backAtStoreAt) sanitiseDeliveryDestinations(activity, migrated.settings.historicalDeliveryLocationPrivacy ?? "street_postcode");
    });
    if (shift.status !== "completed" && Array.isArray(shift.taskSnapshot)) {
      const shiftDay = new Date(shift.clockIn);
      if (deliveryDays.includes(shiftDay.getDay())) {
        const missingPrep = preparationRota.filter((definition) => definition.enabled && !shift.taskSnapshot!.some((task) => task.category === "prep" && task.sourceTaskId === definition.id));
        if (missingPrep.length) shift.taskSnapshot.push(...snapshotPreparationTasks(missingPrep));
      }
      if (!shift.taskSnapshot.some((task) => task.name.trim().toLowerCase() === "cleaning dishes" && task.category !== "prep")) {
        shift.taskSnapshot.push(...snapshotTasks(cleaningRota.filter((task) => task.name.trim().toLowerCase() === "cleaning dishes" && task.weekday === shiftDay.getDay()), shiftDay));
      }
    }
  });
  migrated.settingsRevision = Math.max(7, migrated.settingsRevision ?? 0);
  return migrated;
}

export type StorePresence = "inside" | "outside" | "unknown";
export type HustleSource = "real" | "dominos";

export interface GeofenceDefinition {
  id: "real" | "dominos";
  label: string;
  latitude: number;
  longitude: number;
  radius: number;
  /** Optional inward threshold. Real Hustle enters at its protected radius;
   * comparison boundaries may retain their existing inner hysteresis. */
  entryRadius?: number;
}

export interface GeofenceEvaluatorState {
  presence: StorePresence;
  pendingPresence: StorePresence;
  pendingCount: number;
  pendingSinceAt: string | null;
  pendingObserved?: boolean;
  /** Recreated pages cannot prove the continuity of an unsaved candidate. */
  continuityUnknown?: boolean;
  lastSampleAt: number;
  exitAt: string | null;
}

export interface GeofenceTransition {
  from: Exclude<StorePresence, "unknown">;
  to: Exclude<StorePresence, "unknown">;
  timestamp: string;
  observed: boolean;
}

export type RealGeofenceTransitionResult = "exit_recorded" | "exit_unobserved" | "entry_recorded" | "entry_unobserved" | "rejected" | "unchanged";

/** Applies Real evidence only to the delivery that owns the evaluator state.
 * A return can never exist without an earlier observed exit on that delivery. */
export function applyRealGeofenceTransition(activity: ActivityRecord, transition: GeofenceTransition): RealGeofenceTransitionResult {
  const observedAt = Date.parse(transition.timestamp);
  if (!Number.isFinite(observedAt) || observedAt < Date.parse(activity.start) || activity.end != null) return "rejected";
  if (transition.from === "inside" && transition.to === "outside") {
    if (activity.storeExitAt || activity.storeExitUnobserved) return "unchanged";
    if (!transition.observed) { activity.storeExitUnobserved = true; return "exit_unobserved"; }
    if (activity.storeEntryAt && Date.parse(activity.storeEntryAt) < Date.parse(transition.timestamp)) {
      activity.storeEntryAt = null;
      activity.storeEntryObserved = false;
      activity.storeEntryUnobserved = false;
    }
    activity.storeExitAt = transition.timestamp;
    activity.storeExitObserved = true;
    activity.startedOutsideStore = false;
    return "exit_recorded";
  }
  if (transition.from === "outside" && transition.to === "inside") {
    const exit = Date.parse(activity.storeExitAt ?? "");
    const entry = Date.parse(transition.timestamp);
    if (!activity.storeExitObserved || !Number.isFinite(exit) || !Number.isFinite(entry) || entry < exit || activity.storeEntryAt || activity.storeEntryUnobserved) return "rejected";
    if (!transition.observed) { activity.storeEntryUnobserved = true; return "entry_unobserved"; }
    activity.storeEntryAt = transition.timestamp;
    activity.storeEntryObserved = true;
    return "entry_recorded";
  }
  return "unchanged";
}

function elapsedWholeSeconds(startAt: string | null | undefined, endAt: string | null | undefined): number | null {
  const start = Date.parse(startAt ?? "");
  const end = Date.parse(endAt ?? "");
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : null;
}

/** Attaches an already-running Domino's timer to one newly created delivery run. */
export function attachEarlyDispatchToActivity(activity: ActivityRecord, pending: PendingEarlyDispatch, realStartedAt: string) {
  activity.wasEarlyDispatched = true;
  activity.dominosDispatchStartedAt = pending.dominosDispatchStartedAt;
  activity.realDeliveryStartedAt = realStartedAt;
  activity.dominosGeofenceExitedAt = pending.dominosGeofenceExitedAt;
  activity.earlyDispatchGapSeconds = elapsedWholeSeconds(pending.dominosDispatchStartedAt, realStartedAt);
  if (pending.dominosGeofenceExitedAt) {
    activity.dominosStoreExitAt = pending.dominosGeofenceExitedAt;
    activity.dominosStoreExitObserved = true;
    activity.dominosHustleSeconds = elapsedWholeSeconds(pending.dominosDispatchStartedAt, pending.dominosGeofenceExitedAt);
  }
  return activity;
}

/**
 * Adds an early-dispatch correction to a delivery that is already running.
 * The caller supplies the remembered gap so the recorded Domino's timestamp
 * remains explicit evidence rather than an invented approximation.
 */
export function markRunningDeliveryEarlyDispatch(activity: ActivityRecord, secondsBeforeDelivery: number) {
  const realStart = Date.parse(activity.realDeliveryStartedAt ?? activity.start);
  const gapSeconds = Math.round(secondsBeforeDelivery);
  if (
    activity.end ||
    activity.stockRun ||
    (activity.type !== "single_delivery" && activity.type !== "double_delivery") ||
    activity.wasEarlyDispatched ||
    !Number.isFinite(realStart) ||
    !Number.isFinite(gapSeconds) ||
    gapSeconds < 1
  ) return false;
  const dispatchStartedAt = new Date(realStart - gapSeconds * 1000).toISOString();
  activity.wasEarlyDispatched = true;
  activity.realDeliveryStartedAt = activity.realDeliveryStartedAt ?? activity.start;
  activity.dominosDispatchStartedAt = dispatchStartedAt;
  activity.earlyDispatchGapSeconds = gapSeconds;
  if (activity.dominosStoreExitAt) {
    activity.dominosGeofenceExitedAt = activity.dominosStoreExitAt;
    activity.dominosHustleSeconds = elapsedWholeSeconds(dispatchStartedAt, activity.dominosStoreExitAt);
  }
  return true;
}

/** Saves the first confirmed Domino's exit without changing its evaluator or boundary. */
export function recordDominosHustleExit(activity: ActivityRecord, exitedAt: string) {
  if (activity.dominosStoreExitAt || activity.dominosStoreExitUnobserved) return false;
  activity.dominosStoreExitAt = exitedAt;
  activity.dominosStoreExitObserved = true;
  if (activity.wasEarlyDispatched) {
    activity.dominosGeofenceExitedAt = exitedAt;
    activity.dominosHustleSeconds = elapsedWholeSeconds(activity.dominosDispatchStartedAt, exitedAt);
  }
  return true;
}

/** Mirrors an observed Real exit into the comparison fields; Real geofence behaviour is unchanged. */
export function recordRealHustleExitMetrics(activity: ActivityRecord) {
  if (!activity.storeExitAt || !activity.storeExitObserved) return false;
  activity.realDeliveryStartedAt ??= activity.start;
  activity.realGeofenceExitedAt = activity.storeExitAt;
  activity.realHustleSeconds = elapsedWholeSeconds(activity.realDeliveryStartedAt, activity.storeExitAt);
  return true;
}

export const REAL_GEOFENCE_DEFINITION: GeofenceDefinition = Object.freeze({ id: "real", label: "Real Hustle", ...REAL_STATS_GEOFENCE, entryRadius: REAL_STATS_GEOFENCE.radius });
export const DOMINOS_GEOFENCE_DEFINITION: GeofenceDefinition = Object.freeze({ id: "dominos", label: "Domino's Hustle", ...DOMINOS_REFERENCE_GEOFENCE, entryRadius: DOMINOS_REFERENCE_GEOFENCE.radius - 7 });

export function dominosGeofenceDefinitionForActivity(activity: Pick<ActivityRecord, "dominosGeofenceLatitude" | "dominosGeofenceLongitude" | "dominosGeofenceRadius">): GeofenceDefinition {
  const radius = Number.isFinite(activity.dominosGeofenceRadius) ? Math.min(150, Math.max(40, Math.round(activity.dominosGeofenceRadius!))) : DOMINOS_REFERENCE_GEOFENCE.radius;
  return {
    id: "dominos",
    label: "Domino's Hustle",
    latitude: Number.isFinite(activity.dominosGeofenceLatitude) ? activity.dominosGeofenceLatitude! : DOMINOS_REFERENCE_GEOFENCE.latitude,
    longitude: Number.isFinite(activity.dominosGeofenceLongitude) ? activity.dominosGeofenceLongitude! : DOMINOS_REFERENCE_GEOFENCE.longitude,
    radius,
    entryRadius: Math.max(10, radius - 7),
  };
}

export const initialGeofenceEvaluatorState = (presence: StorePresence = "unknown", timestamp = 0): GeofenceEvaluatorState => ({ presence, pendingPresence: "unknown", pendingCount: 0, pendingSinceAt: null, lastSampleAt: timestamp, exitAt: null });

export const ROUTE_SAMPLING = {
  standard: { movementMetres: 40, maximumIntervalMs: 25_000, gapMs: 90_000 },
  high: { movementMetres: 20, maximumIntervalMs: 12_000, gapMs: 60_000 },
} as const;

/** Prevent a delayed GPS callback from attaching geofence evidence after the
 * shift or delivery has already been completed. */
export function canApplyLiveGeofenceTransition(shift: Shift | undefined, activity: ActivityRecord | undefined) {
  return Boolean(
    shift
    && shift.status !== "completed"
    && activity
    && !activity.end
    && (activity.type === "single_delivery" || activity.type === "double_delivery"),
  );
}

/** Great-circle distance in metres; kept pure so geofence behaviour is testable. */
export function distanceMetres(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = toRad(targetLatitude - latitude);
  const dLon = toRad(targetLongitude - longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latitude)) * Math.cos(toRad(targetLatitude)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function carryoutDepartureZoneIsValid(
  zone: CarryoutDepartureZone | null | undefined,
): zone is CarryoutDepartureZone {
  if (!zone || zone.version !== 1 || !Array.isArray(zone.corners) || zone.corners.length !== 4)
    return false;
  const expected: CarryoutZoneCornerLabel[] = ["front_left", "front_right", "back_right", "back_left"];
  const labelsPresent = expected.every((label) => {
    const corner = zone.corners.find((item) => item?.label === label);
    return Boolean(
      corner &&
        Number.isFinite(corner.latitude) &&
        Number.isFinite(corner.longitude) &&
        Number.isFinite(corner.accuracy) &&
        typeof corner.capturedAt === "string",
    );
  });
  if (!labelsPresent) return false;
  const latitudes = zone.corners.map((corner) => corner.latitude);
  const longitudes = zone.corners.map((corner) => corner.longitude);
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const northSouthMetres = Math.abs(Math.max(...latitudes) - Math.min(...latitudes)) * 111_320;
  const eastWestMetres = Math.abs(Math.max(...longitudes) - Math.min(...longitudes)) * Math.max(1, 111_320 * Math.cos((centreLatitude * Math.PI) / 180));
  // A calibration is deliberately limited to a compact carryout area. This
  // guard prevents a poor or accidental capture becoming another car-park-wide
  // boundary.
  return northSouthMetres >= 1 && eastWestMetres >= 1 && northSouthMetres <= 80 && eastWestMetres <= 80;
}

/** Phone GPS cannot make a literal doorway-sized polygon from four readings.
 * The readings identify the carryout entrance, then a compact box is centred
 * on their average. This remains separate from protected Hustle GPS logic. */
export function buildCarryoutDepartureZone(
  samples: CarryoutZoneCorner[],
  calibratedAt = new Date().toISOString(),
): CarryoutDepartureZone | null {
  const expected: CarryoutZoneCornerLabel[] = ["front_left", "front_right", "back_right", "back_left"];
  if (samples.length !== expected.length || !expected.every((label) => samples.some((sample) => sample?.label === label))) return null;
  if (!samples.every((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude) && Number.isFinite(sample.accuracy))) return null;
  const centreLatitude = samples.reduce((total, sample) => total + sample.latitude, 0) / samples.length;
  const centreLongitude = samples.reduce((total, sample) => total + sample.longitude, 0) / samples.length;
  const halfExtentMetres = 8;
  const latitudeOffset = halfExtentMetres / 111_320;
  const longitudeOffset = halfExtentMetres / Math.max(1, 111_320 * Math.cos((centreLatitude * Math.PI) / 180));
  const capturedAt = samples.reduce((latest, sample) => latest > sample.capturedAt ? latest : sample.capturedAt, calibratedAt);
  return {
    version: 1,
    calibratedAt,
    corners: [
      { label: "front_left", latitude: centreLatitude + latitudeOffset, longitude: centreLongitude - longitudeOffset, accuracy: halfExtentMetres, capturedAt },
      { label: "front_right", latitude: centreLatitude + latitudeOffset, longitude: centreLongitude + longitudeOffset, accuracy: halfExtentMetres, capturedAt },
      { label: "back_right", latitude: centreLatitude - latitudeOffset, longitude: centreLongitude + longitudeOffset, accuracy: halfExtentMetres, capturedAt },
      { label: "back_left", latitude: centreLatitude - latitudeOffset, longitude: centreLongitude - longitudeOffset, accuracy: halfExtentMetres, capturedAt },
    ],
  };
}

/**
 * The carryout zone is deliberately a simple axis-aligned box from the four
 * captured corners.  It is a separate convenience detector, never a source
 * for protected Hustle/geofence evidence.
 */
export function isInsideCarryoutDepartureZone(
  zone: CarryoutDepartureZone | null | undefined,
  latitude: number,
  longitude: number,
  paddingMetres = 0,
) {
  if (!carryoutDepartureZoneIsValid(zone) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const latitudes = zone.corners.map((corner) => corner.latitude);
  const longitudes = zone.corners.map((corner) => corner.longitude);
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const latPadding = Math.max(0, paddingMetres) / 111_320;
  const longitudeMetres = Math.max(1, 111_320 * Math.cos((centreLatitude * Math.PI) / 180));
  const lngPadding = Math.max(0, paddingMetres) / longitudeMetres;
  return (
    latitude >= Math.min(...latitudes) - latPadding &&
    latitude <= Math.max(...latitudes) + latPadding &&
    longitude >= Math.min(...longitudes) - lngPadding &&
    longitude <= Math.max(...longitudes) + lngPadding
  );
}

/**
 * Repairs legacy/imported GPS samples without inventing evidence. Invalid
 * coordinates or timestamps are discarded; usable samples keep their original
 * recorded values. This is intentionally safe to run repeatedly.
 */
export function normaliseDeliveryRoutePoints(value: unknown): DeliveryRoutePoint[] {
  if (!Array.isArray(value)) return [];
  const points: DeliveryRoutePoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const sample = item as Partial<DeliveryRoutePoint> & { lat?: unknown; lng?: unknown; lon?: unknown; time?: unknown };
    const latitude = Number(sample.latitude ?? sample.lat);
    const longitude = Number(sample.longitude ?? sample.lng ?? sample.lon);
    const timestampValue = sample.timestamp ?? sample.time;
    const timestamp = typeof timestampValue === "string" || typeof timestampValue === "number" ? new Date(timestampValue) : null;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !timestamp || !Number.isFinite(timestamp.getTime())) continue;
    const accuracyValue = Number(sample.accuracy);
    const speedValue = sample.speed == null ? null : Number(sample.speed);
    const headingValue = sample.heading == null ? null : Number(sample.heading);
    points.push({
      latitude,
      longitude,
      timestamp: timestamp.toISOString(),
      accuracy: Number.isFinite(accuracyValue) && accuracyValue >= 0 ? accuracyValue : 0,
      speed: Number.isFinite(speedValue) && speedValue! >= 0 ? speedValue : null,
      heading: Number.isFinite(headingValue) ? headingValue : null,
    });
  }
  return points.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function routeDistanceMetres(points: DeliveryRoutePoint[]) {
  const usable = normaliseDeliveryRoutePoints(points);
  return usable.slice(1).reduce((sum, point, index) => {
    const previous = usable[index];
    return sum + distanceMetres(previous.latitude, previous.longitude, point.latitude, point.longitude);
  }, 0);
}

/**
 * Selects the real recorded GPS sample nearest to a saved milestone time.
 * The milestone keeps its own timestamp; this helper never invents or moves a
 * coordinate and is used only to position event pins on the journey map.
 */
export function nearestRoutePointToTimestamp(points: DeliveryRoutePoint[], timestamp: string | null | undefined) {
  const target = Date.parse(timestamp ?? "");
  if (!Number.isFinite(target)) return null;
  const usable = normaliseDeliveryRoutePoints(points);
  return usable.reduce<DeliveryRoutePoint | null>((nearest, point) => {
    if (!nearest) return point;
    return Math.abs(Date.parse(point.timestamp) - target) < Math.abs(Date.parse(nearest.timestamp) - target) ? point : nearest;
  }, null);
}

/**
 * Finds the best available customer-area point without ever turning an inferred
 * point into a manual confirmation.  A driver's Delivered tap always wins.
 */
export function resolveCustomerLocation(activity: ActivityRecord) {
  const points = activity.routeEvidence?.points ?? [];
  const manual = activity.customerEvents?.findLast((event) => event.source === "manual_delivered" && Number.isFinite(event.latitude) && Number.isFinite(event.longitude));
  if (manual && manual.latitude != null && manual.longitude != null) {
    return { latitude: manual.latitude, longitude: manual.longitude, accuracy: manual.accuracy, timestamp: manual.timestamp, pointIndex: manual.pointIndex ?? points.findIndex((point) => point.timestamp === manual.timestamp), source: "manual_delivered" as const };
  }
  const selected = activity.customerEvents?.findLast((event) => event.source === "user_selected_route_point" && Number.isFinite(event.latitude) && Number.isFinite(event.longitude));
  if (selected && selected.latitude != null && selected.longitude != null) {
    return { latitude: selected.latitude, longitude: selected.longitude, accuracy: selected.accuracy, timestamp: selected.timestamp, pointIndex: selected.pointIndex ?? points.findIndex((point) => point.timestamp === selected.timestamp), source: "user_selected_route_point" as const };
  }
  const storeLat = activity.geofenceLatitude;
  const storeLng = activity.geofenceLongitude;
  const usableStops = (activity.routeEvidence?.stops ?? []).filter((stop) => {
    if (stop.durationMs < 45_000 || storeLat == null || storeLng == null) return false;
    return distanceMetres(stop.latitude, stop.longitude, storeLat, storeLng) > Math.max((activity.geofenceRadius ?? 35) + 60, 95);
  });
  if (usableStops.length) {
    const stop = usableStops.sort((a, b) => b.durationMs - a.durationMs)[0];
    const pointIndex = points.findIndex((point) => point.timestamp >= stop.startedAt && point.timestamp <= stop.endedAt && distanceMetres(point.latitude, point.longitude, stop.latitude, stop.longitude) <= 50);
    return { latitude: stop.latitude, longitude: stop.longitude, accuracy: pointIndex >= 0 ? points[pointIndex].accuracy : null, timestamp: stop.endedAt, pointIndex, source: "detected_stop" as const };
  }
  const detected = detectCustomerStopFromRoute(activity);
  if (detected) return detected;
  if (points.length && storeLat != null && storeLng != null) {
    const point = points.reduce((furthest, candidate) => distanceMetres(candidate.latitude, candidate.longitude, storeLat, storeLng) > distanceMetres(furthest.latitude, furthest.longitude, storeLat, storeLng) ? candidate : furthest);
    return { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, timestamp: point.timestamp, pointIndex: points.indexOf(point), source: "gps_estimate" as const };
  }
  return null;
}

/**
 * Returns the explicit Delivered taps in customer order.  A route may also
 * contain a user-selected customer point, so do not use customerEvents.length
 * as the number of completed customers.
 */
export function manualDeliveredCustomerEvents(activity: ActivityRecord) {
  return (activity.customerEvents ?? [])
    .filter((event) => event.source === "manual_delivered" && Number.isFinite(Date.parse(event.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((event, index) => ({ ...event, customerIndex: event.customerIndex && event.customerIndex > 0 ? event.customerIndex : index + 1 }));
}

/**
 * Measures each customer leg from the previous confirmed milestone.  Customer
 * 1 starts at the saved geofence exit (or the delivery start when GPS exit is
 * unavailable); customer 2 starts at the Customer 1 Delivered tap.  This is
 * deliberately based only on explicit button timestamps and never invents a
 * time from an inferred GPS stop.
 */
export function manualDeliveredCustomerTimings(activity: ActivityRecord) {
  const events = manualDeliveredCustomerEvents(activity);
  const departure = Date.parse(activity.storeExitAt ?? activity.start);
  return events.map((event, index) => {
    const previous = index === 0 ? departure : Date.parse(events[index - 1].timestamp);
    const deliveredAt = Date.parse(event.timestamp);
    return {
      ...event,
      customerIndex: event.customerIndex ?? index + 1,
      durationMs: Number.isFinite(previous) && Number.isFinite(deliveredAt) ? Math.max(0, deliveredAt - previous) : null,
    };
  });
}

/**
 * Finds a credible customer-area linger from the raw route when no Delivered
 * tap or persisted stop exists. It requires a meaningful pause away from the
 * store, movement beforehand, and a subsequent trend back toward the store so
 * a junction or traffic light is not promoted merely because it was nearby.
 */
function detectCustomerStopFromRoute(activity: ActivityRecord) {
  const points = activity.routeEvidence?.points ?? [];
  const storeLat = activity.geofenceLatitude;
  const storeLng = activity.geofenceLongitude;
  if (points.length < 4 || storeLat == null || storeLng == null) return null;
  const storeDistance = (point: DeliveryRoutePoint) => distanceMetres(point.latitude, point.longitude, storeLat, storeLng);
  const outsideThreshold = Math.max((activity.geofenceRadius ?? 35) + 60, 95);
  const candidates: Array<{ startIndex: number; endIndex: number; durationMs: number; latitude: number; longitude: number; timestamp: string; accuracy: number | null }> = [];
  let startIndex: number | null = null;
  const flush = (endIndex: number) => {
    if (startIndex == null || endIndex <= startIndex) return;
    const started = points[startIndex];
    const ended = points[endIndex];
    const durationMs = new Date(ended.timestamp).getTime() - new Date(started.timestamp).getTime();
    if (!Number.isFinite(durationMs) || durationMs < 45_000 || durationMs > 8 * 60_000) return;
    const anchor = points[Math.floor((startIndex + endIndex) / 2)];
    const before = points[Math.max(0, startIndex - 1)];
    const after = points[Math.min(points.length - 1, endIndex + 1)];
    const anchorDistance = storeDistance(anchor);
    const beforeDistance = storeDistance(before);
    const afterDistance = storeDistance(after);
    const movedOutBefore = beforeDistance + 35 < anchorDistance;
    const turnedBackAfter = afterDistance + 35 < anchorDistance;
    if (anchorDistance < outsideThreshold || !movedOutBefore || !turnedBackAfter) return;
    candidates.push({ startIndex, endIndex, durationMs, latitude: anchor.latitude, longitude: anchor.longitude, timestamp: anchor.timestamp, accuracy: anchor.accuracy });
  };
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const elapsed = new Date(point.timestamp).getTime() - new Date(previous.timestamp).getTime();
    const drift = distanceMetres(previous.latitude, previous.longitude, point.latitude, point.longitude);
    const accuracyRadius = Math.max(12, Math.min(35, Math.max(previous.accuracy ?? 0, point.accuracy ?? 0) * 0.8));
    const nearStill = elapsed > 0 && elapsed <= 180_000 && drift <= accuracyRadius && storeDistance(point) > outsideThreshold;
    if (nearStill) startIndex ??= index - 1;
    else if (startIndex != null) { flush(index - 1); startIndex = null; }
  }
  if (startIndex != null) flush(points.length - 1);
  const longest = candidates.sort((a, b) => b.durationMs - a.durationMs)[0];
  if (longest) {
    const pointIndex = points.findIndex((point) => point.timestamp === longest.timestamp);
    return { latitude: longest.latitude, longitude: longest.longitude, accuracy: longest.accuracy, timestamp: longest.timestamp, pointIndex: pointIndex >= 0 ? pointIndex : Math.floor((longest.startIndex + longest.endIndex) / 2), source: "detected_stop" as const };
  }
  // Some customer approaches include a short walk/parking manoeuvre, so the
  // phone may not remain within the stationary radius. A pronounced local
  // maximum in distance from the store, followed by a sustained move back,
  // still provides useful evidence without reverting to the furthest point.
  const turnaroundCandidates = points.slice(2, -2).flatMap((point, index) => {
    const pointIndex = index + 2;
    const before = points[pointIndex - 2];
    const after = points[pointIndex + 2];
    const atDistance = storeDistance(point);
    if (atDistance < outsideThreshold || storeDistance(before) + 55 > atDistance || storeDistance(after) + 55 > atDistance) return [];
    const elapsed = new Date(after.timestamp).getTime() - new Date(before.timestamp).getTime();
    if (!Number.isFinite(elapsed) || elapsed < 30_000) return [];
    return [{ point, pointIndex, score: (atDistance - storeDistance(before)) + (atDistance - storeDistance(after)) }];
  });
  const turnaround = turnaroundCandidates.sort((a, b) => b.score - a.score)[0];
  return turnaround ? { latitude: turnaround.point.latitude, longitude: turnaround.point.longitude, accuracy: turnaround.point.accuracy, timestamp: turnaround.point.timestamp, pointIndex: turnaround.pointIndex, source: "detected_stop" as const } : null;
}

/**
 * Estimates time spent at the customer area without borrowing the store
 * departure or return-to-store clocks. Manual Delivered events use the
 * timestamp of the tap and the next meaningful movement; GPS estimates use
 * the contiguous recorded window around the turnaround point.
 */
export function customerStopDurationMs(activity: ActivityRecord, customer = resolveCustomerLocation(activity)) {
  const points = activity.routeEvidence?.points ?? [];
  if (!customer || points.length < 2) return 0;
  const radius = Math.max(85, (customer.accuracy ?? 0) + 45);
  const timestampMs = (value: string) => new Date(value).getTime();
  const distanceToCustomer = (point: DeliveryRoutePoint) => distanceMetres(point.latitude, point.longitude, customer.latitude, customer.longitude);
  const nearbyStops = (activity.routeEvidence?.stops ?? []).filter((stop) => distanceMetres(stop.latitude, stop.longitude, customer.latitude, customer.longitude) <= radius);
  const recordedStopMs = nearbyStops.reduce((longest, stop) => Math.max(longest, stop.durationMs), 0);
  const anchorIndex = customer.pointIndex != null && customer.pointIndex >= 0
    ? Math.min(points.length - 1, customer.pointIndex)
    : Math.max(0, points.reduce((best, point, index) => distanceToCustomer(point) < distanceToCustomer(points[best]) ? index : best, 0));
  if (customer.source === "manual_delivered") {
    const deliveredAt = timestampMs(customer.timestamp);
    const resume = points.slice(anchorIndex + 1).find((point) => distanceToCustomer(point) > radius);
    const resumedAt = resume ? timestampMs(resume.timestamp) : deliveredAt;
    return Math.max(recordedStopMs, Number.isFinite(deliveredAt) && Number.isFinite(resumedAt) ? Math.max(0, resumedAt - deliveredAt) : 0);
  }
  let first = anchorIndex;
  let last = anchorIndex;
  while (first > 0 && distanceToCustomer(points[first - 1]) <= radius) first -= 1;
  while (last < points.length - 1 && distanceToCustomer(points[last + 1]) <= radius) last += 1;
  const neighbourhoodMs = timestampMs(points[last].timestamp) - timestampMs(points[first].timestamp);
  return Math.max(recordedStopMs, Number.isFinite(neighbourhoodMs) && neighbourhoodMs >= 20_000 && neighbourhoodMs <= 180_000 ? neighbourhoodMs : 0);
}

/** Derived locally from actual samples. It deliberately never identifies a customer or a traffic cause. */
export function analyseDeliveryRoute(activity: ActivityRecord) {
  const route = activity.routeEvidence; const points = route?.points ?? [];
  if (points.length < 2) return null;
  const storeLat = activity.geofenceLatitude; const storeLng = activity.geofenceLongitude;
  const customer = resolveCustomerLocation(activity);
  const furthest = points.reduce((best, p) => !best || storeLat == null || storeLng == null || distanceMetres(p.latitude,p.longitude,storeLat,storeLng) > distanceMetres(best.latitude,best.longitude,storeLat,storeLng) ? p : best, points[0]);
  const turnaround = customer ? (customer.pointIndex != null && customer.pointIndex >= 0 ? points[customer.pointIndex] : { latitude: customer.latitude, longitude: customer.longitude, timestamp: customer.timestamp, accuracy: customer.accuracy ?? 0 }) : furthest;
  const turnIndex = customer?.pointIndex != null && customer.pointIndex >= 0 ? customer.pointIndex : points.indexOf(turnaround as DeliveryRoutePoint); let moving=0, slow=0; const speeds:number[]=[];
  for(let i=1;i<points.length;i++){ const a=points[i-1],b=points[i]; const ms=new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime(); if(ms<=0||ms>180000) continue; const metres=distanceMetres(a.latitude,a.longitude,b.latitude,b.longitude); const mph=metres/ms*2236.936; if(metres>2500||mph>100) continue; if(mph<5) slow+=ms; else {moving+=ms;speeds.push(mph);} }
  speeds.sort((a,b)=>a-b); const avg=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:null;
  const exit=activity.storeExitAt?new Date(activity.storeExitAt).getTime():null, entry=activity.storeEntryAt?new Date(activity.storeEntryAt).getTime():null, start=new Date(activity.start).getTime(), end=new Date(activity.backAtStoreAt??activity.end??Date.now()).getTime(), turn=new Date(turnaround.timestamp).getTime();
  return {turnaround, turnIndex, customer, movingMs:moving, slowMs:slow, averageMph:avg, medianMph:speeds.length?speeds[Math.floor(speeds.length/2)]:null, outboundMs:exit?Math.max(0,turn-exit):null, returnMs:entry?Math.max(0,entry-turn):null, leaveMs:exit?Math.max(0,exit-start):null, arrivalButtonMs:entry?Math.max(0,end-entry):null, totalMs:Math.max(0,end-start)};
}

/**
 * Local, deterministic journey-condition analysis. It uses only saved GPS
 * samples: it never performs routing, reverse geocoding or network traffic
 * lookups. The result is intentionally movement, not a claim of traffic.
 */
export function analyseRouteMovement(activity: ActivityRecord, thresholds = DEFAULT_SETTINGS.trafficClassification!) {
  const points = activity.routeEvidence?.points ?? [];
  const customer = resolveCustomerLocation(activity);
  const storeLat = activity.geofenceLatitude; const storeLng = activity.geofenceLongitude;
  if (points.length < 2) return { segments: [] as RouteMovementSegment[], stationary: [] as RouteMovementSegment[], totals: {} as Record<MovementClass, { ms: number; metres: number }>, sameRoad: [] as SameRoadComparison[] };
  const raw = points.slice(1).map((point, offset) => {
    const previous = points[offset]; const durationMs = new Date(point.timestamp).getTime() - new Date(previous.timestamp).getTime();
    const metres = durationMs > 0 && durationMs <= 180_000 ? distanceMetres(previous.latitude, previous.longitude, point.latitude, point.longitude) : 0;
    const mph = durationMs > 0 ? metres / durationMs * 2236.936 : 0;
    const midLat = (previous.latitude + point.latitude) / 2; const midLng = (previous.longitude + point.longitude) / 2;
    const poor = Math.max(previous.accuracy || 0, point.accuracy || 0) > 80 || metres > 2500 || mph > 100 || durationMs <= 0 || durationMs > 180_000;
    const atCustomer = customer && distanceMetres(midLat, midLng, customer.latitude, customer.longitude) <= Math.max(55, (customer.accuracy ?? 0) + 35);
    const atStore = storeLat != null && storeLng != null && distanceMetres(midLat, midLng, storeLat, storeLng) <= (activity.geofenceRadius ?? 35) + 15;
    return { index: offset, point, previous, durationMs, metres, mph: poor ? 0 : mph, poor, atCustomer: Boolean(atCustomer), atStore };
  });
  const smoothed = raw.map((segment, index) => {
    const neighbours = raw.slice(Math.max(0, index - 1), Math.min(raw.length, index + 2)).filter((item) => !item.poor);
    const weight = neighbours.reduce((sum, item) => sum + Math.max(1, item.durationMs), 0);
    return weight ? neighbours.reduce((sum, item) => sum + item.mph * Math.max(1, item.durationMs), 0) / weight : segment.mph;
  });
  const classify = (mph: number, atCustomer: boolean, atStore: boolean): MovementClass => atCustomer ? "customer" : atStore ? "store" : mph >= thresholds.freeFlowMph ? "free" : mph >= thresholds.moderateMph ? "moderate" : mph >= thresholds.slowMph ? "slow" : "heavy";
  const parts = raw.map((item, index) => ({ ...item, smooth: smoothed[index], classification: classify(smoothed[index], item.atCustomer, item.atStore) }));
  const segments: RouteMovementSegment[] = [];
  for (const part of parts) {
    if (part.poor) continue;
    const previous = segments.at(-1);
    const canMerge = previous && previous.classification === part.classification && new Date(part.previous.timestamp).getTime() - new Date(previous.endAt).getTime() <= 35_000;
    if (canMerge) {
      const combinedMs = previous.durationMs + part.durationMs; const combinedMetres = previous.distanceMetres + part.metres;
      previous.endIndex = part.index + 1; previous.endAt = part.point.timestamp; previous.durationMs = combinedMs; previous.distanceMetres = combinedMetres;
      previous.averageMph = combinedMs ? (previous.averageMph * (combinedMs - part.durationMs) + part.smooth * part.durationMs) / combinedMs : part.smooth;
      previous.minimumMph = Math.min(previous.minimumMph, part.smooth); previous.maximumMph = Math.max(previous.maximumMph, part.smooth);
    } else segments.push({ startIndex: part.index, endIndex: part.index + 1, startAt: part.previous.timestamp, endAt: part.point.timestamp, durationMs: part.durationMs, distanceMetres: part.metres, averageMph: part.smooth, minimumMph: part.smooth, maximumMph: part.smooth, classification: part.classification, confidence: Math.max(part.previous.accuracy, part.point.accuracy) <= 20 ? "high" : "medium" });
  }
  const stationary: RouteMovementSegment[] = [];
  let start: typeof parts[number] | null = null;
  for (const part of parts) {
    const nearStill = !part.poor && part.metres <= Math.max(12, Math.max(part.previous.accuracy, part.point.accuracy) * .8);
    if (nearStill && !part.atCustomer && !part.atStore) { start ??= part; const ms = new Date(part.point.timestamp).getTime() - new Date(start.previous.timestamp).getTime(); if (ms >= thresholds.stationarySeconds * 1000) { const existing = stationary.at(-1); if (existing && existing.endIndex === part.index) { existing.endIndex = part.index + 1; existing.endAt = part.point.timestamp; existing.durationMs = ms; } else stationary.push({ startIndex: start.index, endIndex: part.index + 1, startAt: start.previous.timestamp, endAt: part.point.timestamp, durationMs: ms, distanceMetres: 0, averageMph: 0, minimumMph: 0, maximumMph: 0, classification: "stationary", confidence: "medium" }); } } else start = null;
  }
  const totals = Object.fromEntries((["free", "moderate", "slow", "heavy", "stationary", "customer", "store"] as MovementClass[]).map((key) => [key, { ms: 0, metres: 0 }])) as Record<MovementClass, { ms: number; metres: number }>;
  segments.forEach((segment) => { totals[segment.classification].ms += segment.durationMs; totals[segment.classification].metres += segment.distanceMetres; });
  stationary.forEach((segment) => { totals.stationary.ms += segment.durationMs; });
  const turn = analyseDeliveryRoute(activity)?.turnIndex ?? Math.floor(points.length / 2);
  const outbound = segments.filter((segment) => segment.endIndex <= turn && segment.classification !== "customer" && segment.classification !== "store");
  const inbound = segments.filter((segment) => segment.startIndex >= turn && segment.classification !== "customer" && segment.classification !== "store");
  const sameRoad: SameRoadComparison[] = [];
  const usedReturn = new Set<number>();
  outbound.forEach((out) => {
    const outMid = points[Math.min(points.length - 1, Math.floor((out.startIndex + out.endIndex) / 2))];
    let match = -1; let closest = Infinity;
    inbound.forEach((back, index) => { if (usedReturn.has(index)) return; const mid = points[Math.min(points.length - 1, Math.floor((back.startIndex + back.endIndex) / 2))]; const distance = distanceMetres(outMid.latitude, outMid.longitude, mid.latitude, mid.longitude); if (distance < closest) { closest = distance; match = index; } });
    if (match < 0 || closest > 65) return;
    const back = inbound[match]; usedReturn.add(match); const shared = Math.min(out.distanceMetres, back.distanceMetres);
    if (shared < 35) return;
    sameRoad.push({ outboundStartIndex: out.startIndex, outboundEndIndex: out.endIndex, returnStartIndex: back.startIndex, returnEndIndex: back.endIndex, sharedMetres: shared, outboundMs: out.durationMs, returnMs: back.durationMs, outboundMph: out.averageMph, returnMph: back.averageMph, outboundSlowMs: out.classification === "slow" || out.classification === "heavy" ? out.durationMs : 0, returnSlowMs: back.classification === "slow" || back.classification === "heavy" ? back.durationMs : 0, confidence: closest <= 30 ? "high" : "medium" });
  });
  const meaningful = sameRoad.filter((item) => item.sharedMetres >= 160);
  return { segments, stationary, totals, sameRoad: meaningful };
}

/** Matches inferred stationary periods to nearby OSM traffic signals. This is local-only. */
export function classifyTrafficLightStops(activity: ActivityRecord, signals: TrafficSignal[], thresholdMetres = 50, thresholds = DEFAULT_SETTINGS.trafficClassification!): TrafficLightStop[] {
  const movement = analyseRouteMovement(activity, thresholds);
  const points = activity.routeEvidence?.points ?? [];
  const customer = resolveCustomerLocation(activity);
  const stationary = [...movement.stationary];
  (activity.routeEvidence?.stops ?? []).forEach((stop) => {
    if (stop.durationMs < 10_000 || stationary.some((item) => item.startAt === stop.startedAt && item.endAt === stop.endedAt)) return;
    const startIndex = points.findIndex((point) => point.timestamp === stop.startedAt);
    const endIndex = points.findIndex((point) => point.timestamp === stop.endedAt);
    if (startIndex >= 0 && endIndex > startIndex) stationary.push({ startIndex, endIndex, startAt: stop.startedAt, endAt: stop.endedAt, durationMs: stop.durationMs, distanceMetres: 0, averageMph: 0, minimumMph: 0, maximumMph: 0, classification: "stationary", confidence: "medium" });
  });
  return stationary.flatMap<TrafficLightStop>((stop) => {
    const point = points[Math.min(points.length - 1, stop.startIndex)];
    const stopPoints = points.slice(Math.max(0, stop.startIndex), Math.min(points.length, stop.endIndex + 1));
    if (!point || (customer && stopPoints.some((candidate) => distanceMetres(candidate.latitude, candidate.longitude, customer.latitude, customer.longitude) <= Math.max(55, (customer.accuracy ?? 0) + 35)))) return [];
    const manuallyMarked = (activity.routePointContexts ?? []).some((context) => context.context === "traffic_light" && context.pointIndex >= stop.startIndex && context.pointIndex <= stop.endIndex);
    const manuallyClassified = (activity.routeEventClassifications ?? []).some((item) => item.classification === "traffic_signal" && item.pointIndex >= stop.startIndex && item.pointIndex <= stop.endIndex);
    if (manuallyMarked || manuallyClassified) return [{ latitude: point.latitude, longitude: point.longitude, startedAt: stop.startAt, endedAt: stop.endAt, durationMs: stop.durationMs, nearestSignalMetres: 0, signalId: manuallyClassified ? "manual-event" : "driver-marked", startIndex: stop.startIndex, endIndex: stop.endIndex, confidence: "high" as const, source: "MANUALLY_CLASSIFIED" as const }];
    // A phone's accuracy radius and the way signals are mapped at a junction
    // mean a stationary sample should not need to sit on the exact OSM node.
    // Search the whole stop, not just its first sample: the driver can roll
    // forward while waiting and the best GPS point may be several seconds in.
    // Keep the tolerance bounded so unrelated signals are not absorbed.
    const maxAccuracy = Math.max(0, ...stopPoints.map((candidate) => candidate.accuracy || 0));
    const matchTolerance = Math.min(150, Math.max(thresholdMetres, maxAccuracy + 35));
    let closest: { signal: TrafficSignal; metres: number; point: DeliveryRoutePoint } | null = null;
    for (const signal of signals) {
      for (const candidate of stopPoints) {
        const metres = distanceMetres(candidate.latitude, candidate.longitude, signal.latitude, signal.longitude);
        if (metres <= matchTolerance && (!closest || metres < closest.metres)) closest = { signal, metres, point: candidate };
      }
    }
    if (!closest) return [];
    return [{ latitude: closest.point.latitude, longitude: closest.point.longitude, startedAt: stop.startAt, endedAt: stop.endAt, durationMs: stop.durationMs, nearestSignalMetres: closest.metres, signalId: closest.signal.id, startIndex: stop.startIndex, endIndex: stop.endIndex, confidence: closest.metres <= 25 ? "high" : closest.metres <= 75 ? "medium" : "low", source: closest.signal.source === "USER_CONFIRMED_LOCAL" ? "USER_CONFIRMED_LOCAL" as const : "OSM_MATCHED" as const }];
  });
}

/** Merge downloaded OSM signals with device-local corrections, preferring a
 * user-confirmed feature when both describe the same junction. */
export function mergeTrafficSignals(osmSignals: TrafficSignal[], localFeatures: LocalRoadFeature[] = []): TrafficSignal[] {
  const osm = osmSignals.map((signal) => ({ ...signal, source: signal.source ?? "OSM" as const }));
  const localSignals = localFeatures.filter((feature) => feature.featureType === "TRAFFIC_SIGNAL").map((feature) => ({ id: `local-${feature.id}`, latitude: feature.latitude, longitude: feature.longitude, source: "USER_CONFIRMED_LOCAL" as const, featureType: feature.featureType, createdAt: feature.createdAt, approachBearing: feature.approachBearing }));
  const merged = osm.filter((signal) => !localSignals.some((local) => distanceMetres(local.latitude, local.longitude, signal.latitude, signal.longitude) <= 80));
  return [...merged, ...localSignals];
}

/** Groups slow/stop-start movement on a downstream signal approach. Local GPS + OSM only. */
export function detectSignalQueues(activity: ActivityRecord, signals: TrafficSignal[], options: { lookAheadMetres?: number; passRadiusMetres?: number } = {}, thresholds = DEFAULT_SETTINGS.trafficClassification!): SignalQueueEvent[] {
  const points = activity.routeEvidence?.points ?? [];
  if (points.length < 4 || !signals.length) return [];
  const movement = analyseRouteMovement(activity, thresholds);
  const turnIndex = analyseDeliveryRoute(activity)?.turnIndex ?? Math.floor(points.length / 2);
  const lookAhead = Math.min(600, Math.max(200, Number(thresholds.signalQueueLookAheadMetres ?? options.lookAheadMetres ?? 400)));
  // A mapped signal is often placed at the centre of a junction rather than
  // on the lane where the driver passes it. Allow a wider pass radius while
  // retaining the directional and queue-shape checks below.
  const passRadius = options.passRadiusMetres ?? 160;
  const metresBetween = (start: number, end: number) => {
    let total = 0;
    for (let index = Math.max(1, start); index <= Math.min(points.length - 1, end); index += 1) total += distanceMetres(points[index - 1].latitude, points[index - 1].longitude, points[index].latitude, points[index].longitude);
    return total;
  };
  const isAhead = (index: number, signal: TrafficSignal) => {
    const from = points[Math.max(0, Math.min(points.length - 1, index))];
    const next = points[Math.min(points.length - 1, index + 1)];
    const travelX = (next.longitude - from.longitude) * 111320 * Math.cos(from.latitude * Math.PI / 180);
    const travelY = (next.latitude - from.latitude) * 111320;
    const signalX = (signal.longitude - from.longitude) * 111320 * Math.cos(from.latitude * Math.PI / 180);
    const signalY = (signal.latitude - from.latitude) * 111320;
    const travelLength = Math.hypot(travelX, travelY);
    return travelLength < 2 || (travelX * signalX + travelY * signalY) >= 0;
  };
  const candidates: SignalQueueEvent[] = [];
  for (const signal of signals) {
    let passIndex = -1; let passDistance = Infinity;
    const outboundLimit = Math.max(2, Math.min(turnIndex, points.length - 1));
    for (let index = 1; index <= outboundLimit; index += 1) {
      const distance = distanceMetres(points[index].latitude, points[index].longitude, signal.latitude, signal.longitude);
      if (distance < passDistance) { passDistance = distance; passIndex = index; }
    }
    if (passIndex < 2 || passDistance > passRadius) continue;
    const approach = movement.segments.filter((segment) => {
      if (segment.startIndex >= passIndex || segment.classification === "customer" || segment.classification === "store") return false;
      const point = points[Math.min(points.length - 1, Math.floor((segment.startIndex + segment.endIndex) / 2))];
      const distance = distanceMetres(point.latitude, point.longitude, signal.latitude, signal.longitude);
      const queueLike = segment.classification === "slow" || segment.classification === "heavy" || (segment.averageMph > 0 && segment.averageMph < 10);
      return queueLike && distance <= lookAhead && isAhead(segment.startIndex, signal);
    });
    if (!approach.length) continue;
    const groups: RouteMovementSegment[][] = [];
    for (const segment of approach) {
      const previousGroup = groups.at(-1); const previous = previousGroup?.at(-1);
      const closeEnough = previous && segment.startIndex <= previous.endIndex + 1 && new Date(segment.startAt).getTime() - new Date(previous.endAt).getTime() <= 60_000;
      if (closeEnough) previousGroup!.push(segment); else groups.push([segment]);
    }
    for (const group of groups) {
      const startIndex = group[0].startIndex;
      const stationary = movement.stationary.filter((stop) => stop.startIndex >= startIndex && stop.endIndex <= passIndex);
      const stopCycles = stationary.length;
      const endIndex = passIndex;
      const durationMs = Math.max(0, new Date(points[endIndex].timestamp).getTime() - new Date(points[startIndex].timestamp).getTime());
      const queueDistanceMetres = metresBetween(startIndex, endIndex);
      const stationaryMs = stationary.reduce((sum, stop) => sum + stop.durationMs, 0);
      const crawlingMs = group.reduce((sum, segment) => sum + (segment.averageMph > 0 && segment.averageMph < 5 ? segment.durationMs : 0), 0);
      const qualifies = stopCycles >= 2 && durationMs >= 60_000 && queueDistanceMetres >= 60;
      if (!qualifies) continue;
      const averageMph = durationMs > 0 ? queueDistanceMetres / durationMs * 2236.936 : 0;
      candidates.push({ signalId: signal.id, startIndex, endIndex, startAt: points[startIndex].timestamp, endAt: points[endIndex].timestamp, durationMs, queueDistanceMetres, stationaryMs, crawlingMs, stopCycles, averageMph, signalDistanceAtStart: distanceMetres(points[startIndex].latitude, points[startIndex].longitude, signal.latitude, signal.longitude), signalPassDistance: passDistance, confidence: stopCycles >= 2 && durationMs >= 90_000 ? "high" : "medium" });
    }
  }
  candidates.sort((a, b) => a.startIndex - b.startIndex || b.durationMs - a.durationMs);
  const accepted: SignalQueueEvent[] = [];
  for (const candidate of candidates) {
    const overlaps = accepted.some((existing) => candidate.startIndex < existing.endIndex && existing.startIndex < candidate.endIndex);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted;
}

export function shouldSaveRoutePoint(previous: DeliveryRoutePoint | undefined, next: DeliveryRoutePoint, detail: RouteGpsDetail = "standard") {
  if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude) || !Number.isFinite(next.accuracy) || next.accuracy > 250) return false;
  if (!previous) return true;
  const elapsed = new Date(next.timestamp).getTime() - new Date(previous.timestamp).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return false;
  const sampling = ROUTE_SAMPLING[detail];
  return elapsed >= sampling.maximumIntervalMs || distanceMetres(previous.latitude, previous.longitude, next.latitude, next.longitude) >= sampling.movementMetres;
}

export function routeRetentionExpiry(completedAt: string, retention: RouteRetention) {
  if (retention === "forever") return null;
  return new Date(new Date(completedAt).getTime() + Number(retention) * DAY_MS).toISOString();
}

export function appendRoutePoint(route: DeliveryRouteEvidence, point: DeliveryRoutePoint, detectTrafficDelay = true) {
  const previous = route.points.at(-1);
  if (!shouldSaveRoutePoint(previous, point, route.detail)) return false;
  if (previous) {
    const elapsed = new Date(point.timestamp).getTime() - new Date(previous.timestamp).getTime();
    if (elapsed >= ROUTE_SAMPLING[route.detail].gapMs) route.gaps.push({ from: previous.timestamp, to: point.timestamp, durationMs: elapsed });
    route.distanceMetres += distanceMetres(previous.latitude, previous.longitude, point.latitude, point.longitude);
  }
  route.points.push(point);
  route.recordedPointCount = route.points.length;
  // A car that remains within a small GPS jitter radius for at least 90 seconds
  // is useful route context. Keep it as an inferred delay pin; never fabricate a
  // route segment or claim a verified cause.
  if (!detectTrafficDelay) return true;
  const stationaryRadiusMetres = 30;
  // A 30–75 second roadside stop is consistent with a signal phase; it remains a GPS-derived probability, never a confirmed light.
  const trafficDelayMs = 30_000;
  let stationaryStart = point;
  for (let index = route.points.length - 2; index >= 0; index -= 1) {
    const candidate = route.points[index];
    const next = route.points[index + 1];
    if (distanceMetres(candidate.latitude, candidate.longitude, next.latitude, next.longitude) > stationaryRadiusMetres) break;
    stationaryStart = candidate;
  }
  const stationaryMs = new Date(point.timestamp).getTime() - new Date(stationaryStart.timestamp).getTime();
  if (stationaryMs >= trafficDelayMs) {
    route.stops ??= [];
    const lastStop = route.stops.at(-1);
    if (lastStop && distanceMetres(lastStop.latitude, lastStop.longitude, point.latitude, point.longitude) <= stationaryRadiusMetres * 1.5 && new Date(point.timestamp).getTime() - new Date(lastStop.endedAt).getTime() <= ROUTE_SAMPLING[route.detail].maximumIntervalMs * 2) {
      lastStop.endedAt = point.timestamp;
      lastStop.durationMs = new Date(point.timestamp).getTime() - new Date(lastStop.startedAt).getTime();
      lastStop.kind = lastStop.durationMs < 75_000 ? "probable_traffic_light" : "traffic_delay";
    } else {
      route.stops.push({ latitude: point.latitude, longitude: point.longitude, startedAt: stationaryStart.timestamp, endedAt: point.timestamp, durationMs: stationaryMs, kind: stationaryMs < 75_000 ? "probable_traffic_light" : "traffic_delay" });
    }
  }
  return true;
}

export function finalizeRouteEvidence(route: DeliveryRouteEvidence, completedAt: string) {
  route.completedAt = completedAt;
  route.recordedPointCount = Math.max(route.recordedPointCount, route.points.length);
  route.distanceMetres = routeDistanceMetres(route.points);
  route.expiresAt = routeRetentionExpiry(completedAt, route.retention);
  route.status = route.points.length >= 2 && route.gaps.length === 0 && route.issues.length === 0 ? "complete" : "partial";
  return route;
}

export function cleanupExpiredRoutes(data: AppData, now = new Date()) {
  let changed = false;
  const current = now.getTime();
  data.shifts.forEach((shift) => shift.activities?.forEach((activity) => {
    const route = activity.routeEvidence;
    if (!route?.expiresAt || route.status === "expired" || new Date(route.expiresAt).getTime() > current) return;
    route.recordedPointCount = Math.max(route.recordedPointCount ?? 0, route.points?.length ?? 0);
    route.points = [];
    route.status = "expired";
    route.expiredAt = now.toISOString();
    // Route points and customer-area coordinate references have the same
    // retention boundary.  Keep timing/summary metadata, but do not leave an
    // exact Delivered point or expected-route customer coordinate behind.
    activity.customerEvents = [];
    if (activity.expectedRoute) activity.expectedRoute.customer = null;
    if (route.stops) route.stops = [];
    changed = true;
  }));
  return changed;
}

export function hasExpiredRoutes(data: AppData, now = new Date()) {
  const current = now.getTime();
  return data.shifts.some((shift) =>
    shift.activities?.some((activity) => {
      const route = activity.routeEvidence;
      if (!route?.expiresAt || route.status === "expired") return false;
      const expiresAt = Date.parse(route.expiresAt);
      return Number.isFinite(expiresAt) && expiresAt <= current;
    }) ?? false,
  );
}

/**
 * Keeps ordinary foreground/resume events allocation-free. The full AppData
 * clone is created only on the uncommon day that route retention actually
 * expires, so a growing GPS history cannot stall every return to the app.
 */
export function cleanupExpiredRoutesIfNeeded(data: AppData, now = new Date()) {
  if (!hasExpiredRoutes(data, now)) return data;
  const next = structuredClone(data);
  cleanupExpiredRoutes(next, now);
  return next;
}

/** Real Hustle enters at the protected 35m boundary and exits only after the
 * existing 12m outward hysteresis. */
export function classifyStorePresence(distance: number, radius = 35, previous: StorePresence = "unknown"): StorePresence {
  const enterAt = radius;
  const exitAt = radius + 12;
  if (distance <= enterAt) return "inside";
  if (distance >= exitAt) return "outside";
  return previous;
}

/**
 * A single reading is enough when its GPS accuracy circle sits wholly on one
 * side of the relevant geofence threshold. Borderline readings still need the
 * normal consecutive-sample confirmation.
 */
export function isConclusiveStorePresence(distance: number, accuracy: number, radius = 35, presence: StorePresence): boolean {
  const enterAt = radius;
  const exitAt = radius + 12;
  if (presence === "outside") return distance - Math.max(0, accuracy) >= exitAt;
  if (presence === "inside") return distance + Math.max(0, accuracy) <= enterAt;
  return false;
}

/**
 * Evaluates one already-canonical GPS fix for one boundary. State is supplied
 * by the caller, so multiple boundaries can consume the same fix without
 * sharing transition state or starting another GPS watcher.
 */
export function evaluateGeofenceSample(state: GeofenceEvaluatorState, definition: GeofenceDefinition, sample: Pick<DeliveryRoutePoint, "latitude" | "longitude" | "timestamp" | "accuracy">): { state: GeofenceEvaluatorState; transition: GeofenceTransition | null } {
  const sampleTime = Date.parse(sample.timestamp);
  const accuracy = Math.max(0, sample.accuracy || 0);
  if (!Number.isFinite(sampleTime) || accuracy > 65 || sampleTime <= state.lastSampleAt) return { state, transition: null };
  const distance = distanceMetres(sample.latitude, sample.longitude, definition.latitude, definition.longitude);
  const enterAt = definition.entryRadius ?? definition.radius;
  const exitAt = definition.radius + 12;
  const candidate: StorePresence = distance <= enterAt ? "inside" : distance >= exitAt ? "outside" : state.presence;
  if (candidate === "unknown") return { state, transition: null };
  const continuous = state.continuityUnknown !== true && (!state.lastSampleAt || sampleTime - state.lastSampleAt <= 60_000);
  const continuingCandidate = continuous && state.pendingPresence === candidate && Boolean(state.pendingSinceAt);
  const pendingCount = continuingCandidate ? state.pendingCount + 1 : 1;
  const pendingSinceAt = continuingCandidate ? state.pendingSinceAt! : sample.timestamp;
  const pendingObserved = continuingCandidate ? state.pendingObserved !== false : continuous;
  const conclusive = candidate === "outside"
    ? distance - accuracy >= exitAt
    : distance + accuracy <= enterAt;
  const requiredSamples = state.presence === "unknown" || conclusive ? 1 : 2;
  if (pendingCount < requiredSamples) return { state: { ...state, continuityUnknown: false, pendingPresence: candidate, pendingCount, pendingSinceAt, pendingObserved, lastSampleAt: sampleTime }, transition: null };
  const previous = state.presence;
  const nextState: GeofenceEvaluatorState = { ...state, continuityUnknown: false, presence: candidate, pendingPresence: "unknown", pendingCount: 0, pendingSinceAt: null, lastSampleAt: sampleTime };
  if (previous === "unknown" || previous === candidate) return { state: nextState, transition: null };
  if (previous === "outside" && candidate === "inside" && shouldIgnoreRapidNativeStoreReentry(state.exitAt, pendingSinceAt)) return { state: { ...nextState, presence: "outside" }, transition: null };
  if (previous === "inside" && candidate === "outside") nextState.exitAt = pendingSinceAt;
  return { state: nextState, transition: { from: previous, to: candidate, timestamp: pendingSinceAt, observed: pendingObserved } };
}

/** Operational return evidence survives page recreation without rewriting an
 * unobserved crossing as exact timing. Called after evaluator confirmation. */
export function recordStoreReturnPresence(activity: ActivityRecord, state: GeofenceEvaluatorState,
  sample: Pick<DeliveryRoutePoint, "latitude" | "longitude" | "timestamp" | "accuracy">,
  definition: GeofenceDefinition): boolean {
  if (activity.end || confirmedStoreReturnAt(activity) || state.presence !== "inside" ||
      state.pendingPresence !== "unknown" || !deliveryCustomersComplete(activity)) return false;
  const sampleMs = Date.parse(sample.timestamp);
  const exitMs = Date.parse(activity.storeExitAt ?? "");
  const delivered = (activity.customerEvents ?? []).filter(event => event.source === "manual_delivered");
  const latestDeliveredMs = Math.max(...delivered.map(event => Date.parse(event.timestamp)));
  if (!activity.storeExitObserved || !Number.isFinite(exitMs) || !Number.isFinite(sampleMs) ||
      sampleMs !== state.lastSampleAt ||
      !Number.isFinite(latestDeliveredMs) || sampleMs < Math.max(exitMs, latestDeliveredMs, Date.parse(activity.start)) ||
      !Number.isFinite(sample.accuracy) || sample.accuracy < 0 || sample.accuracy > 65 ||
      !Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude) ||
      distanceMetres(sample.latitude, sample.longitude, definition.latitude, definition.longitude) > (definition.entryRadius ?? definition.radius)) return false;
  activity.storeReturnConfirmedAt = sample.timestamp;
  return true;
}

export function confirmedStoreReturnAt(activity: ActivityRecord): string | null {
  if (!deliveryCustomersComplete(activity)) return null;
  const confirmed = Date.parse(activity.storeReturnConfirmedAt ?? "");
  const exit = Date.parse(activity.storeExitAt ?? "");
  const lastDelivered = Math.max(...(activity.customerEvents ?? []).filter(event => event.source === "manual_delivered").map(event => Date.parse(event.timestamp)));
  if (hasConfirmedStoreReturn(activity) && Number.isFinite(lastDelivered) && Date.parse(activity.storeEntryAt!) >= lastDelivered) return activity.storeEntryAt!;
  return activity.storeExitObserved && deliveryCustomersComplete(activity) && Number.isFinite(confirmed) &&
    Number.isFinite(exit) && Number.isFinite(lastDelivered) && confirmed >= Math.max(exit, lastDelivered, Date.parse(activity.start))
    ? activity.storeReturnConfirmedAt! : null;
}

/** Route storage retains uncertain fixes; they must not establish evaluator
 * continuity on page recovery. Missing evidence stays a genuine gap. */
export function realGeofenceRecoveryTimestamp(activity: ActivityRecord): number {
  const lastEligible = activity.routeEvidence?.points.findLast(point =>
    Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= 65);
  const evidence = [activity.start, activity.storeExitAt, activity.storeEntryAt,
    activity.storeReturnConfirmedAt, lastEligible?.timestamp];
  return Math.max(0, ...evidence.map(stamp => Date.parse(stamp ?? "")).filter(Number.isFinite));
}

export interface GeofenceEvidence {
  exitAt: string | null;
  entryAt: string | null;
  exitObserved: boolean;
  entryObserved: boolean;
  startedOutside: boolean;
  derivedFromRoute: boolean;
}

/**
 * Reconstructs comparison evidence only when retained route points contain a
 * confirmed inside → outside → inside sequence. Missing or expired traces are
 * reported as not recorded; Real Hustle is never copied or approximated.
 */
export function deriveGeofenceEvidenceFromRoute(activity: ActivityRecord, definition: GeofenceDefinition): GeofenceEvidence | null {
  const points = normaliseDeliveryRoutePoints(activity.routeEvidence?.points);
  if (points.length < 3) return null;
  let state = initialGeofenceEvaluatorState();
  let sawInsideBaseline = false;
  let exitAt: string | null = null;
  let entryAt: string | null = null;
  for (const point of points) {
    const result = evaluateGeofenceSample(state, definition, point);
    state = result.state;
    if (state.presence === "inside" && !exitAt) sawInsideBaseline = true;
    if (!result.transition?.observed) continue;
    if (result.transition.from === "inside" && result.transition.to === "outside" && sawInsideBaseline && !exitAt) exitAt = result.transition.timestamp;
    if (result.transition.from === "outside" && result.transition.to === "inside" && exitAt && !entryAt) entryAt = result.transition.timestamp;
  }
  if (!exitAt) return null;
  return { exitAt, entryAt, exitObserved: true, entryObserved: Boolean(entryAt), startedOutside: false, derivedFromRoute: true };
}

export function activityGeofenceEvidence(activity: ActivityRecord, source: HustleSource = "real"): GeofenceEvidence {
  if (source === "real") return {
    exitAt: activity.storeExitAt ?? null,
    entryAt: activity.storeEntryAt ?? null,
    exitObserved: activity.storeExitObserved === true,
    entryObserved: activity.storeEntryObserved === true,
    startedOutside: activity.startedOutsideStore === true,
    derivedFromRoute: false,
  };
  const persisted = activity.dominosStoreExitAt || activity.dominosStoreEntryAt || activity.dominosStoreExitObserved || activity.dominosStoreEntryObserved || activity.dominosStartedOutsideStore;
  if (persisted) return {
    exitAt: activity.dominosStoreExitAt ?? null,
    entryAt: activity.dominosStoreEntryAt ?? null,
    exitObserved: activity.dominosStoreExitObserved === true,
    entryObserved: activity.dominosStoreEntryObserved === true,
    startedOutside: activity.dominosStartedOutsideStore === true,
    derivedFromRoute: false,
  };
  return deriveGeofenceEvidenceFromRoute(activity, dominosGeofenceDefinitionForActivity(activity)) ?? { exitAt: null, entryAt: null, exitObserved: false, entryObserved: false, startedOutside: false, derivedFromRoute: false };
}

/** Location-assisted deliveries may only be completed after a confirmed return. */
export function locationAllowsDeliveryCompletion(locationAssistEnabled: boolean | undefined, locationReady: boolean, presence: StorePresence): boolean {
  return !locationAssistEnabled || (locationReady && presence === "inside");
}

/** A persisted canonical geofence entry remains valid if live provider state later goes stale. */
export function hasConfirmedStoreReturn(activity: Pick<ActivityRecord, "storeExitAt" | "storeExitObserved" | "storeEntryAt" | "storeEntryObserved">): boolean {
  const exit = Date.parse(activity.storeExitAt ?? "");
  const entry = Date.parse(activity.storeEntryAt ?? "");
  return Boolean(activity.storeExitObserved && activity.storeEntryObserved && Number.isFinite(exit) && Number.isFinite(entry) && entry >= exit);
}

/** A delivery cannot be operationally returned until every required customer
 * has an explicit Delivered action for that same delivery. */
export function deliveryCustomersComplete(activity: Pick<ActivityRecord, "type" | "customerDeliveries" | "customerEvents">): boolean {
  const required = activity.customerDeliveries ?? (activity.type === "double_delivery" ? 2 : 1);
  const delivered = (activity.customerEvents ?? []).filter((event) => event.source === "manual_delivered").length;
  return delivered >= required;
}

/** Stock runs use the same journey recorder but have no customer stop. */
export function isStockRun(activity: Pick<ActivityRecord, "stockRun"> | null | undefined): boolean {
  return activity?.stockRun === true;
}

/** Fixed comparison baseline for James's 1.4 Corsa, not journey-by-journey MPG. */
export function corsaFuelEstimate(miles: number, settings: Pick<Settings, "corsaTankLitres" | "corsaMilesPerTank" | "petrolPricePencePerLitre"> = DEFAULT_SETTINGS) {
  const tankLitres = Number.isFinite(settings.corsaTankLitres) && settings.corsaTankLitres! > 0 ? settings.corsaTankLitres! : 45;
  const milesPerTank = Number.isFinite(settings.corsaMilesPerTank) && settings.corsaMilesPerTank! > 0 ? settings.corsaMilesPerTank! : 350;
  const petrolPricePencePerLitre = Number.isFinite(settings.petrolPricePencePerLitre) && settings.petrolPricePencePerLitre! >= 0 ? settings.petrolPricePencePerLitre! : 158.9;
  const safeMiles = Math.max(0, miles || 0);
  const litres = safeMiles * tankLitres / milesPerTank;
  const pencePerMile = tankLitres * petrolPricePencePerLitre / milesPerTank;
  return { miles: safeMiles, litres, pencePerMile, fuelPence: Math.round(litres * petrolPricePencePerLitre), tankLitres, milesPerTank, petrolPricePencePerLitre };
}

/** Transparent breakdown: paid wage is the store's time cost; fuel is the driver's unreimbursed estimate. */
export function stockRunCostPence(activity: ActivityRecord, hourlyRatePence: number, fuelCostPencePerMile: number, now = new Date()) {
  const wagePence = Math.round(activityMilliseconds(activity, now) * hourlyRatePence / 3_600_000);
  const routeMiles = Math.max(0, activity.routeEvidence?.distanceMetres ?? 0) / 1609.344;
  const fuelPence = Math.round(routeMiles * Math.max(0, fuelCostPencePerMile || 0));
  return { wagePence, fuelPence, totalPence: wagePence + fuelPence, netPence: wagePence - fuelPence, routeMiles };
}

export const NATIVE_STORE_REENTRY_GUARD_MS = 60_000;

/**
 * Native fused GPS can briefly jump back across the store boundary just after
 * a genuine exit. Suppress only that early Android re-entry candidate; the
 * original provider timestamps and browser/PWA geofence flow stay unchanged.
 */
export function shouldIgnoreRapidNativeStoreReentry(storeExitAt: string | null | undefined, sampleTimestamp: string, guardMs = NATIVE_STORE_REENTRY_GUARD_MS): boolean {
  const exit = Date.parse(storeExitAt ?? "");
  const sample = Date.parse(sampleTimestamp);
  const elapsed = sample - exit;
  return Number.isFinite(exit) && Number.isFinite(sample) && elapsed >= 0 && elapsed < guardMs;
}

export function deliveryGeofenceDurations(activity: ActivityRecord, source: HustleSource = "real", liveNow?: Date) {
  if (activity.badDelivery) return { totalMs: null, preDepartureMs: null, hustleMs: null, returnDelayMs: null };
  const evidence = activityGeofenceEvidence(activity, source);
  const sourceStart = source === "dominos" && activity.wasEarlyDispatched && activity.dominosDispatchStartedAt ? activity.dominosDispatchStartedAt : activity.start;
  const start = new Date(sourceStart).getTime();
  const exit = evidence.exitAt ? new Date(evidence.exitAt).getTime() : NaN;
  const entry = evidence.entryAt ? new Date(evidence.entryAt).getTime() : NaN;
  const back = activity.backAtStoreAt ? new Date(activity.backAtStoreAt).getTime() : activity.end ? new Date(activity.end).getTime() : liveNow?.getTime() ?? NaN;
  const valid = (value: number) => Number.isFinite(value);
  const validExit = valid(start) && valid(exit) && evidence.exitObserved && exit >= start && (!valid(back) || exit <= back);
  const validSequence = validExit && valid(entry) && evidence.entryObserved && entry >= exit && (!valid(back) || entry <= back);
  return {
    totalMs: valid(back) && back >= start ? back - start : null,
    preDepartureMs: validExit ? exit - start : null,
    hustleMs: validSequence ? entry - exit : null,
    returnDelayMs: validSequence && valid(back) && back >= entry ? back - entry : null,
  };
}

/** Completed operational delivery timings with an explicit Hustle source. */
export function deliveryGeofenceTimingsForShift(shift: Shift, source: HustleSource = "real") {
  return (shift.activities ?? [])
    .filter((activity) => !activity.testOnly && !activity.badDelivery && (activity.type === "single_delivery" || activity.type === "double_delivery") && activity.end)
    .map((activity) => deliveryGeofenceDurations(activity, source));
}

export type HustleRecordRange = "shift" | "week" | "month";
export interface HustleRecordSummary {
  range: HustleRecordRange;
  periodStart: string;
  averageMs: number;
  runCount: number;
  shiftId: string | null;
}

/**
 * Finds the quickest fully observed store-turnaround record. A run contributes
 * only when both button → exit and entry → Back at Store are recorded; missing
 * GPS is never treated as zero. Ties favour the period with more evidence and
 * then the most recent period.
 */
export function bestHustleRecord(shifts: Shift[], range: HustleRecordRange, source: HustleSource = "real"): HustleRecordSummary | null {
  const groups = new Map<string, { periodStart: string; totalMs: number; runCount: number; shiftId: string | null }>();
  for (const shift of shifts) {
    for (const activity of shift.activities ?? []) {
      if (activity.testOnly || activity.badDelivery || !activity.end || (activity.type !== "single_delivery" && activity.type !== "double_delivery")) continue;
      const timing = deliveryGeofenceDurations(activity, source);
      if (timing.preDepartureMs == null || timing.returnDelayMs == null) continue;
      const activityDate = new Date(activity.start);
      if (!Number.isFinite(activityDate.getTime())) continue;
      let periodStart = shift.clockIn;
      let key = shift.id;
      let shiftId: string | null = shift.id;
      if (range === "week") {
        const monday = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
        periodStart = monday.toISOString();
        key = periodStart;
        shiftId = null;
      } else if (range === "month") {
        periodStart = new Date(activityDate.getFullYear(), activityDate.getMonth(), 1).toISOString();
        key = periodStart;
        shiftId = null;
      }
      const group = groups.get(key) ?? { periodStart, totalMs: 0, runCount: 0, shiftId };
      group.totalMs += timing.preDepartureMs + timing.returnDelayMs;
      group.runCount += 1;
      groups.set(key, group);
    }
  }
  const ranked = [...groups.values()].map((group) => ({ ...group, averageMs: group.totalMs / group.runCount }));
  ranked.sort((a, b) => a.averageMs - b.averageMs || b.runCount - a.runCount || Date.parse(b.periodStart) - Date.parse(a.periodStart));
  const best = ranked[0];
  return best ? { range, periodStart: best.periodStart, averageMs: best.averageMs, runCount: best.runCount, shiftId: best.shiftId } : null;
}

export function cleaningRequiredFor(role: ShiftRole, clockIn: string | Date, override: boolean | null = null): boolean {
  if (override !== null) return override;
  if (role === "open") return true;
  if (role === "other") return false;
  return new Date(clockIn).getHours() < 13;
}

export function snapshotTasks(rota: CleaningTaskDefinition[], date: Date): ShiftTaskRecord[] {
  return rota.filter((task) => task.enabled && task.weekday === date.getDay()).sort((a,b) => a.order - b.order).map((task) => ({
    ...structuredClone(task), category: "cleaning", id: makeId(), sourceTaskId: task.id, status: "not_started", segments: [], completedAt: null, quickCompleted: false, completedBySomeoneElse: false, shiftNotes: "", photoProof: null, photoProofs: [],
  }));
}
export function snapshotPreparationTasks(rota: CleaningTaskDefinition[]): ShiftTaskRecord[] {
  return rota.filter((task) => task.enabled).sort((a,b) => a.order - b.order).map((task) => ({
    ...structuredClone(task), category: "prep", id: makeId(), sourceTaskId: task.id, status: "not_started", segments: [], completedAt: null, quickCompleted: false, completedBySomeoneElse: false, notRequired: task.notRequiredByDefault === true, notRequiredAt: null, shiftNotes: "", photoProof: null, photoProofs: [],
  }));
}

export function createShift(settings: Settings, now = new Date(), mileageChoice?: MileageMethod, role: ShiftRole = "other", rota: CleaningTaskDefinition[] = CLEANING_ROTA, preparationRota: CleaningTaskDefinition[] = PREPARATION_ROTA, storeId: StoreId = "ormskirk"): Shift {
  const mileageMethod: MileageMethod = mileageChoice ?? (settings.mileagePreference === "odometer" ? "odometer" : "direct");
  const iso = now.toISOString();
  return {
    id: makeId(), storeId, status: "working", clockIn: iso, clockOut: null, breaks: [], deliveries: [],
    mileage: { method: mileageMethod, startTenths: null, endTenths: null, directTenths: null },
    hourlyRatePence: settings.hourlyRatePence,
    singleRatePence: settings.singleRatePence,
    doubleRatePence: settings.doubleRatePence,
    manualDeliveryCount: null,
    reimbursementStatus: "awaiting", reimbursementPaymentId: null, noBreakRecord: null, isLocked: true,
    role, cleaningOverride: null, cleaningRequired: cleaningRequiredFor(role, now), taskSnapshot: [...snapshotTasks(rota, now), ...(settings.deliveryDays ?? [2, 4, 6]).includes(now.getDay()) ? snapshotPreparationTasks(preparationRota) : []],
    activities: [{ id: makeId(), shiftId: "pending", type: "clock_in", start: iso, end: iso, tracked: false }], pendingResumeTaskId: null, pendingResumeBlockedTime: null, pendingEarlyDispatch: null, queuedEarlyDispatch: null, pendingCarryoutDepartureAt: null, firstTaskPromptHandled: false,
    createdAt: iso, updatedAt: iso,
  };
}

export function repairShiftActivityIds(shift: Shift) {
  shift.activities?.forEach((activity) => { if (activity.shiftId === "pending") activity.shiftId = shift.id; });
  return shift;
}

export function activityMilliseconds(activity: ActivityRecord, now = new Date()): number {
  if (activity.segments?.length) return activity.segments.reduce((sum, segment) => sum + Math.max(0, new Date(segment.end ?? now).getTime() - new Date(segment.start).getTime()), 0);
  if (activity.tracked === false) return 0;
  return Math.max(0, new Date(activity.end ?? now).getTime() - new Date(activity.start).getTime());
}

export function taskMilliseconds(task: ShiftTaskRecord, now = new Date()): number {
  return task.segments.reduce((sum, segment) => sum + Math.max(0, new Date(segment.end ?? now).getTime() - new Date(segment.start).getTime()), 0);
}

export function trackedActivityTotals(shift: Shift, now = new Date()) {
  const activities = shift.activities ?? [];
  const deliveryMs = activities.filter((item) => !item.testOnly && !item.badDelivery && (item.type === "single_delivery" || item.type === "double_delivery")).reduce((sum, item) => sum + activityMilliseconds(item, now), 0);
  const cleaningMs = (shift.taskSnapshot ?? []).filter((task) => task.category !== "prep").reduce((sum, task) => sum + taskMilliseconds(task, now), 0);
  const preparationMs = (shift.taskSnapshot ?? []).filter((task) => task.category === "prep").reduce((sum, task) => sum + taskMilliseconds(task, now), 0);
  const otherMs = activities.filter((item) => item.type === "other_task").reduce((sum, item) => sum + activityMilliseconds(item, now), 0);
  const blockedMs = activities.filter((item) => item.type === "blocked_time").reduce((sum, item) => sum + activityMilliseconds(item, now), 0);
  return { deliveryMs, cleaningMs, preparationMs, otherTaskMs: otherMs, blockedMs, untrackedPaidMs: Math.max(0, paidMilliseconds(shift, now) - deliveryMs - cleaningMs - preparationMs - otherMs - blockedMs) };
}

export const BLOCKED_TIME_REASONS: readonly BlockedTimeReason[] = ["waiting_for_instruction", "manager_stopped_task", "no_task_permitted", "nothing_available", "idiot_in_charge", "other"];

export function blockedTimeReasonLabel(reason: BlockedTimeReason, audience: "private" | "professional" = "private") {
  if (reason === "idiot_in_charge") return audience === "professional" ? "Management blocked" : "Idiot in charge";
  return ({ waiting_for_instruction: "Waiting for instruction", manager_stopped_task: "Manager stopped task", no_task_permitted: "No task permitted", nothing_available: "Nothing available", other: "Other" } as const)[reason];
}

export function blockedTimeBreakdown(shift: Shift, now = new Date()) {
  const totals = new Map<BlockedTimeReason, number>();
  for (const activity of shift.activities ?? []) {
    if (activity.type !== "blocked_time" || !activity.blockedReason) continue;
    totals.set(activity.blockedReason, (totals.get(activity.blockedReason) ?? 0) + activityMilliseconds(activity, now));
  }
  return BLOCKED_TIME_REASONS.flatMap((reason) => {
    const durationMs = totals.get(reason) ?? 0;
    return durationMs > 0 ? [{ reason, durationMs }] : [];
  });
}

export function endBlockedTime(shift: Shift, at: string): boolean {
  const blocked = (shift.activities ?? []).findLast((item) => item.type === "blocked_time" && !item.end);
  if (!blocked) return false;
  const startMs = Date.parse(blocked.start);
  const endMs = Date.parse(at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) throw new Error("Stale blocked-time transition ignored; end is earlier than its start.");
  blocked.end = at;
  shift.updatedAt = at;
  return true;
}

export function pauseBlockedTimeForDelivery(shift: Shift, at: string): boolean {
  const blocked = (shift.activities ?? []).findLast((item) => item.type === "blocked_time" && !item.end);
  if (!blocked) return false;
  const reason = blocked.blockedReason ?? "other";
  const note = blocked.blockedNote?.trim();
  if (!endBlockedTime(shift, at)) return false;
  shift.pendingResumeBlockedTime = { reason, ...(note ? { note } : {}) };
  return true;
}

export function resumePendingBlockedTime(shift: Shift, at = new Date().toISOString()) {
  const pending = shift.pendingResumeBlockedTime;
  if (!pending) return { ok: false as const, message: "There is no interrupted Blocked Time to continue." };
  return startBlockedTime(shift, pending.reason, pending.note ?? "", at);
}

export function dismissPendingBlockedTime(shift: Shift, at = new Date().toISOString()): boolean {
  if (!shift.pendingResumeBlockedTime) return false;
  shift.pendingResumeBlockedTime = null;
  shift.updatedAt = at;
  return true;
}

export function startBlockedTime(shift: Shift, reason: BlockedTimeReason, note = "", at = new Date().toISOString()): { ok: true; activityId: string } | { ok: false; message: string } {
  if (shift.status !== "working") return { ok: false, message: "End the break before starting Blocked Time." };
  if (!BLOCKED_TIME_REASONS.includes(reason)) return { ok: false, message: "Choose a Blocked Time reason." };
  const atMs = Date.parse(at);
  const shiftStartMs = Date.parse(shift.clockIn);
  if (!Number.isFinite(atMs) || !Number.isFinite(shiftStartMs) || atMs < shiftStartMs) return { ok: false, message: "Choose a valid Blocked Time start." };
  const running = activeTimedActivity(shift);
  if (running?.kind === "delivery") return { ok: false, message: "Finish the delivery before starting Blocked Time." };
  if (running?.kind === "blocked") return { ok: false, message: "Blocked Time is already running." };
  if (running && atMs < Date.parse(running.start)) return { ok: false, message: "Blocked Time cannot start before the current work." };

  if (running?.kind === "cleaning" || running?.kind === "prep") {
    const task = shift.taskSnapshot?.find((item) => item.id === running.id);
    const segment = task?.segments.findLast((item) => !item.end);
    if (!task || !segment) return { ok: false, message: "The running task changed. Try again." };
    if (atMs < Date.parse(segment.start)) return { ok: false, message: "Blocked Time cannot start before the current task." };
    segment.end = at;
    task.status = "paused";
    shift.pendingResumeTaskId = task.id;
    const taskActivity = shift.activities?.findLast((item) => (item.type === "cleaning_task" || item.type === "prep_task") && item.taskId === task.id && !item.end);
    if (taskActivity) {
      taskActivity.end = at;
      taskActivity.segments = structuredClone(task.segments);
    }
  } else if (running?.kind === "other") {
    const other = shift.activities?.find((item) => item.id === running.id && item.type === "other_task" && !item.end);
    if (!other) return { ok: false, message: "The running task changed. Try again." };
    other.end = at;
    if (!other.quickStack) shift.pendingResumeOtherTaskId = other.id;
  }

  const activityId = makeId();
  shift.activities ??= [];
  shift.activities.push({ id: activityId, shiftId: shift.id, type: "blocked_time", start: at, end: null, tracked: true, blockedReason: reason, blockedNote: note.trim() || undefined });
  shift.pendingResumeBlockedTime = null;
  shift.updatedAt = at;
  return { ok: true, activityId };
}

export function operationalAllowance(shift: Shift, settings: Settings, now = new Date()) {
  const configured = { ...DEFAULT_SETTINGS.operationalAllowances!, ...(settings.operationalAllowances ?? {}) };
  const workedHours = paidMilliseconds(shift, now) / 3_600_000;
  const orders = (shift.deliveries ?? []).filter((item) => !item.testOnly).reduce((sum, item) => sum + (item.type === "double" ? 2 : 1), 0);
  const timed = (shift.activities ?? []).filter((item) => !item.testOnly && ["single_delivery", "double_delivery", "cleaning_task", "prep_task", "other_task"].includes(item.type)).sort((a, b) => a.start.localeCompare(b.start));
  const raw = {
    comfortMs: workedHours * configured.comfortMinutesPerHour * 60_000,
    orderHandlingMs: orders * configured.orderHandlingMinutesPerOrder * 60_000,
    transitionsMs: Math.max(0, timed.length - 1) * configured.transitionSeconds * 1_000,
    returnResetMs: (shift.activities ?? []).filter((item) => !item.testOnly && (item.type === "single_delivery" || item.type === "double_delivery") && item.end).length * configured.returnResetMinutes * 60_000,
  };
  const rawTotal = Object.values(raw).reduce((sum, value) => sum + value, 0);
  const capMs = workedHours * configured.maximumMinutesPerHour * 60_000;
  const totalMs = Math.min(rawTotal, capMs);
  const scale = rawTotal > 0 ? totalMs / rawTotal : 0;
  return { comfortMs: raw.comfortMs * scale, orderHandlingMs: raw.orderHandlingMs * scale, transitionsMs: raw.transitionsMs * scale, returnResetMs: raw.returnResetMs * scale, totalMs, capMs, workedHours, orders };
}

export type EfficiencyBand = "excellent" | "strong" | "developing" | "low" | "unavailable";

/**
 * A transparent coverage score for a shift. It measures how much paid time is
 * explained by timers plus the configured normal operational allowance; it is
 * not a driver-performance or speed score. Breaks are excluded from paid time.
 */
export function shiftEfficiencyScore(shift: Shift, settings: Settings, now = new Date()) {
  const paidMs = paidMilliseconds(shift, now);
  const tracked = trackedActivityTotals(shift, now);
  // Blocked time is not productive work, but it is explicitly accounted paid
  // time outside the worker's control. Keep it separate while avoiding an
  // unfair reduction in this coverage score.
  const trackedMs = tracked.deliveryMs + tracked.cleaningMs + tracked.preparationMs + tracked.otherTaskMs + tracked.blockedMs;
  const allowance = operationalAllowance(shift, settings, now);
  // An allowance can only explain genuinely unallocated time. This avoids it
  // ever double-counting a delivery or a timed store task.
  const allowanceAppliedMs = Math.min(tracked.untrackedPaidMs, allowance.totalMs);
  const coveredMs = Math.min(paidMs, trackedMs + allowanceAppliedMs);
  const score = paidMs > 0 ? Math.max(0, Math.min(100, Math.round((coveredMs / paidMs) * 100))) : null;
  const band: EfficiencyBand = score == null ? "unavailable" : score >= 90 ? "excellent" : score >= 75 ? "strong" : score >= 60 ? "developing" : "low";
  return { score, band, paidMs, trackedMs, allowanceMs: allowanceAppliedMs, unallocatedMs: Math.max(0, paidMs - coveredMs) };
}

/** A route score never rewards a quicker-than-expected journey above 100. */
export function routeEfficiencyScore(expectedSeconds?: number | null, actualSeconds?: number | null) {
  if (!Number.isFinite(expectedSeconds) || !Number.isFinite(actualSeconds) || !expectedSeconds || !actualSeconds || expectedSeconds <= 0 || actualSeconds <= 0) return null;
  const score = Math.max(0, Math.min(100, Math.round((expectedSeconds / actualSeconds) * 100)));
  const band: Exclude<EfficiencyBand, "unavailable"> = score >= 90 ? "excellent" : score >= 75 ? "strong" : score >= 60 ? "developing" : "low";
  return { score, band };
}

export function activeTimedActivity(shift: Shift): { kind: "delivery" | "cleaning" | "prep" | "break" | "other" | "blocked"; id: string; name: string; start: string } | null {
  const openDelivery = (shift.activities ?? []).findLast((item) => (item.type === "single_delivery" || item.type === "double_delivery") && !item.end);
  if (openDelivery) return { kind: "delivery", id: openDelivery.id, name: openDelivery.type === "single_delivery" ? "Single Delivery" : "Double Delivery", start: openDelivery.start };
  const activeTask = (shift.taskSnapshot ?? []).find((task) => task.status === "active");
  if (activeTask) return { kind: activeTask.category === "prep" ? "prep" : "cleaning", id: activeTask.id, name: activeTask.name, start: activeTask.segments.at(-1)?.start ?? shift.clockIn };
  const openBreak = shift.breaks.findLast((item) => !item.end);
  if (openBreak) return { kind: "break", id: openBreak.id, name: "Break", start: openBreak.start };
  const blocked = (shift.activities ?? []).findLast((item) => item.type === "blocked_time" && !item.end);
  if (blocked) return { kind: "blocked", id: blocked.id, name: blockedTimeReasonLabel(blocked.blockedReason ?? "other"), start: blocked.start };
  const other = (shift.activities ?? []).findLast((item) => item.type === "other_task" && !item.end);
  return other ? { kind: "other", id: other.id, name: other.taskName ?? "Other task", start: other.start } : null;
}

export function cleaningSummary(shift: Shift, now = new Date()) {
  const tasks = (shift.taskSnapshot ?? []).filter((task) => task.category !== "prep");
  const completed = tasks.filter((task) => task.status === "complete");
  const unavailable = tasks.filter((task) => Boolean(task.unableAt));
  const managementBlocked = tasks.filter((task) => Boolean(task.managementBlockedAt));
  const missed = tasks.filter((task) => task.status !== "complete" && !task.unableAt && !task.managementBlockedAt && !task.notRequired);
  const performanceEligible = tasks.filter((task) => !task.unableAt && !task.managementBlockedAt && !task.notRequired);
  const timed = completed.filter((task) => !task.quickCompleted && taskMilliseconds(task, now) > 0);
  return {
    required: shift.cleaningOverride ?? shift.cleaningRequired ?? (shift.role ? cleaningRequiredFor(shift.role, shift.clockIn) : false),
    total: tasks.length, completed: completed.length, unavailable: unavailable.length, managementBlocked: managementBlocked.length, missed: missed.length, performanceEligible: performanceEligible.length,
    trackedMs: tasks.reduce((sum, task) => sum + taskMilliseconds(task, now), 0),
    averageTrackedMs: timed.length ? timed.reduce((sum, task) => sum + taskMilliseconds(task, now), 0) / timed.length : 0,
  };
}

export function taskOutcomeSummary(shift: Shift) {
  const tasks = shift.taskSnapshot ?? [];
  const completed = tasks.filter((task) => task.status === "complete").length;
  const managementBlocked = tasks.filter((task) => task.status !== "complete" && Boolean(task.managementBlockedAt)).length;
  const unavailable = tasks.filter((task) => task.status !== "complete" && !task.managementBlockedAt && Boolean(task.unableAt)).length;
  const notRequired = tasks.filter((task) => task.status !== "complete" && !task.managementBlockedAt && !task.unableAt && Boolean(task.notRequired)).length;
  return { total: tasks.length, completed, managementBlocked, unavailable, notRequired, missed: Math.max(0, tasks.length - completed - managementBlocked - unavailable - notRequired) };
}

export function markRemainingTasksManagementBlocked(shift: Shift, at = new Date().toISOString(), batchId = makeId()) {
  if (!Number.isFinite(Date.parse(at))) throw new Error("Invalid management-blocked timestamp.");
  const applicable = (shift.taskSnapshot ?? []).filter(
    (task) => task.status !== "complete" && !task.unableAt && !task.notRequired && !task.managementBlockedAt,
  );
  // Check every active boundary before changing any task. A stale bulk event
  // therefore rejects atomically instead of leaving a partly changed draft.
  for (const task of applicable) {
    const segment = task.segments.findLast((item) => !item.end);
    if (segment && Date.parse(at) < Date.parse(segment.start))
      throw new Error("Management-blocked time is earlier than an active task start.");
  }
  let count = 0;
  for (const task of applicable) {
    const segment = task.segments.findLast((item) => !item.end);
    if (segment) {
      segment.end = at;
      const activity = shift.activities?.findLast((item) => (item.type === "cleaning_task" || item.type === "prep_task") && item.taskId === task.id && !item.end);
      if (activity) {
        activity.end = at;
        activity.segments = structuredClone(task.segments);
      }
    }
    task.status = task.segments.length ? "paused" : "not_started";
    task.completedAt = null;
    task.managementBlockedAt = at;
    task.managementBlockedBatchId = batchId;
    if (shift.pendingResumeTaskId === task.id) shift.pendingResumeTaskId = null;
    count += 1;
  }
  if (count) shift.updatedAt = at;
  return { count, batchId };
}

export function clearManagementBlockedTasks(shift: Shift) {
  let count = 0;
  for (const task of shift.taskSnapshot ?? []) {
    if (!task.managementBlockedAt || task.status === "complete") continue;
    task.managementBlockedAt = null;
    task.managementBlockedBatchId = null;
    count += 1;
  }
  return count;
}

export function breakMilliseconds(shift: Shift, now = new Date()): number {
  const cap = shift.clockOut ? new Date(shift.clockOut).getTime() : now.getTime();
  return shift.breaks.reduce((sum, item) => {
    const start = new Date(item.start).getTime();
    const end = item.end ? new Date(item.end).getTime() : cap;
    return sum + Math.max(0, Math.min(end, cap) - start);
  }, 0);
}

export function shiftMilliseconds(shift: Shift, now = new Date()): number {
  const end = shift.clockOut ? new Date(shift.clockOut).getTime() : now.getTime();
  return Math.max(0, end - new Date(shift.clockIn).getTime());
}

export function paidMilliseconds(shift: Shift, now = new Date()): number {
  return Math.max(0, shiftMilliseconds(shift, now) - breakMilliseconds(shift, now));
}

export function grossWagesPence(shift: Shift, now = new Date()): number {
  return Math.round((paidMilliseconds(shift, now) * shift.hourlyRatePence) / 3_600_000);
}

export function deliverySummary(shift: Shift) {
  const deliveries = shift.deliveries.filter((event) => !event.testOnly);
  const singles = deliveries.filter((event) => event.type === "single").length;
  const doubles = deliveries.filter((event) => event.type === "double").length;
  const derivedDeliveries = singles + doubles * 2;
  return {
    singles,
    doubles,
    runs: singles + doubles,
    individual: shift.manualDeliveryCount ?? derivedDeliveries,
    reimbursementPence: deliveries.reduce((sum, event) => sum + event.reimbursementPence, 0),
  };
}

export function isBetaShift(shift: Shift): boolean {
  const clockIn = Date.parse(shift.clockIn);
  return Number.isFinite(clockIn) && clockIn < Date.parse(LIVE_DATA_START_AT);
}

export function reportingShifts(data: AppData): Shift[] {
  return data.settings.includeBetaData === true ? data.shifts : data.shifts.filter((shift) => !isBetaShift(shift));
}

/** Beta cleaning records are a separate opt-in because early checklists were not consistently completed. */
export function cleaningReportingShifts(data: AppData): Shift[] {
  return data.settings.includeBetaData === true && data.settings.includeBetaCleaningData === true
    ? data.shifts
    : data.shifts.filter((shift) => !isBetaShift(shift));
}

const BETA_HUSTLE_MINIMUM_SAMPLE_COUNT = 5;
const BETA_HUSTLE_MINIMUM_DEVIATION_MS = 60_000;
const BETA_HUSTLE_OUTLIER_RATIO = 3;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function differsSharplyFromTypical(value: number, typical: number): boolean {
  if (Math.abs(value - typical) < BETA_HUSTLE_MINIMUM_DEVIATION_MS) return false;
  if (typical <= 0) return value >= BETA_HUSTLE_MINIMUM_DEVIATION_MS;
  return value >= typical * BETA_HUSTLE_OUTLIER_RATIO || value <= typical / BETA_HUSTLE_OUTLIER_RATIO;
}

/**
 * Identifies only beta delivery runs whose complete exit/return timing differs
 * sharply from the robust median pattern. At least five fully timed runs are
 * required, missing GPS is ignored and production runs are never flagged.
 */
export function questionableBetaHustleActivityIds(shifts: Shift[]): Set<string> {
  const timed = shifts.flatMap((shift) => (shift.activities ?? [])
    .filter((activity) => !activity.testOnly && Boolean(activity.end) && (activity.type === "single_delivery" || activity.type === "double_delivery"))
    .map((activity) => ({ shift, activity, timing: deliveryGeofenceDurations(activity) })))
    .filter(({ timing }) => timing.preDepartureMs != null && timing.returnDelayMs != null);
  if (timed.length < BETA_HUSTLE_MINIMUM_SAMPLE_COUNT) return new Set();
  const typicalExit = median(timed.map(({ timing }) => timing.preDepartureMs!));
  const typicalReturn = median(timed.map(({ timing }) => timing.returnDelayMs!));
  if (typicalExit == null || typicalReturn == null) return new Set();
  return new Set(timed.filter(({ shift, timing }) => isBetaShift(shift) && (
    differsSharplyFromTypical(timing.preDepartureMs!, typicalExit) || differsSharplyFromTypical(timing.returnDelayMs!, typicalReturn)
  )).map(({ activity }) => activity.id));
}

/** Keeps beta shifts and their non-Hustle facts while omitting flagged runs from Hustle analytics only. */
export function hustleAnalyticsShifts(shifts: Shift[], includeQuestionableBetaHustle = false): Shift[] {
  // Explicit owner exclusions apply independently of the beta-data preference.
  if (shifts.some((shift) => shift.activities?.some((activity) => activity.badDelivery))) {
    shifts = shifts.map((shift) => ({ ...shift, activities: (shift.activities ?? []).filter((activity) => !activity.badDelivery) }));
  }
  if (includeQuestionableBetaHustle) return shifts;
  const excludedIds = questionableBetaHustleActivityIds(shifts);
  if (!excludedIds.size) return shifts;
  return shifts.map((shift) => isBetaShift(shift)
    ? { ...shift, activities: (shift.activities ?? []).filter((activity) => !excludedIds.has(activity.id)) }
    : shift);
}

/** Shift set used only for locally averaged Hustle added to Expected Delivery Time. */
export function expectedDeliveryHustleShifts(data: AppData): Shift[] {
  return hustleAnalyticsShifts(reportingShifts(data), data.settings.includeQuestionableBetaHustle === true);
}

/** Reversible owner exclusion: never remove payment, timing, or route evidence. */
export function setBadDelivery(shift: Shift, activityId: string, excluded: boolean, updatedAt = new Date().toISOString()): boolean {
  const activity = shift.activities?.find((item) => item.id === activityId && (item.type === "single_delivery" || item.type === "double_delivery"));
  if (!activity || activity.testOnly) return false;
  if (activity.badDelivery === excluded) return true;
  activity.badDelivery = excluded;
  shift.updatedAt = updatedAt;
  return true;
}

/**
 * Permanently removes one completed delivery run and every record owned by it.
 * Shift-level facts such as hours, breaks, cleaning and manual work mileage are
 * deliberately left alone. A running delivery is never deletable here.
 */
export function deleteDeliveryRun(shift: Shift, activityId: string, updatedAt = new Date().toISOString()): boolean {
  const activity = (shift.activities ?? []).find((item) => item.id === activityId && (item.type === "single_delivery" || item.type === "double_delivery"));
  if (!activity?.end) return false;

  const event = shift.deliveries.find((item) => item.id === activity.deliveryEventId || item.activityId === activity.id);
  const deliveryEventId = activity.deliveryEventId ?? event?.id ?? null;
  shift.activities = (shift.activities ?? []).filter((item) => item.id !== activity.id && !(deliveryEventId && item.deliveryEventId === deliveryEventId));
  shift.deliveries = shift.deliveries.filter((item) => item.id !== deliveryEventId && item.activityId !== activity.id);

  if (!activity.testOnly && shift.manualDeliveryCount != null) {
    const removedCustomers = activity.customerDeliveries ?? (activity.type === "double_delivery" ? 2 : 1);
    shift.manualDeliveryCount = Math.max(0, shift.manualDeliveryCount - removedCustomers);
  }
  shift.updatedAt = updatedAt;
  return true;
}

/**
 * Keeps the real payment amount as historical fact while recalculating only
 * the expected amount and links affected by an explicitly deleted record.
 */
function reconcilePaymentAfterDeletion(data: AppData, paymentId: string | null) {
  if (!paymentId) return;
  const payment = data.payments.find((item) => item.id === paymentId);
  if (!payment) return;
  const shiftsById = new Map(data.shifts.map((shift) => [shift.id, shift]));
  payment.shiftIds = payment.shiftIds.filter((shiftId) => shiftsById.has(shiftId));
  if (!payment.shiftIds.length) {
    data.payments = data.payments.filter((item) => item.id !== payment.id);
    return;
  }
  payment.expectedAmountPence = payment.shiftIds.reduce((sum, shiftId) => sum + deliverySummary(shiftsById.get(shiftId)!).reimbursementPence, 0);
}

/** Recomputes only expected reimbursement for payments linked to one shift. */
export function reconcilePaymentsForShift(data: AppData, shiftId: string) {
  const shift = data.shifts.find((item) => item.id === shiftId);
  if (!shift) return;
  const paymentIds = new Set([shift.reimbursementPaymentId, ...data.payments.filter((payment) => payment.shiftIds.includes(shiftId)).map((payment) => payment.id)]);
  paymentIds.forEach((paymentId) => reconcilePaymentAfterDeletion(data, paymentId));
}

/** Replaces a corrected historical shift while preserving actual paid facts. */
export function replaceShiftWithIntegrity(data: AppData, updated: Shift): boolean {
  const index = data.shifts.findIndex((item) => item.id === updated.id);
  if (index < 0) return false;
  data.shifts[index] = structuredClone(updated);
  reconcilePaymentsForShift(data, updated.id);
  return true;
}

/**
 * Reopens a just-completed shift after an unexpected call-back. The saved
 * clock-out becomes the start of a closed unpaid break and the restart time
 * becomes its end, so one continuous shift remains auditable without paying
 * the gap or creating a duplicate rota/payroll record.
 */
export function restartCompletedShift(shift: Shift, restartedAt = new Date().toISOString()): { ok: true; breakId: string } | { ok: false; message: string } {
  if (shift.status !== "completed" || !shift.clockOut) return { ok: false, message: "Only a completed shift can be restarted." };
  const clockOutMs = Date.parse(shift.clockOut);
  const restartMs = Date.parse(restartedAt);
  if (!Number.isFinite(clockOutMs) || !Number.isFinite(restartMs) || restartMs <= clockOutMs) return { ok: false, message: "The restart time must be later than the saved clock-out." };
  if ((shift.activities ?? []).some((activity) => activity.end == null) || shift.breaks.some((item) => item.end == null) || (shift.taskSnapshot ?? []).some((task) => task.segments.some((segment) => segment.end == null))) return { ok: false, message: "This shift still contains unfinished timed activity." };

  const previousClockOut = shift.clockOut;
  const breakId = makeId();
  shift.breaks.push({ id: breakId, start: previousClockOut, end: restartedAt });
  shift.activities ??= [];
  shift.activities = shift.activities.filter((activity) => !(activity.type === "clock_out" && activity.start === previousClockOut));
  shift.activities.push({ id: makeId(), shiftId: shift.id, type: "break", start: previousClockOut, end: restartedAt, tracked: false, notes: "Called back after clock-out" });
  shift.status = "working";
  shift.clockOut = null;
  shift.noBreakRecord = null;
  shift.reviewStatus = "complete";
  shift.pendingResumeTaskId = null;
  shift.pendingResumeBlockedTime = null;
  shift.pendingEarlyDispatch = null;
  shift.queuedEarlyDispatch = null;
  shift.pendingCarryoutDepartureAt = null;
  shift.updatedAt = restartedAt;
  return { ok: true, breakId };
}

/** Keep non-duration timeline markers on the exact edited shift boundaries. */
export function alignShiftBoundaryActivities(shift: Shift) {
  for (const activity of shift.activities ?? []) {
    const boundary = activity.type === "clock_in" ? shift.clockIn : activity.type === "clock_out" ? shift.clockOut : null;
    if (!boundary) continue;
    activity.start = boundary;
    activity.end = boundary;
  }
  return shift;
}

/** Creates the editable History copy without discarding recorded seconds. */
export function prepareShiftHistoryDraft(shift: Shift) {
  const draft = structuredClone(shift);
  alignShiftBoundaryActivities(draft);
  return draft;
}

/**
 * Changes a historical run count without leaving delivery/GPS evidence behind.
 * Reductions remove the newest matching runs through the canonical deletion
 * helper; increases retain the legacy manual-event behaviour.
 */
export function setDeliveryRunCountWithIntegrity(shift: Shift, type: "single" | "double", count: number, updatedAt = new Date().toISOString()): { ok: true } | { ok: false; message: string } {
  const safe = Math.max(0, Math.floor(count || 0));
  const normal = shift.deliveries.filter((event) => !event.testOnly && event.type === type);
  if (safe < normal.length) {
    const removing = normal.slice(safe).reverse();
    for (const event of removing) {
      const activity = (shift.activities ?? []).find((item) => item.id === event.activityId || item.deliveryEventId === event.id);
      if (activity) {
        if (!activity.end) return { ok: false, message: "A running delivery cannot be removed from History." };
        if (!deleteDeliveryRun(shift, activity.id, updatedAt)) return { ok: false, message: "The linked delivery evidence could not be removed safely." };
      } else {
        shift.deliveries = shift.deliveries.filter((item) => item.id !== event.id);
      }
    }
  } else {
    while (shift.deliveries.filter((event) => !event.testOnly && event.type === type).length < safe) {
      shift.deliveries.push({ id: makeId(), type, timestamp: shift.clockOut ?? shift.clockIn, reimbursementPence: type === "single" ? shift.singleRatePence : shift.doubleRatePence });
    }
  }
  shift.deliveries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  shift.updatedAt = updatedAt;
  return { ok: true };
}

/** Transaction-safe app-level wrapper used by deletion screens. */
export function deleteDeliveryRunFromData(data: AppData, shiftId: string, activityId: string, updatedAt = new Date().toISOString()): boolean {
  const shift = data.shifts.find((item) => item.id === shiftId);
  if (!shift) return false;
  const paymentIds = new Set([shift.reimbursementPaymentId, ...data.payments.filter((payment) => payment.shiftIds.includes(shiftId)).map((payment) => payment.id)]);
  if (!deleteDeliveryRun(shift, activityId, updatedAt)) return false;
  paymentIds.forEach((paymentId) => reconcilePaymentAfterDeletion(data, paymentId));
  return true;
}

/** Removes a shift and repairs its direct payment and rota relationships. */
export function deleteShiftWithIntegrity(data: AppData, shiftId: string): boolean {
  const shift = data.shifts.find((item) => item.id === shiftId);
  if (!shift) return false;
  const paymentIds = new Set([shift.reimbursementPaymentId, ...data.payments.filter((payment) => payment.shiftIds.includes(shiftId)).map((payment) => payment.id)]);
  data.shifts = data.shifts.filter((item) => item.id !== shiftId);
  for (const entry of (data.rotaWeeks ?? []).flatMap((week) => week.entries)) {
    if (entry.linkedShiftId === shiftId) {
      entry.linkedShiftId = null;
      entry.updatedAt = new Date().toISOString();
    }
  }
  paymentIds.forEach((paymentId) => reconcilePaymentAfterDeletion(data, paymentId));
  return true;
}

/** Stores a production provider retraction alongside the normal shift delete.
 * A later native replay is safe because James OS keys the tombstone by shift
 * ID/event ID and treats it idempotently. We intentionally retain tombstones:
 * deleting a shift while James OS is unavailable must not lose the deletion. */
export function queueJamesOsShiftRetraction(data: AppData, value: JamesOsShiftRetraction): boolean {
  const shiftId = value.shiftId.trim();
  if (!shiftId || shiftId.length > 128 || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 1_000_000 || !Number.isFinite(value.retractedAtEpochMs) || value.retractedAtEpochMs <= 0) return false;
  const next = { shiftId, revision: value.revision, retractedAtEpochMs: Math.floor(value.retractedAtEpochMs) };
  const existing = data.settings.jamesOsShiftRetractions ?? [];
  const old = existing.find((item) => item.shiftId === shiftId);
  if (old && old.revision > next.revision) return true;
  data.settings.jamesOsShiftRetractions = [...existing.filter((item) => item.shiftId !== shiftId), next];
  return true;
}

export function workMilesTenths(shift: Shift): number | null {
  const mileage = shift.mileage;
  if (mileage.method === "direct") return mileage.directTenths;
  if (mileage.startTenths == null || mileage.endTenths == null || mileage.endTenths < mileage.startTenths) return null;
  return mileage.endTenths - mileage.startTenths;
}

/** Delivery-only GPS distance, rounded to the same tenths used by manual mileage entry. */
export function gpsRouteMilesTenths(shift: Shift, includeExcluded = false): number | null {
  const metres = (shift.activities ?? []).filter((activity) => (activity.type === "single_delivery" || activity.type === "double_delivery") && !activity.testOnly && (includeExcluded || !activity.badDelivery) && activity.travelMode !== "walking").reduce((sum, activity) => sum + Math.max(0, activity.routeEvidence?.distanceMetres ?? 0), 0);
  return metres >= 80 ? Math.round(metres / 160.9344) : null;
}

function inferredLiveMileageGpsBaselineTenths(shift: Shift): number {
  const gpsTotal = gpsRouteMilesTenths(shift, true) ?? 0;
  const openDeliveryMetres = (shift.activities ?? [])
    .filter(
      (activity) =>
        !activity.end &&
        (activity.type === "single_delivery" ||
          activity.type === "double_delivery") &&
        !activity.testOnly &&
        activity.travelMode !== "walking",
    )
    .reduce(
      (sum, activity) =>
        sum + Math.max(0, activity.routeEvidence?.distanceMetres ?? 0),
      0,
    );
  const openDeliveryTenths =
    openDeliveryMetres >= 80
      ? Math.round(openDeliveryMetres / 160.9344)
      : 0;
  return Math.max(0, gpsTotal - openDeliveryTenths);
}

/**
 * Work mileage for an active shift, including GPS distance recorded since the
 * last manual total or odometer reading. Completed shifts remain canonical.
 */
export function liveWorkMilesTenths(shift: Shift): number | null {
  const recorded = workMilesTenths(shift);
  if (recorded == null || shift.status === "completed") return recorded;
  const baseline = shift.mileage.gpsBaselineTenths;
  if (baseline == null) return recorded;
  // Baselines remain in the original cumulative GPS coordinate system. A bad
  // historical run must not consume later good miles, nor add new excluded miles.
  let metres = 0;
  let includedTenths = 0;
  const runs = (shift.activities ?? []).filter((activity) => !activity.testOnly && activity.travelMode !== "walking" && (activity.type === "single_delivery" || activity.type === "double_delivery"))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const activity of runs) {
    const before = Math.round(metres / 160.9344);
    metres += Math.max(0, activity.routeEvidence?.distanceMetres ?? 0);
    const after = Math.round(metres / 160.9344);
    if (!activity.badDelivery) includedTenths += Math.max(0, after - Math.max(before, baseline));
  }
  return recorded + includedTenths;
}

export function shiftNeedsReview(shift: Shift): boolean {
  if (shift.manualEntry?.reason === "payslip_reconciliation") return false;
  if (shift.status !== "completed") return false;
  if (shift.breaks.length > 0 || shiftMilliseconds(shift) < BREAK_REQUIRED_MS) return false;
  if (shift.reviewStatus === "incomplete") return true;
  return !shift.noBreakRecord?.reason?.trim();
}

/** A completed shift needs task review while any applicable task has no final outcome. */
export function shiftTaskReviewNeeded(shift: Shift): boolean {
  if (shift.manualEntry?.reason === "payslip_reconciliation") return false;
  if (shift.status !== "completed") return false;
  return (shift.taskSnapshot ?? []).some((task) => {
    if (task.status === "complete" || task.unableAt || task.notRequired || task.managementBlockedAt) return false;
    return task.category === "prep" || shift.cleaningRequired !== false;
  });
}

export function needsBreakReviewPrompt(shift: Shift, now = new Date()): boolean {
  const duration = shiftMilliseconds(shift, now);
  return shift.breaks.length === 0 && duration >= BREAK_REQUIRED_MS - BREAK_REVIEW_LEEWAY_MS && duration < BREAK_REQUIRED_MS;
}

export function deliveriesPerHour(shift: Shift, now = new Date()): number {
  const hours = paidMilliseconds(shift, now) / 3_600_000;
  return hours > 0 ? deliverySummary(shift).individual / hours : 0;
}

export function formatMoney(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export function formatDuration(ms: number, compact = false): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (compact) return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/** Precise short format for geofence and turnaround timings. */
export function formatTimingDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m${seconds ? ` ${seconds}s` : ""}`;
  return `${seconds}s`;
}

export function formatLiveDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const toTenths = (value: string): number | null => {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 10) : null;
};

export const tenthsDisplay = (value: number | null) => value == null ? "" : (value / 10).toFixed(1);

export function normalizeMileageText(raw: string): string | null {
  const value = raw.replace(",", ".");
  return /^\d*(?:\.\d{0,1})?$/.test(value) ? value : null;
}

/** Converts an editable pounds-per-litre draft into tenths of a penny. */
export function parsePetrolPricePerLitreDraft(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!value || !/^\d+(?:\.\d{0,3})?$/.test(value)) return null;
  const pounds = Number(value);
  return Number.isFinite(pounds) && pounds >= 0
    ? Math.round(pounds * 1000) / 10
    : null;
}

export function nextPaymentDate(paymentDay: number, from = new Date()): Date {
  const result = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const delta = (paymentDay - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + delta);
  return result;
}

export function reimbursementPaymentDate(shiftDate: string | Date, paymentDay: number): Date {
  const source = new Date(shiftDate);
  const result = new Date(source.getFullYear(), source.getMonth(), source.getDate(), 12);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  const paymentOffsetFromMonday = (paymentDay + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday + 7 + paymentOffsetFromMonday);
  return result;
}

export const DELIVERY_COOLDOWN_MS = 10_000;

export function deliveryCooldownRemaining(shift: Shift, now = new Date()): number {
  const last = shift.deliveries.at(-1);
  if (!last) return 0;
  return Math.max(0, DELIVERY_COOLDOWN_MS - (now.getTime() - new Date(last.timestamp).getTime()));
}

export function validateData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  if (data.version !== 1 || !data.settings || !Array.isArray(data.shifts) || !Array.isArray(data.payments)) return false;
  return data.shifts.every((shift) => typeof shift?.id === "string" && !Number.isNaN(Date.parse(shift.clockIn)) && Array.isArray(shift.breaks) && Array.isArray(shift.deliveries));
}

export function periodTotals(shifts: Shift[], start: Date, end: Date, cleaningShifts: Shift[] = shifts) {
  const included = shifts.filter((shift) => shift.status === "completed" && new Date(shift.clockIn) >= start && new Date(shift.clockIn) < end);
  const cleaningShiftIds = new Set(cleaningShifts.map((shift) => shift.id));
  return included.reduce((acc, shift) => {
    const delivery = deliverySummary(shift);
    acc.paidMs += paidMilliseconds(shift);
    acc.wagesPence += grossWagesPence(shift);
    acc.deliveries += delivery.individual;
    acc.runs += delivery.runs;
    acc.singles += delivery.singles;
    acc.doubles += delivery.doubles;
    acc.reimbursementPence += delivery.reimbursementPence;
    acc.milesTenths += workMilesTenths(shift) ?? 0;
    const tracked = trackedActivityTotals(shift);
    const cleaning = cleaningSummary(shift);
    const timedTrips = (shift.activities ?? []).filter((item) => !item.testOnly && !item.badDelivery && (item.type === "single_delivery" || item.type === "double_delivery") && item.end).length;
    acc.trackedDeliveryMs += tracked.deliveryMs;
    acc.timedTrips += timedTrips;
    if (cleaning.required && cleaningShiftIds.has(shift.id)) {
      acc.cleaningEligibleShifts += 1;
      acc.cleaningTasks += cleaning.completed;
      // Management-blocked work was available but prevented. It is reported
      // separately and must not reduce the worker's completion performance.
      acc.cleaningExpected += cleaning.performanceEligible;
      acc.trackedCleaningMs += cleaning.trackedMs;
    }
    if (shift.manualEntry?.reason !== "payslip_reconciliation") acc.shifts += 1;
    return acc;
  }, { shifts: 0, paidMs: 0, wagesPence: 0, deliveries: 0, runs: 0, singles: 0, doubles: 0, reimbursementPence: 0, milesTenths: 0, trackedDeliveryMs: 0, timedTrips: 0, cleaningTasks: 0, cleaningExpected: 0, trackedCleaningMs: 0, cleaningEligibleShifts: 0 });
}
