"use client";
/* eslint-disable react/no-unescaped-entities */
import { useEffect, useRef, useState } from "react";
import { ActivityRecord, CustomerWaitExplanation, CustomerWaitReason, DEFAULT_SETTINGS, DEFAULT_STORE_DISPLAY_LOCATION, DeliveryRoutePoint, HustleSource, LocalRoadFeature, OSMRoadFeatureSettings, RouteEventClassification, Settings, formatTimingDuration, routeEfficiencyScore, activityGeofenceEvidence, analyseDeliveryRoute, analyseRouteMovement, classifyTrafficLightStops, customerStopDurationMs, detectSignalQueues, deliveryGeofenceDurations, distanceMetres, dominosGeofenceDefinitionForActivity, manualDeliveredCustomerTimings, mergeTrafficSignals, nearestRoutePointToTimestamp, normaliseDeliveryRoutePoints, resolveCustomerLocation, TrafficSignal } from "@/lib/domain";
import { getRoadContextForCorridor, type OSMRoadFeature } from "@/lib/osmRoadIntelligenceService";
import { expectedRouteRetryState } from "@/lib/expectedRouteRetry";

function storePresenceProofEnabled(activity: ActivityRecord) {
  const proof = activity.storePresenceProof;
  return proof
    ? (proof.changes.at(-1)?.enabled ?? proof.enabledAtStart)
    : false;
}

const CUSTOMER_WAIT_REVIEW_MS = 3 * 60_000;

const resolvedOSMRoadFeatureSettings = (
  value?: Partial<OSMRoadFeatureSettings>,
): OSMRoadFeatureSettings => ({
  ...DEFAULT_SETTINGS.osmRoadFeatureSettings!,
  ...(value ?? {}),
});

const CUSTOMER_WAIT_REASONS: Array<{
  value: CustomerWaitReason;
  label: string;
}> = [
  { value: "no_answer_door", label: "No answer at the door" },
  { value: "no_answer_phone", label: "Called customer / no answer by phone" },
  { value: "slow_to_answer", label: "Took a long time to answer the door" },
  { value: "customer_not_ready", label: "Customer was not ready" },
  { value: "payment_or_collection", label: "Payment or collection issue" },
  { value: "other", label: "Other customer wait" },
];

const customerWaitReasonLabel = (reason: CustomerWaitReason) =>
  CUSTOMER_WAIT_REASONS.find((item) => item.value === reason)?.label ??
  "Other customer wait";

type WeeklyHustleAllowance = {
  leaveMs: number | null;
  returnMs: number | null;
  leaveSamples: number;
  returnSamples: number;
};

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function routeMiles(metres: number) {
  return `${(Math.max(0, metres) / 1609.344).toFixed(2)} mi`;
}

async function loadRoadContext(
  points: DeliveryRoutePoint[],
  featureSettings?: OSMRoadFeatureSettings,
) {
  // The evidence view analyses the complete saved route, not the visible map
  // viewport. A 200m corridor catches junction-centre features and queued
  // approaches without sending customer/address data anywhere.
  return getRoadContextForCorridor({
    points,
    paddingMetres: 200,
    featureSettings: resolvedOSMRoadFeatureSettings(featureSettings),
  });
}

const CARTO_VOYAGER_TILE_URL =
  "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_2wzk_1_fc6cae3b063d2c4f794ae4a8";

const CARTO_VOYAGER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function addOpenStreetMapTiles(
  L: typeof import("leaflet"),
  map: import("leaflet").Map,
  onStatus?: (status: "loading" | "ready" | "failed") => void,
) {
  const sources = [
    {
      url: CARTO_VOYAGER_TILE_URL,
      attribution: CARTO_VOYAGER_ATTRIBUTION,
    },
    {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    {
      url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  ];
  let sourceIndex = 0;
  let layer: import("leaflet").TileLayer | null = null;
  let timer: number | null = null;
  let loaded = false;

  const clearTimer = () => {
    if (timer != null) window.clearTimeout(timer);
    timer = null;
  };
  const addSource = () => {
    clearTimer();
    onStatus?.("loading");
    if (layer) layer.removeFrom(map);
    const source = sources[sourceIndex];
    const next = L.tileLayer(source.url, {
      attribution: source.attribution,
      maxZoom: 19,
    });
    layer = next;
    const markLoaded = () => {
      loaded = true;
      clearTimer();
      onStatus?.("ready");
      next.off("tileload", markLoaded);
      next.off("tileerror", handleError);
    };
    const handleError = () => {
      if (loaded) return;
      next.off("tileload", markLoaded);
      next.off("tileerror", handleError);
      if (sourceIndex < sources.length - 1) {
        sourceIndex += 1;
        addSource();
      } else onStatus?.("failed");
    };
    next.on("tileload", markLoaded);
    next.on("tileerror", handleError);
    next.addTo(map);
    // Some Android WebViews fail silently, so do not wait forever for a
    // tileerror event before trying the next source.
    timer = window.setTimeout(handleError, 5_000);
  };

  addSource();
  return () => {
    clearTimer();
    if (layer) layer.removeFrom(map);
  };
}

function signalSourceLabel(signal?: TrafficSignal) {
  return signal?.source === "USER_CONFIRMED_LOCAL"
    ? "LOCAL CONFIRMATION"
    : signal?.source === "OSM"
      ? "OpenStreetMap"
      : "GPS-derived";
}

function roadFeatureLabel(feature: OSMRoadFeature) {
  return (
    {
      TRAFFIC_SIGNAL: "TRAFFIC SIGNAL",
      STOP_SIGN: "STOP SIGN",
      GIVE_WAY: "GIVE-WAY",
      PEDESTRIAN_CROSSING: "PEDESTRIAN CROSSING",
      TRAFFIC_CALMING: "TRAFFIC CALMING",
      ROUNDABOUT: "ROUNDABOUT",
      ROAD: "ROAD",
      TURN_RESTRICTION: "TURN RESTRICTION",
      ACCESS_RESTRICTION: "ACCESS RESTRICTION",
    } as Record<OSMRoadFeature["featureType"], string>
  )[feature.featureType];
}

function roadFeatureIcon(feature: OSMRoadFeature) {
  return (
    {
      TRAFFIC_SIGNAL: "🚦",
      STOP_SIGN: "🛑",
      GIVE_WAY: "⚠",
      PEDESTRIAN_CROSSING: "🚸",
      TRAFFIC_CALMING: "🐢",
      ROUNDABOUT: "⟳",
      ROAD: "•",
      TURN_RESTRICTION: "↪",
      ACCESS_RESTRICTION: "⛔",
    } as Record<OSMRoadFeature["featureType"], string>
  )[feature.featureType];
}

function escapePopupText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

export default function RouteMapModal({
  activity,
  weeklyHustleSources,
  initialHustleSource = "real",
  storeDisplayLocation,
  showPointsDefault,
  trafficRules,
  localRoadFeatures = [],
  signalQueueLookAheadMetres,
  osmRoadIntelligenceEnabled = true,
  osmRoadFeatureSettings,
  live = false,
  isNativeShell = false,
  googleRoutesConfigured = false,
  simplified = false,
  onSetCustomerPoint,
  onSetRoutePointContext,
  onClassifyRouteEvent,
  onAddLocalRoadFeature,
  onReanalyseHistoricalRoutes,
  onEditCustomerWait,
  onRecheckInternet,
  onRequestRouteRefresh,
  onClose,
}: {
  activity: ActivityRecord;
  weeklyHustleSources?: Record<HustleSource, WeeklyHustleAllowance>;
  initialHustleSource?: HustleSource;
  storeDisplayLocation?: { latitude: number; longitude: number; label: string };
  showPointsDefault: boolean;
  trafficRules?: Settings["trafficClassification"];
  localRoadFeatures?: LocalRoadFeature[];
  signalQueueLookAheadMetres?: number;
  osmRoadIntelligenceEnabled?: boolean;
  osmRoadFeatureSettings?: OSMRoadFeatureSettings;
  live?: boolean;
  isNativeShell?: boolean;
  googleRoutesConfigured?: boolean;
  /** Used by payment verification: show the actual route without developer-only analysis. */
  simplified?: boolean;
  onSetCustomerPoint?: (activityId: string, pointIndex: number) => void;
  onSetRoutePointContext?: (
    activityId: string,
    pointIndex: number,
    context: "customer_house" | "traffic_light" | "road_delay" | "waiting",
  ) => void;
  onClassifyRouteEvent?: (
    activityId: string,
    pointIndex: number,
    classification: RouteEventClassification,
  ) => void;
  onAddLocalRoadFeature?: (
    feature: Omit<LocalRoadFeature, "id" | "source" | "createdAt"> & {
      createdAt?: string;
    },
  ) => LocalRoadFeature;
  onReanalyseHistoricalRoutes?: () => void;
  onEditCustomerWait?: (
    activity: ActivityRecord,
    onSaved?: (value: CustomerWaitExplanation) => void,
  ) => void;
  onRecheckInternet?: (activityId: string) => void;
  onRequestRouteRefresh?: (activityId: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const onSetCustomerPointRef = useRef(onSetCustomerPoint);
  const onSetRoutePointContextRef = useRef(onSetRoutePointContext);
  const onClassifyRouteEventRef = useRef(onClassifyRouteEvent);
  const onAddLocalRoadFeatureRef = useRef(onAddLocalRoadFeature);
  const onReanalyseHistoricalRoutesRef = useRef(onReanalyseHistoricalRoutes);
  useEffect(() => {
    onSetCustomerPointRef.current = onSetCustomerPoint;
  }, [onSetCustomerPoint]);
  useEffect(() => {
    onSetRoutePointContextRef.current = onSetRoutePointContext;
  }, [onSetRoutePointContext]);
  useEffect(() => {
    onClassifyRouteEventRef.current = onClassifyRouteEvent;
  }, [onClassifyRouteEvent]);
  useEffect(() => {
    onAddLocalRoadFeatureRef.current = onAddLocalRoadFeature;
  }, [onAddLocalRoadFeature]);
  useEffect(() => {
    onReanalyseHistoricalRoutesRef.current = onReanalyseHistoricalRoutes;
  }, [onReanalyseHistoricalRoutes]);
  const boundsRef = useRef<[number, number][]>([]);
  const [showPoints, setShowPoints] = useState(showPointsDefault);
  const [showSameRoad, setShowSameRoad] = useState(false);
  const [showRoadContext, setShowRoadContext] = useState(false);
  const [includeWeeklyHustle, setIncludeWeeklyHustle] = useState(true);
  const [hustleSource, setHustleSource] =
    useState<HustleSource>(initialHustleSource);
  const weeklyHustle = weeklyHustleSources?.[hustleSource];
  const [trafficSignals, setTrafficSignals] = useState<TrafficSignal[]>([]);
  const [roadFeatures, setRoadFeatures] = useState<OSMRoadFeature[]>([]);
  const featureSettings = resolvedOSMRoadFeatureSettings(
    osmRoadFeatureSettings,
  );
  const featureSettingsKey = Object.entries(featureSettings)
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
  const [reanalysisNonce, setReanalysisNonce] = useState(0);
  useEffect(() => {
    const refresh = () => setReanalysisNonce((current) => current + 1);
    window.addEventListener("shift-tracker-osm-reanalyse", refresh);
    return () =>
      window.removeEventListener("shift-tracker-osm-reanalyse", refresh);
  }, []);
  const [osmStatus, setOsmStatus] = useState<
    "idle" | "loading" | "ready" | "stale" | "unavailable" | "disabled"
  >("idle");
  const [selectedRoadEvent, setSelectedRoadEvent] = useState<{
    pointIndex: number;
    latitude: number;
    longitude: number;
    startAt: string;
    endAt: string;
    durationMs: number;
  } | null>(null);
  // Keep the event being corrected while the classifier is temporarily
  // closed so the map can receive a real Leaflet click for PICK SIGNAL ON
  // MAP. Without this hand-off the modal backdrop swallowed the map click.
  const [pendingLocalSignalEvent, setPendingLocalSignalEvent] = useState<{
    pointIndex: number;
    latitude: number;
    longitude: number;
    startAt: string;
    endAt: string;
    durationMs: number;
  } | null>(null);
  const [localSignalDraft, setLocalSignalDraft] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [pickingLocalSignal, setPickingLocalSignal] = useState(false);
  const [flowView, setFlowView] = useState<"time" | "distance">("time");
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  // Route evidence evolved over a number of app versions.  Normalise each
  // optional collection here before either the map or the derived analytics
  // consume it, so a legacy/incomplete record can never take down the view.
  const sourceRoute = activity.routeEvidence!;
  const route = {
    ...sourceRoute,
    points: normaliseDeliveryRoutePoints(sourceRoute.points),
    gaps: Array.isArray(sourceRoute.gaps) ? sourceRoute.gaps : [],
    stops: Array.isArray(sourceRoute.stops) ? sourceRoute.stops : [],
    issues: Array.isArray(sourceRoute.issues) ? sourceRoute.issues : [],
    distanceMetres: Number.isFinite(sourceRoute.distanceMetres)
      ? sourceRoute.distanceMetres
      : 0,
    recordedPointCount: Number.isFinite(sourceRoute.recordedPointCount)
      ? sourceRoute.recordedPointCount
      : Array.isArray(sourceRoute.points)
        ? sourceRoute.points.length
        : 0,
  };
  const routeActivity = { ...activity, routeEvidence: route } as ActivityRecord;
  const points = route.points;
  const routeGaps = route.gaps;
  const latestPoint = points.at(-1) ?? null;
  const storeExitMapPoint = nearestRoutePointToTimestamp(
    points,
    activity.storeExitAt,
  );
  const storeEntryMapPoint = nearestRoutePointToTimestamp(
    points,
    activity.storeEntryAt,
  );
  const backAtStoreMapPoint = nearestRoutePointToTimestamp(
    points,
    activity.backAtStoreAt ?? activity.end,
  );
  const isLive = live || (!activity.end && route.status === "recording");
  const routeStops = route.stops;
  const safeTime = (value: unknown, fallback = "Not recorded") => {
    const date = new Date(
      typeof value === "string" || typeof value === "number" ? value : "",
    );
    return Number.isFinite(date.getTime()) ? timeFormat.format(date) : fallback;
  };
  const analysis = analyseDeliveryRoute(routeActivity);
  const realJourneyTiming = deliveryGeofenceDurations(routeActivity, "real");
  const selectedJourneyTiming = deliveryGeofenceDurations(
    routeActivity,
    hustleSource,
  );
  const realEvidence = activityGeofenceEvidence(routeActivity, "real");
  const dominosEvidence = activityGeofenceEvidence(routeActivity, "dominos");
  const selectedGeofenceEvidence =
    hustleSource === "real" ? realEvidence : dominosEvidence;
  const journeyTiming = {
    ...selectedJourneyTiming,
    evidence: selectedGeofenceEvidence,
  };
  const movementRules = {
    ...DEFAULT_SETTINGS.trafficClassification!,
    ...(trafficRules ?? {}),
    signalQueueLookAheadMetres:
      signalQueueLookAheadMetres ??
      trafficRules?.signalQueueLookAheadMetres ??
      DEFAULT_SETTINGS.signalQueueLookAheadMetres,
  };
  const movement = analyseRouteMovement(routeActivity, movementRules);
  const signalQueues = detectSignalQueues(
    routeActivity,
    trafficSignals,
    { lookAheadMetres: movementRules.signalQueueLookAheadMetres },
    movementRules,
  );
  const trafficLightStops = classifyTrafficLightStops(
    routeActivity,
    trafficSignals,
    80,
    movementRules,
  ).filter(
    (stop) =>
      stop.confidence !== "low" &&
      !signalQueues.some(
        (queue) =>
          stop.startIndex >= queue.startIndex &&
          stop.startIndex < queue.endIndex,
      ),
  );
  const movementKey = movement.segments
    .map(
      (segment) =>
        `${segment.startIndex}-${segment.endIndex}-${segment.classification}`,
    )
    .join("|");
  const queueKey = signalQueues
    .map((queue) => `${queue.signalId}-${queue.startIndex}-${queue.endIndex}`)
    .join("|");
  const customerTimings = manualDeliveredCustomerTimings(routeActivity);
  const customerTimingKey = customerTimings
    .map(
      (timing) =>
        `${timing.customerIndex}-${timing.timestamp}-${timing.pointIndex ?? ""}`,
    )
    .join("|");
  const customer = analysis?.customer ?? resolveCustomerLocation(routeActivity);
  const expected = activity.expectedRoute;
  const storeLatitude = activity.geofenceLatitude ?? points[0]?.latitude;
  const storeLongitude = activity.geofenceLongitude ?? points[0]?.longitude;
  const statsRadius = activity.geofenceRadius ?? 35;
  const dominosGeofence = dominosGeofenceDefinitionForActivity(activity);
  const physicalStore = storeDisplayLocation ?? DEFAULT_STORE_DISPLAY_LOCATION;
  const furthest = points.reduce<DeliveryRoutePoint | null>((best, point) => {
    if (storeLatitude == null || storeLongitude == null) return best ?? point;
    if (!best) return point;
    return distanceMetres(
      point.latitude,
      point.longitude,
      storeLatitude,
      storeLongitude,
    ) >
      distanceMetres(
        best.latitude,
        best.longitude,
        storeLatitude,
        storeLongitude,
      )
      ? point
      : best;
  }, null);
  const customerPoint = analysis?.turnaround ?? furthest;
  // Used by both the Leaflet layer and the React evidence list. Keeping it
  // outside the map effect prevents the list from referencing an effect-local
  // value when a route contains stationary samples.
  const customerRadius = Math.max(85, (customer?.accuracy ?? 0) + 45);
  const routePointContext = (pointIndex: number) =>
    activity.routePointContexts?.find((item) => item.pointIndex === pointIndex)
      ?.context;
  const routeEventClassification = (pointIndex: number) =>
    activity.routeEventClassifications?.find(
      (item) => item.pointIndex === pointIndex,
    )?.classification;
  const routeContextKey = (activity.routePointContexts ?? [])
    .map((item) => `${item.pointIndex}:${item.context}:${item.setAt}`)
    .join("|");
  const routeEventKey = (activity.routeEventClassifications ?? [])
    .map((item) => `${item.pointIndex}:${item.classification}:${item.setAt}`)
    .join("|");
  const localFeatureKey = localRoadFeatures
    .map(
      (feature) =>
        `${feature.id}:${feature.latitude}:${feature.longitude}:${feature.featureType}`,
    )
    .join("|");
  const routePointKey = points
    .map(
      (point) =>
        `${point.timestamp}:${point.latitude}:${point.longitude}:${point.accuracy}`,
    )
    .join("|");
  const signalKey = trafficSignals
    .map(
      (signal) =>
        `${signal.id}:${signal.latitude}:${signal.longitude}:${signal.source ?? "OSM"}`,
    )
    .join("|");
  const roadFeatureKey = roadFeatures
    .map(
      (feature) =>
        `${feature.id}:${feature.latitude}:${feature.longitude}:${feature.featureType}:${feature.maxspeedRaw ?? ""}:${feature.oneway ? "1" : "0"}`,
    )
    .join("|");
  // Some legacy/live route records contain points but no movement buckets.
  // Keep the evidence modal render-safe for those records.
  const movementTotal = (key: keyof typeof movement.totals) =>
    movement.totals[key] ?? { ms: 0, metres: 0 };
  // A stop at the customer/turnaround point is never a road-delay marker.
  const roadStops = routeStops.filter(
    (stop) =>
      !customerPoint ||
      distanceMetres(
        stop.latitude,
        stop.longitude,
        customerPoint.latitude,
        customerPoint.longitude,
      ) > 85,
  );
  const fitRoute = () => {
    if (!mapRef.current || !boundsRef.current.length) return;
    mapRef.current.fitBounds(boundsRef.current, {
      padding: [28, 28],
      maxZoom: 17,
    });
  };

  useEffect(() => {
    let effectActive = true;
    if (!osmRoadIntelligenceEnabled) {
      // Synchronise the external OSM source state immediately when disabled.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOsmStatus("disabled");
      setTrafficSignals(mergeTrafficSignals([], localRoadFeatures));
      setRoadFeatures([]);
      return () => {
        effectActive = false;
      };
    }
    setOsmStatus("loading");
    // This effect is keyed by the complete recorded route, never by Leaflet
    // viewport movement. The route corridor is fetched/cached once here.
    void loadRoadContext(points, featureSettings)
      .then((context) => {
        if (effectActive) {
          setTrafficSignals(
            mergeTrafficSignals(context.signals, localRoadFeatures),
          );
          setRoadFeatures(context.features);
          setOsmStatus(context.availability);
        }
      })
      .catch(() => {
        if (effectActive) {
          setTrafficSignals(mergeTrafficSignals([], localRoadFeatures));
          setRoadFeatures([]);
          setOsmStatus("unavailable");
        }
      });
    return () => {
      effectActive = false;
    };
  }, [
    activity.id,
    routePointKey,
    osmRoadIntelligenceEnabled,
    featureSettingsKey,
    localFeatureKey,
    reanalysisNonce,
  ]);

  useEffect(() => {
    if (!pickingLocalSignal || !mapRef.current) return;
    const map = mapRef.current;
    const pick = (event: import("leaflet").LeafletMouseEvent) => {
      setLocalSignalDraft({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
      setPickingLocalSignal(false);
      setSelectedRoadEvent(pendingLocalSignalEvent);
      setPendingLocalSignalEvent(null);
    };
    map.once("click", pick);
    return () => {
      map.off("click", pick);
    };
  }, [pickingLocalSignal, mapState, pendingLocalSignalEvent]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let removeTiles: (() => void) | null = null;
    let handleCustomerPointClick: ((event: Event) => void) | null = null;
    // Rebuilding the Leaflet instance is the external synchronisation this
    // effect owns, so expose that transition to the UI immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapState("loading");
    const build = async () => {
      if (!containerRef.current || points.length === 0)
        return setMapState("unavailable");
      try {
        const L = await import("leaflet");
        if (cancelled || !containerRef.current) return;
        const latLngs = points.map(
          (point) => [point.latitude, point.longitude] as [number, number],
        );
        const mapBounds = [...latLngs];
        if (Number.isFinite(storeLatitude) && Number.isFinite(storeLongitude))
          mapBounds.push([storeLatitude!, storeLongitude!]);
        if (
          Number.isFinite(physicalStore.latitude) &&
          Number.isFinite(physicalStore.longitude)
        )
          mapBounds.push([physicalStore.latitude, physicalStore.longitude]);
        boundsRef.current = mapBounds;
        map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        });
        mapRef.current = map;
        const mapContainer = map.getContainer();
        handleCustomerPointClick = (event: Event) => {
          const target = (
            event.target as HTMLElement | null
          )?.closest<HTMLButtonElement>(
            ".route-mark-customer, .route-set-context, .route-classify-event",
          );
          if (!target) return;
          const pointIndex = Number(target.dataset.pointIndex);
          if (!Number.isInteger(pointIndex) || pointIndex < 0) return;
          if (target.dataset.action === "classify-event") {
            const point = points[pointIndex];
            if (point)
              setSelectedRoadEvent({
                pointIndex,
                latitude: point.latitude,
                longitude: point.longitude,
                startAt: target.dataset.startAt ?? point.timestamp,
                endAt: target.dataset.endAt ?? point.timestamp,
                durationMs: Number(target.dataset.durationMs ?? 0),
              });
            map?.closePopup();
            return;
          }
          const context = target.dataset.context as
            | "customer_house"
            | "traffic_light"
            | "road_delay"
            | "waiting"
            | undefined;
          if (context && onSetRoutePointContextRef.current)
            onSetRoutePointContextRef.current(activity.id, pointIndex, context);
          else if (onSetCustomerPointRef.current)
            onSetCustomerPointRef.current(activity.id, pointIndex);
          map?.closePopup();
        };
        mapContainer.addEventListener("click", handleCustomerPointClick);
        L.control.zoom({ position: "bottomright" }).addTo(map);
        removeTiles = addOpenStreetMapTiles(L, map);
        const markerIcon = (label: string, className: string) =>
          L.divIcon({
            className: `route-marker-shell ${className}`,
            html: `<span>${label}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
        if (Number.isFinite(storeLatitude) && Number.isFinite(storeLongitude)) {
          L.circle([storeLatitude!, storeLongitude!], {
            radius: statsRadius,
            color: "#1d7fcc",
            weight: 2,
            fillColor: "#1d7fcc",
            fillOpacity: 0.12,
          })
            .bindPopup(
              `<strong>REAL STATS GEOFENCE</strong><br>Protected ${Math.round(statsRadius)}m boundary<br>Used for exit/entry statistics only`,
            )
            .addTo(map!);
        }
        L.circle([dominosGeofence.latitude, dominosGeofence.longitude], {
          radius: dominosGeofence.radius,
          color: "#c4871d",
          weight: 2,
          dashArray: "7 6",
          fillColor: "#c4871d",
          fillOpacity: 0.06,
        })
          .bindPopup(
            `<strong>DISPATCH REFERENCE GEOFENCE</strong><br>${dominosGeofence.radius}m comparison boundary<br>Evidence and statistics only`,
          )
          .addTo(map!);
        if (
          Number.isFinite(physicalStore.latitude) &&
          Number.isFinite(physicalStore.longitude)
        ) {
          L.marker([physicalStore.latitude, physicalStore.longitude], {
            icon: markerIcon("STORE", "store-display"),
          })
            .bindPopup(
              `<strong>${physicalStore.label}</strong><br>Physical store/map pin<br>Does not change the protected statistics geofence`,
            )
            .addTo(map!);
        }
        const markCustomerButton = (pointIndex: number) =>
          onSetCustomerPoint
            ? `<br><button type="button" class="route-mark-customer" data-point-index="${pointIndex}">MARK AT CUSTOMER HOUSE</button>`
            : "";
        const contextButtons = (
          pointIndex: number,
          event?: { startAt?: string; endAt?: string; durationMs?: number },
        ) =>
          onSetRoutePointContext
            ? `<div class="route-context-actions"><button type="button" class="route-classify-event" data-action="classify-event" data-point-index="${pointIndex}" data-start-at="${event?.startAt ?? ""}" data-end-at="${event?.endAt ?? ""}" data-duration-ms="${event?.durationMs ?? 0}">CLASSIFY EVENT</button><button type="button" class="route-set-context" data-point-index="${pointIndex}" data-context="customer_house">AT CUSTOMER HOUSE</button><button type="button" class="route-set-context" data-point-index="${pointIndex}" data-context="traffic_light">TRAFFIC LIGHT</button><button type="button" class="route-set-context" data-point-index="${pointIndex}" data-context="road_delay">ROAD DELAY</button><button type="button" class="route-set-context" data-point-index="${pointIndex}" data-context="waiting">OTHER WAIT</button></div>`
            : markCustomerButton(pointIndex);
        const customerSourceLabel =
          customer?.source === "manual_delivered"
            ? "Delivered · manual GPS"
            : customer?.source === "user_selected_route_point"
              ? "Customer house · user selected"
              : customer?.source === "detected_stop"
                ? "Probable customer stop · GPS detected"
                : "Best available customer estimate";
        if (latLngs.length > 1) {
          const colours = {
            free: "#24905f",
            moderate: "#d6a32d",
            slow: "#d77720",
            heavy: "#d95049",
            customer: "#c4871d",
            store: "#1f8b68",
            stationary: "#852a2a",
          };
          const labels = {
            free: "FREE FLOWING MOVEMENT",
            moderate: "MODERATE MOVEMENT",
            slow: "SLOW MOVEMENT",
            heavy: "HEAVY / STOP-START MOVEMENT",
            customer: "CUSTOMER AREA · EXCLUDED",
            store: "STORE AREA · EXCLUDED",
            stationary: "STATIONARY / POSSIBLE ROAD DELAY",
          };
          const displaySegments = movement.segments.length
            ? movement.segments
            : [
                {
                  startIndex: 0,
                  endIndex: latLngs.length - 1,
                  classification: "moderate" as const,
                  startAt: points[0].timestamp,
                  endAt: points.at(-1)!.timestamp,
                  durationMs: 0,
                  distanceMetres: route.distanceMetres,
                  averageMph: 0,
                  minimumMph: 0,
                  maximumMph: 0,
                  confidence: "low" as const,
                },
              ];
          displaySegments.forEach((segment) => {
            const routePart = latLngs.slice(
              segment.startIndex,
              segment.endIndex + 1,
            );
            if (routePart.length < 2) return;
            L.polyline(routePart, {
              color: colours[segment.classification],
              weight:
                segment.classification === "customer" ||
                segment.classification === "store"
                  ? 5
                  : 7,
              opacity: 0.94,
              lineJoin: "round",
              lineCap: "round",
            })
              .bindPopup(
                `<strong>${labels[segment.classification]}</strong><br>${safeTime(segment.startAt)}–${safeTime(segment.endAt)}<br>Distance: ${(segment.distanceMetres / 1609.344).toFixed(2)} mi<br>Average speed: ${segment.averageMph.toFixed(1)} mph<br>Range: ${segment.minimumMph.toFixed(1)}–${segment.maximumMph.toFixed(1)} mph<br>Source: GPS derived${markCustomerButton(segment.startIndex)}`,
              )
              .addTo(map!);
          });
          signalQueues.forEach((queue) => {
            const queuePath = latLngs.slice(
              queue.startIndex,
              queue.endIndex + 1,
            );
            const signal = trafficSignals.find(
              (item) => item.id === queue.signalId,
            );
            const detail = `<strong>SIGNAL QUEUE</strong><br>${safeTime(queue.startAt)}–${safeTime(queue.endAt)}<br>${formatTimingDuration(queue.durationMs)} · ${(queue.queueDistanceMetres / 1609.344).toFixed(2)} mi affected<br>Average ${queue.averageMph.toFixed(1)} mph · stationary ${formatTimingDuration(queue.stationaryMs)}<br>Stop / move cycles: ${queue.stopCycles}<br>Signal distance at queue start: ${(queue.signalDistanceAtStart / 1609.344).toFixed(2)} mi<br>Source: ${signal?.source === "USER_CONFIRMED_LOCAL" ? "LOCAL CONFIRMATION" : "OpenStreetMap"} · ${queue.confidence.toUpperCase()} confidence`;
            if (queuePath.length > 1)
              L.polyline(queuePath, {
                color: "#c45a26",
                weight: 10,
                opacity: 0.42,
                dashArray: "3 8",
                lineJoin: "round",
                lineCap: "round",
              })
                .bindPopup(detail)
                .addTo(map!);
            if (signal && showRoadContext)
              L.marker([signal.latitude, signal.longitude], {
                icon: markerIcon("🚦", "traffic-light-stop"),
              })
                .bindPopup(detail)
                .addTo(map!);
          });
          if (showSameRoad)
            movement.sameRoad.forEach((comparison, index) => {
              const outboundPath = latLngs.slice(
                comparison.outboundStartIndex,
                comparison.outboundEndIndex + 1,
              );
              const returnPath = latLngs.slice(
                comparison.returnStartIndex,
                comparison.returnEndIndex + 1,
              );
              const detail = `<strong>SHARED SECTION ${index + 1}</strong><br>Outbound ${comparison.outboundMph.toFixed(1)} mph · ${formatTimingDuration(comparison.outboundMs)}<br>Return ${comparison.returnMph.toFixed(1)} mph · ${formatTimingDuration(comparison.returnMs)}<br>Observed outbound difference: ${formatTimingDuration(Math.max(0, comparison.outboundMs - comparison.returnMs))}<br>GPS derived`;
              if (outboundPath.length > 1)
                L.polyline(outboundPath, {
                  color: "#6f4fa3",
                  weight: 10,
                  opacity: 0.62,
                  dashArray: "5 7",
                })
                  .bindPopup(detail)
                  .addTo(map!);
              if (returnPath.length > 1)
                L.polyline(returnPath, {
                  color: "#67b8c6",
                  weight: 5,
                  opacity: 0.95,
                  dashArray: "2 6",
                })
                  .bindPopup(detail)
                  .addTo(map!);
            });
        }
        routeGaps.forEach((gap) => {
          const before = points.find((point) => point.timestamp === gap.from);
          const after = points.find((point) => point.timestamp === gap.to);
          if (before && after)
            L.polyline(
              [
                [before.latitude, before.longitude],
                [after.latitude, after.longitude],
              ],
              { color: "#d68b2c", weight: 6, opacity: 0.95, dashArray: "8 10" },
            )
              .bindPopup(
                `GPS recording gap · ${formatTimingDuration(gap.durationMs)}`,
              )
              .addTo(map!);
        });
        L.marker(latLngs[0], { icon: markerIcon("START", "start") })
          .bindPopup(
            `<strong>DELIVERY START / LEFT STORE</strong><br>${safeTime(activity.start)}<br>Single/Double pressed`,
          )
          .addTo(map);
        if (activity.storeExitAt && storeExitMapPoint) {
          L.marker([storeExitMapPoint.latitude, storeExitMapPoint.longitude], {
            icon: markerIcon("EXIT", "geofence-exit"),
          })
            .bindPopup(
              `<strong>LEFT REAL GEOFENCE</strong><br>${safeTime(activity.storeExitAt)}${realJourneyTiming.preDepartureMs != null ? `<br>${formatTimingDuration(realJourneyTiming.preDepartureMs)} after delivery started` : ""}<br>Nearest recorded GPS sample: ${safeTime(storeExitMapPoint.timestamp)} · accuracy ±${Math.round(storeExitMapPoint.accuracy)} m`,
            )
            .addTo(map);
        }
        if (activity.storeEntryAt && storeEntryMapPoint) {
          L.marker(
            [storeEntryMapPoint.latitude, storeEntryMapPoint.longitude],
            { icon: markerIcon("IN", "geofence-entry") },
          )
            .bindPopup(
              `<strong>BACK IN REAL GEOFENCE</strong><br>${safeTime(activity.storeEntryAt)}${realJourneyTiming.hustleMs != null ? `<br>Outside the store zone for ${formatTimingDuration(realJourneyTiming.hustleMs)}` : ""}<br>Nearest recorded GPS sample: ${safeTime(storeEntryMapPoint.timestamp)} · accuracy ±${Math.round(storeEntryMapPoint.accuracy)} m`,
            )
            .addTo(map);
        }
        if (isLive && latestPoint) {
          L.marker(latLngs.at(-1)!, { icon: markerIcon("•", "current") })
            .bindPopup(
              `Current GPS point · ${safeTime(latestPoint.timestamp)}<br>Accuracy ±${Math.round(latestPoint.accuracy)} m`,
            )
            .addTo(map);
        } else if (activity.backAtStoreAt && backAtStoreMapPoint) {
          L.marker(
            [backAtStoreMapPoint.latitude, backAtStoreMapPoint.longitude],
            { icon: markerIcon("BACK", "back-at-store") },
          )
            .bindPopup(
              `<strong>BACK AT STORE</strong><br>Button pressed: ${safeTime(activity.backAtStoreAt)}${journeyTiming.returnDelayMs != null ? `<br>${formatTimingDuration(journeyTiming.returnDelayMs)} after geofence return` : ""}<br>Nearest recorded GPS sample: ${safeTime(backAtStoreMapPoint.timestamp)} · accuracy ±${Math.round(backAtStoreMapPoint.accuracy)} m`,
            )
            .addTo(map);
        }
        if (customerTimings.length)
          customerTimings.forEach((timing, index) => {
            if (timing.latitude == null || timing.longitude == null) return;
            const pointIndex =
              timing.pointIndex ??
              Math.max(
                0,
                points.findIndex(
                  (point) => point.timestamp === timing.timestamp,
                ),
              );
            const duration =
              timing.durationMs != null
                ? `<br>Time from previous milestone: ${formatTimingDuration(timing.durationMs)}`
                : "";
            L.circleMarker([timing.latitude, timing.longitude], {
              radius: 8,
              color: "#fff",
              weight: 2,
              fillColor: index === 0 ? "#d68b2c" : "#b45c9a",
              fillOpacity: 1,
            })
              .bindPopup(
                `<strong>CUSTOMER ${timing.customerIndex ?? index + 1} · DELIVERED</strong><br>${safeTime(timing.timestamp)}<br>Accuracy ±${Math.round(timing.accuracy ?? 0)} m${duration}${markCustomerButton(pointIndex)}`,
              )
              .addTo(map!);
          });
        if (!customerTimings.length && customerPoint)
          L.circleMarker([customerPoint.latitude, customerPoint.longitude], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#d68b2c",
            fillOpacity: 1,
          })
            .bindPopup(
              `${customerSourceLabel} · ${safeTime(customerPoint.timestamp)}<br>Accuracy ±${Math.round(customerPoint.accuracy)} m${markCustomerButton(
                ("pointIndex" in customerPoint && typeof customerPoint.pointIndex === "number" ? customerPoint.pointIndex : undefined) ??
                  Math.max(
                    0,
                    points.findIndex(
                      (point) => point.timestamp === customerPoint.timestamp,
                    ),
                  ),
              )}`,
            )
            .addTo(map);
        if (showRoadContext) {
          const corridorSignals = trafficSignals.filter((signal) =>
            points.some(
              (point) =>
                distanceMetres(
                  point.latitude,
                  point.longitude,
                  signal.latitude,
                  signal.longitude,
                ) <= 100,
            ),
          );
          corridorSignals.forEach((signal) =>
            L.marker([signal.latitude, signal.longitude], {
              icon: markerIcon("🚦", "traffic-light"),
            })
              .bindPopup(
                `<strong>TRAFFIC SIGNAL</strong><br>Source: ${signal.source === "USER_CONFIRMED_LOCAL" ? "LOCAL CONFIRMATION · user confirmed" : "OpenStreetMap location"}`,
              )
              .addTo(map!),
          );
        }
        if (showRoadContext) {
          const visibleRoadFeatures = roadFeatures.filter(
            (feature) =>
              feature.featureType !== "ROAD" &&
              points.some(
                (point) =>
                  distanceMetres(
                    point.latitude,
                    point.longitude,
                    feature.latitude,
                    feature.longitude,
                  ) <= 110,
              ),
          );
          visibleRoadFeatures.forEach((feature) => {
            const detail = [
              `<strong>${roadFeatureLabel(feature)}</strong>`,
              feature.name ? `Name: ${escapePopupText(feature.name)}` : null,
              feature.roadClass
                ? `Road class: ${escapePopupText(feature.roadClass)}`
                : null,
              feature.maxspeedRaw
                ? `Mapped speed: ${escapePopupText(feature.maxspeedRaw)}`
                : null,
              feature.oneway ? "One-way road" : null,
              feature.access && feature.access !== "yes"
                ? `Access: ${escapePopupText(feature.access)}`
                : null,
              feature.restriction
                ? `Restriction: ${escapePopupText(feature.restriction)}`
                : null,
              "Source: OpenStreetMap",
            ]
              .filter(Boolean)
              .join("<br>");
            L.marker([feature.latitude, feature.longitude], {
              icon: markerIcon(
                roadFeatureIcon(feature),
                `osm-feature ${feature.featureType.toLowerCase()}`,
              ),
            })
              .bindPopup(detail)
              .addTo(map!);
          });
        }
        movement.stationary.forEach((stop) => {
          const point = points[Math.min(points.length - 1, stop.startIndex)];
          const matched = trafficLightStops.find(
            (item) =>
              item.startedAt === stop.startAt && item.endedAt === stop.endAt,
          );
          const queue = signalQueues.find(
            (item) =>
              stop.startIndex >= item.startIndex &&
              stop.startIndex < item.endIndex,
          );
          const atCustomer = Boolean(
            customerPoint &&
            distanceMetres(
              point.latitude,
              point.longitude,
              customerPoint.latitude,
              customerPoint.longitude,
            ) <= customerRadius,
          );
          const manualContext = routePointContext(stop.startIndex);
          if (atCustomer || manualContext === "customer_house") {
            L.circleMarker([point.latitude, point.longitude], {
              radius: 9,
              color: "#fff",
              weight: 2,
              fillColor: "#c4871d",
              fillOpacity: 1,
            })
              .bindPopup(
                `<strong>CUSTOMER STOP</strong><br>${safeTime(stop.startAt)}–${safeTime(stop.endAt)}<br>${formatTimingDuration(stop.durationMs)} · ${manualContext === "customer_house" ? "Driver marked customer house" : customer?.source === "user_selected_route_point" ? "User selected on map" : "GPS-detected turnaround"}${contextButtons(stop.startIndex, stop)}`,
              )
              .addTo(map!);
          } else if (manualContext === "traffic_light") {
            L.marker([point.latitude, point.longitude], {
              icon: markerIcon("🚦", "traffic-light-stop"),
            })
              .bindPopup(
                `<strong>TRAFFIC LIGHT WAIT</strong><br>${safeTime(stop.startAt)}–${safeTime(stop.endAt)}<br>${formatTimingDuration(stop.durationMs)} · marked by driver${contextButtons(stop.startIndex, stop)}`,
              )
              .addTo(map!);
          } else if (
            manualContext === "road_delay" ||
            manualContext === "waiting"
          ) {
            const title =
              manualContext === "road_delay" ? "ROAD DELAY" : "OTHER WAIT";
            L.circleMarker([point.latitude, point.longitude], {
              radius: 8,
              color: "#fff",
              weight: 2,
              fillColor: "#852a2a",
              fillOpacity: 1,
            })
              .bindPopup(
                `<strong>${title}</strong><br>${safeTime(stop.startAt)}–${safeTime(stop.endAt)}<br>${formatTimingDuration(stop.durationMs)} · marked by driver${contextButtons(stop.startIndex, stop)}`,
              )
              .addTo(map!);
          } else if (matched && showRoadContext) {
            L.marker([matched.latitude, matched.longitude], {
              icon: markerIcon("🚦", "traffic-light-stop"),
            })
              .bindPopup(
                `<strong>${matched.source === "MANUALLY_CLASSIFIED" ? "TRAFFIC SIGNAL STOP · MANUALLY CLASSIFIED" : "TRAFFIC LIGHT STOP"}</strong><br>${safeTime(matched.startedAt)}–${safeTime(matched.endedAt)}<br>${formatTimingDuration(matched.durationMs)}<br>Nearest signal: ${Math.round(matched.nearestSignalMetres)}m · ${matched.confidence.toUpperCase()} confidence<br>Source: ${matched.source === "MANUALLY_CLASSIFIED" ? "MANUALLY CLASSIFIED" : matched.source === "USER_CONFIRMED_LOCAL" ? "LOCAL CONFIRMATION" : "OpenStreetMap"}${contextButtons(stop.startIndex, stop)}`,
              )
              .addTo(map!);
          } else if (queue && showRoadContext) {
            L.circleMarker([point.latitude, point.longitude], {
              radius: 7,
              color: "#fff",
              weight: 2,
              fillColor: "#9b302a",
              fillOpacity: 1,
            })
              .bindPopup(
                `<strong>SIGNAL QUEUE · CHILD STOP</strong><br>${safeTime(stop.startAt)}–${safeTime(stop.endAt)}<br>${formatTimingDuration(stop.durationMs)}<br>Grouped into ${formatTimingDuration(queue.durationMs)} signal queue`,
              )
              .addTo(map!);
          } else if (!matched) {
            L.circleMarker([point.latitude, point.longitude], {
              radius: 8,
              color: "#fff",
              weight: 2,
              fillColor: "#852a2a",
              fillOpacity: 1,
            })
              .bindPopup(
                `<strong>STATIONARY / POSSIBLE ROAD DELAY</strong><br>${safeTime(stop.startAt)}–${safeTime(stop.endAt)}<br>${formatTimingDuration(stop.durationMs)} · GPS derived${contextButtons(stop.startIndex, stop)}`,
              )
              .addTo(map!);
          }
        });
        roadStops.forEach((stop) => {
          const matched = trafficLightStops.find(
            (item) =>
              item.startedAt === stop.startedAt &&
              item.endedAt === stop.endedAt,
          );
          const stopPointIndex = points.findIndex(
            (point) => point.timestamp === stop.startedAt,
          );
          const matchedSignal = matched
            ? trafficSignals.find((signal) => signal.id === matched.signalId)
            : undefined;
          if (matched && showRoadContext)
            L.marker([matched.latitude, matched.longitude], {
              icon: markerIcon("🚦", "traffic-light-stop"),
            })
              .bindPopup(
                `<strong>TRAFFIC LIGHT STOP</strong><br>${safeTime(matched.startedAt)}–${safeTime(matched.endedAt)}<br>${formatTimingDuration(matched.durationMs)}<br>Nearest signal: ${Math.round(matched.nearestSignalMetres)}m · ${matched.confidence.toUpperCase()} confidence<br>Source: ${matched.source === "MANUALLY_CLASSIFIED" ? "MANUALLY CLASSIFIED" : signalSourceLabel(matchedSignal)}${markCustomerButton(matched.startIndex)}`,
              )
              .addTo(map!);
          else if (!matched)
            L.marker([stop.latitude, stop.longitude], {
              icon: markerIcon("!", "traffic"),
            })
              .bindPopup(
                `<strong>${stop.kind === "probable_traffic_light" ? "Traffic-signal location" : "Possible road delay"}</strong><br>Stationary for ${formatTimingDuration(stop.durationMs)}<br>${safeTime(stop.startedAt)}–${safeTime(stop.endedAt)}${markCustomerButton(stopPointIndex >= 0 ? stopPointIndex : 0)}`,
              )
              .addTo(map!);
        });
        if (showPoints)
          points.forEach((point, index) => {
            const speed =
              point.speed != null
                ? `<br>Speed ${(point.speed * 2.23694).toFixed(1)} mph`
                : "";
            L.circleMarker([point.latitude, point.longitude], {
              radius: 4,
              color: "#fff",
              weight: 1,
              fillColor: "#1e8ba4",
              fillOpacity: 0.88,
            })
              .bindPopup(
                `${safeTime(point.timestamp)}<br>Accuracy ±${Math.round(point.accuracy)} m${speed}${markCustomerButton(index)}`,
              )
              .addTo(map!);
          });
        if (mapBounds.length > 1)
          map.fitBounds(mapBounds, { padding: [28, 28], maxZoom: 17 });
        else map.setView(latLngs[0], 17);
        window.setTimeout(() => map?.invalidateSize(), 80);
        setMapState("ready");
      } catch {
        if (!cancelled) setMapState("unavailable");
      }
    };
    void build();
    return () => {
      cancelled = true;
      removeTiles?.();
      mapRef.current = null;
      if (map && handleCustomerPointClick)
        map
          .getContainer()
          .removeEventListener("click", handleCustomerPointClick);
      map?.remove();
    };
  }, [
    activity.id,
    activity.start,
    activity.storeExitAt,
    activity.storeEntryAt,
    activity.backAtStoreAt,
    realJourneyTiming.preDepartureMs,
    realJourneyTiming.hustleMs,
    realJourneyTiming.returnDelayMs,
    latestPoint?.timestamp,
    routePointKey,
    roadStops.length,
    showPoints,
    customer?.source,
    customerTimingKey,
    movementKey,
    queueKey,
    routeContextKey,
    routeEventKey,
    showSameRoad,
    showRoadContext,
    signalKey,
    roadFeatureKey,
    trafficLightStops.length,
    signalQueues.length,
    physicalStore.latitude,
    physicalStore.longitude,
    physicalStore.label,
    statsRadius,
    storeLatitude,
    storeLongitude,
  ]);

  const directSignalMs = trafficLightStops.reduce(
    (sum, stop) => sum + stop.durationMs,
    0,
  );
  const queueMs = signalQueues.reduce(
    (sum, queue) => sum + queue.durationMs,
    0,
  );
  const signalImpactMs = directSignalMs + queueMs;
  const otherStationaryMs = Math.max(
    0,
    movementTotal("stationary").ms - signalImpactMs,
  );
  const destinationSummary = (activity.deliveryDestinations ?? [])
    .map((destination) =>
      [destination.street, destination.locality, destination.postcode]
        .filter(Boolean)
        .join(" · "),
    )
    .filter(Boolean)
    .join("  •  ");
  const customerStopMs = customerPoint
    ? customerStopDurationMs(routeActivity, customer)
    : 0;
  const customerStopValue = !customer
    ? "NO CLEAR STOP"
    : customerStopMs > 0
      ? `${customer.source === "manual_delivered" || customer.source === "user_selected_route_point" ? "" : "~"}${formatTimingDuration(customerStopMs)}`
      : "TIME NOT RECORDED";
  const customerStopDetail = !customer
    ? "Not enough GPS data"
    : customer.source === "manual_delivered"
      ? "Delivered → leaving customer"
      : customer.source === "user_selected_route_point"
        ? "Stopped at selected customer location"
        : customer.source === "detected_stop"
          ? "GPS-detected stop and return toward store"
          : "GPS-derived turnaround estimate";
  const customerTimingCards: [string, string, string][] = customerTimings.map(
    (timing, index) => [
      `TIME TO CUSTOMER ${timing.customerIndex ?? index + 1}`,
      timing.durationMs != null
        ? formatTimingDuration(timing.durationMs)
        : "TIME NOT RECORDED",
      `${safeTime(timing.timestamp)} · Delivered tap`,
    ],
  );
  const mainCards: [string, string, string][] = [
    [
      "TOTAL DELIVERY",
      formatTimingDuration(analysis?.totalMs ?? 0),
      `${safeTime(activity.start)}–${isLive ? "now" : safeTime(activity.end ?? route.completedAt ?? activity.start)}`,
    ],
    [
      "LEAVE STORE HUSTLE",
      journeyTiming.preDepartureMs != null
        ? formatTimingDuration(journeyTiming.preDepartureMs)
        : "NOT RECORDED",
      `${hustleSource === "real" ? "Real 35m" : `Domino's ${dominosGeofence.radius}m`} · start → GPS exit`,
    ],
    ["CUSTOMER STOP / DOOR TIME", customerStopValue, customerStopDetail],
    [
      "ENTER STORE HUSTLE",
      journeyTiming.returnDelayMs != null
        ? formatTimingDuration(journeyTiming.returnDelayMs)
        : "NOT RECORDED",
      selectedGeofenceEvidence.entryAt
        ? `${hustleSource === "real" ? "Real" : "Domino's"} GPS entry → Back at Store · ${safeTime(activity.backAtStoreAt ?? activity.end ?? route.completedAt ?? activity.start)}`
        : "No GPS entry recorded",
    ],
  ];
  const cards: [string, string, string][] = [
    [
      "TOTAL DELIVERY",
      formatTimingDuration(analysis?.totalMs ?? 0),
      `${timeFormat.format(new Date(activity.start))}–${isLive ? "now" : timeFormat.format(new Date(activity.end ?? route.completedAt ?? activity.start))}`,
    ],
    [
      "OUTBOUND",
      analysis?.outboundMs != null
        ? formatTimingDuration(analysis.outboundMs)
        : "NOT AVAILABLE YET",
      "Real geofence exit → customer",
    ],
    ["CUSTOMER STOP", customerStopValue, customerStopDetail],
    [
      "RETURN",
      analysis?.returnMs != null
        ? formatTimingDuration(analysis.returnMs)
        : "NOT AVAILABLE YET",
      "Customer → real geofence entry",
    ],
    [
      "STORE PREP / DEPARTURE",
      journeyTiming.preDepartureMs != null
        ? formatTimingDuration(journeyTiming.preDepartureMs)
        : "Not recorded",
      `${hustleSource === "real" ? "Real Hustle" : "Domino's Hustle"} · start → exit`,
    ],
    [
      "STORE ARRIVAL → BUTTON",
      journeyTiming.returnDelayMs != null
        ? formatTimingDuration(journeyTiming.returnDelayMs)
        : "Not recorded",
      `${hustleSource === "real" ? "Real Hustle" : "Domino's Hustle"} · entry → Back at Store`,
    ],
    [
      "MOVING TIME",
      formatTimingDuration(analysis?.movingMs ?? 0),
      analysis?.totalMs
        ? `${Math.round((analysis.movingMs / analysis.totalMs) * 100)}% of delivery`
        : "Calculating…",
    ],
    [
      "STATIONARY / SLOW",
      formatTimingDuration(analysis?.slowMs ?? 0),
      analysis?.totalMs
        ? `${Math.round((analysis.slowMs / analysis.totalMs) * 100)}% of delivery`
        : "Calculating…",
    ],
    [
      "SIGNAL / JUNCTION DELAY",
      signalImpactMs ? formatTimingDuration(signalImpactMs) : "None detected",
      signalQueues.length
        ? `${signalQueues.length} queue${signalQueues.length === 1 ? "" : "s"} · direct ${formatTimingDuration(directSignalMs)}`
        : directSignalMs
          ? `${trafficLightStops.length} direct signal stop${trafficLightStops.length === 1 ? "" : "s"}`
          : "GPS + OpenStreetMap",
    ],
    [
      "AVG MOVING SPEED",
      analysis?.averageMph
        ? `${analysis.averageMph.toFixed(1)} mph`
        : "NOT ENOUGH GPS DATA",
      analysis?.medianMph
        ? `Median ${analysis.medianMph.toFixed(1)} mph`
        : "Evidence only",
    ],
    [
      "POSSIBLE ROAD DELAY",
      otherStationaryMs
        ? formatTimingDuration(otherStationaryMs)
        : "None detected",
      otherStationaryMs
        ? "Excludes signal-associated time"
        : "GPS-derived only",
    ],
    [
      "TOTAL DISTANCE",
      routeMiles(route.distanceMetres),
      "Actual recorded route",
    ],
    [
      "GPS CONFIDENCE",
      routeGaps.length ? "MEDIUM" : points.length >= 12 ? "HIGH" : "LOW",
      `${route.recordedPointCount} samples · ${routeGaps.length} gaps`,
    ],
  ];
  const expectedReady =
    expected?.status === "ready" || expected?.status === "snapshot";
  const strongestSameRoad = movement.sameRoad.length
    ? [...movement.sameRoad].sort(
        (a, b) =>
          Math.abs(b.outboundMs - b.returnMs) -
          Math.abs(a.outboundMs - a.returnMs),
      )[0]
    : null;
  const weeklyLeaveHustleSeconds = Math.max(
    0,
    Math.round((weeklyHustle?.leaveMs ?? 0) / 1000),
  );
  const weeklyReturnHustleSeconds = Math.max(
    0,
    Math.round((weeklyHustle?.returnMs ?? 0) / 1000),
  );
  const weeklyHustleSeconds =
    weeklyLeaveHustleSeconds + weeklyReturnHustleSeconds;
  const comparisonHustleSeconds = includeWeeklyHustle ? weeklyHustleSeconds : 0;
  const expectedComparisonTotalSeconds =
    (expected?.totalSeconds ?? 0) + comparisonHustleSeconds;
  const expectedDifference =
    expected?.status === "ready" && expected.actualSeconds != null
      ? expected.actualSeconds - expectedComparisonTotalSeconds
      : null;
  const expectedDifferenceLabel =
    expectedDifference == null
      ? "Not calculated"
      : expectedDifference === 0
        ? "On expected time"
        : expectedDifference < 0
          ? `${formatTimingDuration(Math.abs(expectedDifference) * 1000)} under`
          : `+${formatTimingDuration(expectedDifference * 1000)}`;
  const deliveryEfficiency =
    expected?.status === "ready"
      ? routeEfficiencyScore(
          expectedComparisonTotalSeconds,
          expected.actualSeconds,
        )
      : null;
  const hasWeeklyHustleData =
    (weeklyHustle?.leaveSamples ?? 0) > 0 ||
    (weeklyHustle?.returnSamples ?? 0) > 0;
  const weeklyHustleDetail = hasWeeklyHustleData
    ? includeWeeklyHustle
      ? `Hustle source: ${hustleSource === "real" ? "REAL HUSTLE" : "DOMINO'S HUSTLE"} · weekly leave ${formatTimingDuration(weeklyLeaveHustleSeconds * 1000)} (${weeklyHustle?.leaveSamples ?? 0} runs) · back ${formatTimingDuration(weeklyReturnHustleSeconds * 1000)} (${weeklyHustle?.returnSamples ?? 0} runs)`
      : `Weekly hustle hidden for this view: ${formatTimingDuration(weeklyHustleSeconds * 1000)} total`
    : `Hustle source: ${hustleSource === "real" ? "REAL HUSTLE" : "DOMINO'S HUSTLE"} · no previous weekly data yet`;
  const expectedUnavailableReason =
    expected?.reason === "GOOGLE_API_CUSTOMER_POINT_UNAVAILABLE"
      ? "no customer or retained GPS point was available when Delivered was tapped, so no Google request was sent"
      : expected?.reason === "GOOGLE_API_CONNECTION_TIMEOUT"
        ? "a stable internet connection was not confirmed within five minutes, so no Google request was sent"
        : expected?.reason === "GOOGLE_API_CONNECTION_WAIT_CANCELLED"
          ? "the delivery ended before a stable internet connection was confirmed, so no Google request was sent"
          : expected?.reason === "GOOGLE_API_REFRESH_OVERRIDE_WAITING"
            ? "the confirmed one-off refresh is waiting for a stable internet connection"
            : expected?.reason === "GOOGLE_API_NOT_CONFIGURED"
              ? "Google Routes is switched off or its key was not saved"
              : expected?.reason === "GOOGLE_API_DAILY_LIMIT_REACHED"
                ? "the 24-hour Google safety limit was reached"
                : expected?.reason === "GOOGLE_API_HARD_LIMIT_REACHED"
                  ? "the rolling 30-day Google safety limit was reached"
                  : expected?.reason === "DELIVERY_GOOGLE_API_LIMIT_REACHED"
                    ? "this delivery already used its two-request safety allowance"
                    : expected?.reason ===
                        "DELIVERY_GOOGLE_API_OVERRIDE_LIMIT_REACHED"
                      ? "the one-off refresh for this delivery has already been used"
                      : expected?.reason ===
                          "DELIVERED_CORRECTION_REQUIRES_NEW_SNAPSHOT"
                        ? "the previous Google snapshot was cleared after an early Delivered correction"
                        : expected?.reason === "GOOGLE_API_CLOCK_SAFETY_BLOCKED"
                          ? "the phone clock changed backwards, so the request was blocked"
                          : expected?.reason === "GOOGLE_API_LIVE_DELIVERY_ONLY"
                            ? "the request was not made from a live Delivered action"
                            : expected?.reason === "GOOGLE_API_REQUEST_REJECTED"
                              ? "Google rejected the request; check that both route coordinates are valid"
                              : expected?.reason === "GOOGLE_API_KEY_REJECTED"
                                ? "Google rejected the key; enable Maps JavaScript API, Routes API, billing and this app's website restriction"
                                : expected?.reason ===
                                    "GOOGLE_API_PROVIDER_RATE_LIMITED"
                                  ? "Google rate-limited the request; no retry was attempted"
                                  : expected?.reason ===
                                      "GOOGLE_API_NO_USABLE_ROUTE"
                                    ? "Google returned no usable driving route for those coordinates"
                                    : expected?.reason ===
                                        "GOOGLE_API_UNAVAILABLE"
                                      ? "Google did not provide a usable route. This older result is not retried automatically; run a new Test Delivery and check the request audit"
                                      : expected?.reason;
  const nativeGoogleSetupMissing = Boolean(
    isNativeShell &&
    isLive &&
    expected?.status === "unavailable" &&
    expected?.customer &&
    expected.reason === "GOOGLE_API_NOT_CONFIGURED",
  );
  const retryState = expectedRouteRetryState(activity);
  const canOfferImmediateLiveRefresh = Boolean(
    isLive &&
    (expected?.reason === "DELIVERY_GOOGLE_API_LIMIT_REACHED" ||
      expected?.reason === "DELIVERED_CORRECTION_REQUIRES_NEW_SNAPSHOT" ||
      nativeGoogleSetupMissing),
  );
  const canOfferRouteRefresh = Boolean(
    onRequestRouteRefresh &&
    (canOfferImmediateLiveRefresh || retryState.retryable),
  );
  const retryCoolingDown =
    !canOfferImmediateLiveRefresh &&
    retryState.retryable &&
    !retryState.available;
  const routeRefreshLabel = retryCoolingDown
    ? `RETRY IN ${retryState.remainingMinutes} MIN`
    : nativeGoogleSetupMissing
      ? googleRoutesConfigured
        ? "TRY GOOGLE ROUTING"
        : "SET UP ROUTING"
      : retryState.retryable
        ? "RETRY GOOGLE ROUTING"
        : "UPDATE GOOGLE ROUTING";
  const expectedRouteHeading = expectedReady
    ? expected?.routingSource === "google_routes"
      ? expected.travelMode === "walking"
        ? "Walking route snapshot"
        : "Traffic-aware route snapshot"
      : "Standard road route · no traffic data"
    : expected?.status === "waiting_for_connection"
      ? "Checking for a stable internet connection"
      : expected?.status === "connection_verified"
        ? "Starting route snapshot"
        : nativeGoogleSetupMissing
          ? "Delivered saved · routing not set up in app"
          : isLive
            ? "Available after Delivered"
            : "Google traffic data unavailable";
  const isDoubleGoogleRoute =
    activity.type === "double_delivery" &&
    expected?.routingSource === "google_routes";
  const googleRouteBreakdown = isDoubleGoogleRoute
    ? `Google ${expected?.travelMode === "walking" ? "walking" : "traffic-aware driving"}: Store → Customer 1 → Customer 2 ${formatTimingDuration((expected?.outboundSeconds ?? 0) * 1000)} · service 4m · Customer 2 → Store ${formatTimingDuration((expected?.returnSeconds ?? 0) * 1000)}`
    : `Google ${expected?.travelMode === "walking" ? "walking" : "traffic-aware driving"}: out ${formatTimingDuration((expected?.outboundSeconds ?? 0) * 1000)} · service 2m · return ${formatTimingDuration((expected?.returnSeconds ?? 0) * 1000)}`;
  const nearbySignalForEvent = selectedRoadEvent
    ? trafficSignals.find(
        (signal) =>
          distanceMetres(
            signal.latitude,
            signal.longitude,
            selectedRoadEvent.latitude,
            selectedRoadEvent.longitude,
          ) <= 120,
      )
    : null;
  const classifyRoadEvent = (classification: RouteEventClassification) => {
    if (!selectedRoadEvent) return;
    onClassifyRouteEventRef.current?.(
      activity.id,
      selectedRoadEvent.pointIndex,
      classification,
    );
    setSelectedRoadEvent(null);
  };
  const useStopLocationForLocalSignal = () => {
    if (!selectedRoadEvent) return;
    setLocalSignalDraft({
      latitude: selectedRoadEvent.latitude,
      longitude: selectedRoadEvent.longitude,
    });
  };
  const saveLocalSignal = () => {
    if (
      !selectedRoadEvent ||
      !localSignalDraft ||
      !onAddLocalRoadFeatureRef.current
    )
      return;
    onAddLocalRoadFeatureRef.current({
      latitude: localSignalDraft.latitude,
      longitude: localSignalDraft.longitude,
      featureType: "TRAFFIC_SIGNAL",
      approachBearing: null,
      label: "User-confirmed traffic signal",
    });
    onClassifyRouteEventRef.current?.(
      activity.id,
      selectedRoadEvent.pointIndex,
      "traffic_signal",
    );
    onReanalyseHistoricalRoutesRef.current?.();
    setLocalSignalDraft(null);
    setSelectedRoadEvent(null);
  };
  const manualEventLabel = (segment: { startIndex: number }) => {
    const classification = routeEventClassification(segment.startIndex);
    if (!classification) return null;
    return (
      {
        traffic_signal: "TRAFFIC SIGNAL · MANUALLY CLASSIFIED",
        general_traffic: "GENERAL TRAFFIC · MANUALLY CLASSIFIED",
        junction: "JUNCTION / GIVE-WAY · MANUALLY CLASSIFIED",
        pedestrian_crossing: "PEDESTRIAN CROSSING · MANUALLY CLASSIFIED",
        customer_parking: "CUSTOMER / PARKING · MANUALLY CLASSIFIED",
        other_road_delay: "OTHER ROAD DELAY · MANUALLY CLASSIFIED",
        unclassified: "UNCLASSIFIED · MANUALLY CLASSIFIED",
      } as Record<RouteEventClassification, string>
    )[classification];
  };
  return (
    <div className="modal-backdrop route-modal-backdrop" onClick={onClose}>
      <div
        className={`route-map-modal route-report-modal${simplified ? " route-map-verification" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">
              {isLive ? "LIVE DELIVERY GPS" : "DELIVERY ROUTE"}
            </p>
            <h2>
              {activity.testOnly
                ? "Google Routes test evidence"
                : `${activity.type === "double_delivery" ? "Double" : "Single"} delivery evidence`}
            </h2>
            <small>
              {route.recordedPointCount} points ·{" "}
              {routeMiles(route.distanceMetres)} · {safeTime(activity.start)}–
              {isLive
                ? "now"
                : safeTime(activity.end ?? route.completedAt ?? activity.start)}
            </small>
            {activity.testOnly && (
              <em className="route-destination-summary">
                TEST ONLY · coordinate-only diagnostic run
              </em>
            )}
            {destinationSummary && (
              <em className="route-destination-summary">
                Destination area · {destinationSummary}
              </em>
            )}
          </div>
          <button onClick={onClose}>×</button>
        </header>
        <div
          className="hustle-source-toggle route-hustle-source"
          role="group"
          aria-label="Delivery Hustle data source"
        >
          <button
            type="button"
            className={hustleSource === "real" ? "active" : ""}
            aria-pressed={hustleSource === "real"}
            onClick={() => setHustleSource("real")}
          >
            REAL HUSTLE
          </button>
          <button
            type="button"
            className={hustleSource === "dominos" ? "active" : ""}
            aria-pressed={hustleSource === "dominos"}
            onClick={() => setHustleSource("dominos")}
          >
            DOMINO'S HUSTLE
          </button>
        </div>
        <p className="route-breakdown-label">DELIVERY MILESTONES</p>
        <section className="route-metric-grid route-milestones-grid">
          {mainCards.map(([label, value, detail]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
              <span>{detail}</span>
            </div>
          ))}
        </section>
        {customerTimingCards.length > 0 && (
          <>
            <p className="route-breakdown-label">TIME TO CUSTOMERS</p>
            <section className="route-metric-grid route-customer-timing-grid">
              {customerTimingCards.map(([label, value, detail]) => (
                <div key={label}>
                  <small>{label}</small>
                  <b>{value}</b>
                  <span>{detail}</span>
                </div>
              ))}
            </section>
            <p className="route-customer-timing-note">
              Travel time to each customer: from store exit for customer 1, then
              from the previous Delivered tap for customer 2.
            </p>
          </>
        )}
        <p className="route-breakdown-label route-map-heading">JOURNEY MAP</p>
        <div className="route-map-frame">
          <div ref={containerRef} className="route-map-canvas" />
          {mapState !== "ready" && (
            <div className="route-map-loading">
              {isLive ? "Waiting for GPS" : "Map unavailable"}
            </div>
          )}
          {pickingLocalSignal && (
            <div className="route-map-pick-banner" role="status">
              <strong>PICK SIGNAL ON MAP</strong>
              <span>
                Tap the traffic-light or junction location. The event will
                reopen so you can save it.
              </span>
            </div>
          )}
        </div>
        <details className="route-additional-stats route-map-key">
          <summary>
            <span>MAP KEY</span>
            <i>⌄</i>
          </summary>
          <section className="route-map-legend">
            <span>
              <i className="journey-start-key" />
              Delivery start · button timestamp
            </span>
            <span>
              <i className="store-display-key" />
              Physical store pin · {physicalStore.label}
            </span>
            <span>
              <i className="stats-geofence-key" />
              Real Hustle geofence · {Math.round(statsRadius)}m
            </span>
            <span>
              <i className="dominos-geofence-key" />
              Domino's Reference · {dominosGeofence.radius}m
            </span>
            <span>
              <i className="zone-exit-key" />
              Left real geofence · GPS timestamp
            </span>
            <span>
              <i className="zone-entry-key" />
              Back in real geofence · GPS timestamp
            </span>
            <span>
              <i className="back-store-key" />
              Back at store · button timestamp
            </span>
            <span>
              <i className="osm-feature-key" />
              Mapped OSM road features
            </span>
            <strong>TRAFFIC / MOVEMENT</strong>
            <span>
              <i className="free" />
              Free flowing 20+ mph
            </span>
            <span>
              <i className="moderate" />
              Moderate 10–20 mph
            </span>
            <span>
              <i className="slow" />
              Slow 5–10 mph
            </span>
            <span>
              <i className="heavy" />
              Stop / start 0–5 mph
            </span>
            <span>
              <i className="stationary" />
              Stationary 10s+
            </span>
            <span>
              <i className="traffic-light" />
              Traffic-signal stop
            </span>
            <span>
              <i className="customer" />
              Customer stop
            </span>
          </section>
        </details>
        <details className="route-additional-stats route-map-options">
          <summary>
            <span>MAP OPTIONS</span>
            <i>⌄</i>
          </summary>
          <div className="route-map-toolbar">
            <button onClick={() => setShowPoints((v) => !v)}>
              {showPoints ? "HIDE GPS POINTS" : "SHOW GPS POINTS"}
            </button>
            {movement.sameRoad.length > 0 && (
              <button
                className={showSameRoad ? "active" : ""}
                onClick={() => setShowSameRoad((v) => !v)}
              >
                {showSameRoad ? "HIDE ROAD COMPARE" : "COMPARE OUT / RETURN"}
              </button>
            )}
            <button
              className={showRoadContext ? "active" : ""}
              onClick={() => setShowRoadContext((v) => !v)}
            >
              {showRoadContext ? "HIDE ROAD FEATURES" : "SHOW ROAD FEATURES"}
            </button>
            <button onClick={fitRoute}>FIT ROUTE</button>
          </div>
        </details>
        <section className="journey-checkpoints-panel">
          <div>
            <p className="eyebrow">
              JOURNEY CHECKPOINTS ·{" "}
              {hustleSource === "real" ? "REAL HUSTLE" : "DOMINO'S HUSTLE"}
            </p>
            <strong>Button times and selected geofence times</strong>
          </div>
          <div className="journey-checkpoints-grid">
            <span>
              <small>DELIVERY START / LEFT STORE</small>
              <b>
                {safeTime(
                  hustleSource === "dominos" && activity.wasEarlyDispatched
                    ? activity.dominosDispatchStartedAt
                    : activity.start,
                )}
              </b>
              <em>
                {hustleSource === "dominos" && activity.wasEarlyDispatched
                  ? "Domino's Started Early pressed"
                  : "Single/Double pressed"}
              </em>
            </span>
            <span>
              <small>LEFT GEOFENCE</small>
              <b>
                {safeTime(
                  journeyTiming.evidence.exitAt,
                  isLive ? "Waiting…" : "Not recorded",
                )}
              </b>
              <em>
                {journeyTiming.preDepartureMs != null
                  ? `${formatTimingDuration(journeyTiming.preDepartureMs)} after start`
                  : "GPS geofence time"}
              </em>
            </span>
            <span>
              <small>BACK IN GEOFENCE</small>
              <b>
                {safeTime(
                  journeyTiming.evidence.entryAt,
                  isLive ? "Not back yet" : "Not recorded",
                )}
              </b>
              <em>
                {journeyTiming.hustleMs != null
                  ? `${formatTimingDuration(journeyTiming.hustleMs)} outside zone`
                  : "GPS geofence time"}
              </em>
            </span>
            <span>
              <small>BACK AT STORE</small>
              <b>
                {safeTime(
                  activity.backAtStoreAt,
                  isLive ? "Not pressed yet" : "Not recorded",
                )}
              </b>
              <em>
                {journeyTiming.returnDelayMs != null
                  ? `${formatTimingDuration(journeyTiming.returnDelayMs)} after geofence`
                  : "Button time"}
              </em>
            </span>
            {activity.wasEarlyDispatched && (
              <span>
                <small>EARLY DISPATCH GAP</small>
                <b>
                  {activity.earlyDispatchGapSeconds != null
                    ? formatTimingDuration(
                        activity.earlyDispatchGapSeconds * 1000,
                      )
                    : "Not recorded"}
                </b>
                <em>Domino's dispatch → food ready</em>
              </span>
            )}
          </div>
        </section>
        <details className="dual-geofence-evidence">
          <summary>
            <span>
              <small>STORE GEOFENCE EVIDENCE</small>
              <strong>Both independent boundaries</strong>
            </span>
            <i>⌄</i>
          </summary>
          <div>
            <article>
              <b>REAL GEOFENCE · 35m</b>
              <span>
                Left store <strong>{safeTime(realEvidence.exitAt)}</strong>
              </span>
              <span>
                Returned <strong>{safeTime(realEvidence.entryAt)}</strong>
              </span>
            </article>
            <article>
              <b>DOMINO'S GEOFENCE · {dominosGeofence.radius}m</b>
              <span>
                Left Domino's boundary{" "}
                <strong>{safeTime(dominosEvidence.exitAt)}</strong>
              </span>
              <span>
                Returned inside boundary{" "}
                <strong>{safeTime(dominosEvidence.entryAt)}</strong>
              </span>
              {dominosEvidence.derivedFromRoute && (
                <em>Reconstructed from conclusive retained GPS route points</em>
              )}
            </article>
          </div>
        </details>
        {activity.storePresenceProof && (
          <section
            className={`store-proof-evidence ${activity.storePresenceProof.returnAttempt?.outcome ?? "pending"}`}
          >
            <div>
              <small>BETA STORE-PRESENCE PROOF</small>
              <strong>
                {activity.storePresenceProof.returnAttempt?.outcome ===
                "confirmed"
                  ? "RETURN CONFIRMED"
                  : activity.storePresenceProof.returnAttempt?.outcome ===
                      "not_required"
                    ? "OFF FOR THIS RETURN"
                    : activity.storePresenceProof.returnAttempt?.outcome ===
                        "not_confirmed"
                      ? "RETURN NOT CONFIRMED"
                      : storePresenceProofEnabled(activity)
                        ? "ACTIVE · WAITING FOR RETURN"
                        : "OFF"}
              </strong>
            </div>
            <span>
              {activity.storePresenceProof.radiusMetres}m physical store zone
            </span>
            {activity.storePresenceProof.returnAttempt?.outcome ===
              "confirmed" && (
              <p>
                {Math.round(
                  activity.storePresenceProof.returnAttempt.distanceMetres ?? 0,
                )}
                m from store pin · GPS ±
                {Math.round(
                  activity.storePresenceProof.returnAttempt.accuracy ?? 0,
                )}
                m · {safeTime(activity.storePresenceProof.returnAttempt.at)}
              </p>
            )}
            {activity.storePresenceProof.changes.length > 0 && (
              <p>
                Changed during delivery:{" "}
                {activity.storePresenceProof.changes
                  .map(
                    (change) =>
                      `${change.enabled ? "ON" : "OFF"} ${safeTime(change.at)}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </section>
        )}
        {activity.storePresenceProof && (
          <section
            className={`store-proof-evidence ${activity.storePresenceProof.startAttempt?.outcome ?? "pending"}`}
          >
            <div>
              <small>BETA STORE-START PROOF</small>
              <strong>
                {activity.storePresenceProof.startAttempt?.outcome ===
                "confirmed"
                  ? "START CONFIRMED"
                  : activity.storePresenceProof.startAttempt?.outcome ===
                      "not_required"
                    ? "OFF FOR THIS START"
                    : activity.storePresenceProof.startEnabledAtStart
                      ? "ACTIVE · START NOT CONFIRMED"
                      : "OFF"}
              </strong>
            </div>
            <span>
              {activity.storePresenceProof.startRadiusMetres ??
                activity.storePresenceProof.radiusMetres}
              m physical store zone
            </span>
            {activity.storePresenceProof.startAttempt?.outcome ===
              "confirmed" && (
              <p>
                {Math.round(
                  activity.storePresenceProof.startAttempt.distanceMetres ?? 0,
                )}
                m from store pin · GPS ±
                {Math.round(
                  activity.storePresenceProof.startAttempt.accuracy ?? 0,
                )}
                m · {safeTime(activity.storePresenceProof.startAttempt.at)}
              </p>
            )}
          </section>
        )}
        <details
          className={`road-intelligence-status ${osmStatus}`}
          aria-live="polite"
        >
          <summary>
            <span>
              <small>ROAD INTELLIGENCE</small>
              <strong>
                {osmStatus === "loading"
                  ? "Loading road context…"
                  : osmStatus === "ready"
                    ? roadFeatures.length
                      ? `${trafficSignals.length} signals · ${roadFeatures.length} mapped features`
                      : "No supported OSM features mapped"
                    : osmStatus === "stale"
                      ? `${trafficSignals.length} signals · cached context may be stale`
                      : osmStatus === "disabled"
                        ? "OSM disabled · local GPS evidence only"
                        : osmStatus === "unavailable"
                          ? "OSM road context unavailable"
                          : "Preparing road context…"}
              </strong>
            </span>
            <i>⌄</i>
          </summary>
          <em>
            {osmStatus === "loading"
              ? "Complete GPS corridor analysis is running; map movement is visual only."
              : osmStatus === "unavailable"
                ? "OpenStreetMap could not be reached for this route. No Google request was made; reopen after ten minutes to retry, or use Reanalyse routes in Settings to retry now."
                : osmStatus === "stale"
                  ? "Showing the last cached OSM context after a failed refresh. No Google request was made."
                  : "Signals, junctions, crossings, speed limits and road controls use cached OpenStreetMap context."}
          </em>
        </details>
        <details className="route-deep-analysis">
          <summary>
            <span>
              <small>DETAILED ANALYSIS</small>
              <strong>Road, traffic, expected time and extra stats</strong>
            </span>
            <i>⌄</i>
          </summary>
          <div className="route-deep-analysis-body">
            <details className="route-additional-stats">
              <summary>
                <span>ADDITIONAL STATS</span>
                <i>⌄</i>
              </summary>
              <section className="route-metric-grid">
                {cards
                  .filter(
                    ([label]) =>
                      !["TOTAL DELIVERY", "CUSTOMER STOP"].includes(label),
                  )
                  .map(([label, value, detail]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <b>{value}</b>
                      <span>{detail}</span>
                    </div>
                  ))}
              </section>
            </details>
            <section className="route-flow-panel">
              <div className="route-flow-head">
                <span>
                  <small>TRAFFIC / MOVEMENT</small>
                  <strong>GPS-derived route flow</strong>
                </span>
                <div className="route-flow-toggle">
                  <button
                    className={flowView === "time" ? "active" : ""}
                    onClick={() => setFlowView("time")}
                  >
                    BY TIME
                  </button>
                  <button
                    className={flowView === "distance" ? "active" : ""}
                    onClick={() => setFlowView("distance")}
                  >
                    BY DISTANCE
                  </button>
                </div>
              </div>
              <div className="route-flow-grid">
                {(
                  [
                    ["free", "FREE FLOWING", "#24905f"],
                    ["moderate", "MODERATE", "#d6a32d"],
                    ["slow", "SLOW MOVEMENT", "#d77720"],
                    ["heavy", "STOP / START", "#d95049"],
                    ["stationary", "STATIONARY", "#852a2a"],
                  ] as const
                ).map(([key, label, colour]) => {
                  const total = movementTotal(key);
                  return (
                    <div key={key}>
                      <i style={{ background: colour }} />
                      <span>
                        <small>{label}</small>
                        <b>
                          {flowView === "time"
                            ? formatTimingDuration(total.ms)
                            : routeMiles(total.metres)}
                        </b>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p>
                Movement conditions are measured from saved device GPS. Slow or
                stationary movement is not automatically confirmed traffic.
              </p>
            </section>
            <section className="stationary-breakdown-panel">
              <div>
                <small>STATIONARY BREAKDOWN</small>
                <strong>Where recorded stops occurred</strong>
              </div>
              <div className="stationary-breakdown-grid">
                <span>
                  <small>DIRECT SIGNAL STOPS</small>
                  <b>{formatTimingDuration(directSignalMs)}</b>
                  <em>
                    {trafficLightStops.length} matched stop
                    {trafficLightStops.length === 1 ? "" : "s"}
                  </em>
                </span>
                <span>
                  <small>SIGNAL QUEUES</small>
                  <b>{formatTimingDuration(queueMs)}</b>
                  <em>
                    {signalQueues.length} grouped approach
                    {signalQueues.length === 1 ? "" : "es"}
                  </em>
                </span>
                <span>
                  <small>TOTAL SIGNAL IMPACT</small>
                  <b>{formatTimingDuration(signalImpactMs)}</b>
                  <em>No double-counting of child stops</em>
                </span>
                <span>
                  <small>POSSIBLE ROAD DELAY</small>
                  <b>{formatTimingDuration(otherStationaryMs)}</b>
                  <em>GPS-derived · not confirmed traffic</em>
                </span>
              </div>
            </section>
            {signalQueues.length > 0 && (
              <section className="movement-events signal-queue-events">
                <div>
                  <small>SIGNAL QUEUE / GRIDLOCK</small>
                  <strong>Grouped downstream signal approaches</strong>
                </div>
                {signalQueues.map((queue) => {
                  const signal = trafficSignals.find(
                    (item) => item.id === queue.signalId,
                  );
                  return (
                    <article key={`${queue.signalId}-${queue.startIndex}`}>
                      <span>
                        <strong>SIGNAL QUEUE</strong>
                        <small>
                          {safeTime(queue.startAt)}–{safeTime(queue.endAt)}
                        </small>
                      </span>
                      <span>
                        <b>{formatTimingDuration(queue.durationMs)}</b>
                        <small>
                          {routeMiles(queue.queueDistanceMetres)} affected ·{" "}
                          {queue.averageMph.toFixed(1)} mph avg
                        </small>
                      </span>
                      <span>
                        <b>
                          {formatTimingDuration(queue.stationaryMs)} stationary
                        </b>
                        <small>
                          {formatTimingDuration(queue.crawlingMs)} crawling ·{" "}
                          {queue.stopCycles} stop/move cycles
                        </small>
                      </span>
                      <span>
                        <b>{queue.confidence.toUpperCase()} CONFIDENCE</b>
                        <small>
                          {Math.round(queue.signalDistanceAtStart)}m before
                          signal · GPS + {signalSourceLabel(signal)}
                        </small>
                      </span>
                    </article>
                  );
                })}
              </section>
            )}
            <section className="expected-route-panel">
              <div className="expected-route-heading">
                <span>
                  <small>EXPECTED DELIVERY TIME</small>
                  <strong>{expectedRouteHeading}</strong>
                </span>
                <div className="expected-route-heading-actions">
                  {deliveryEfficiency && (
                    <span
                      className={`route-efficiency-badge ${deliveryEfficiency.band}`}
                    >
                      <small>ROUTE EFFICIENCY</small>
                      <strong>
                        {deliveryEfficiency.score}
                        <i>/100</i>
                      </strong>
                    </span>
                  )}
                  {canOfferRouteRefresh && (
                    <button
                      type="button"
                      className="expected-route-recheck"
                      disabled={retryCoolingDown}
                      aria-describedby={
                        retryCoolingDown
                          ? `route-retry-wait-${activity.id}`
                          : undefined
                      }
                      onClick={() => onRequestRouteRefresh?.(activity.id)}
                    >
                      {routeRefreshLabel}
                    </button>
                  )}
                  {expected?.status === "waiting_for_connection" &&
                  isLive &&
                  onRecheckInternet ? (
                    <button
                      type="button"
                      className="expected-route-recheck"
                      onClick={() => onRecheckInternet(activity.id)}
                    >
                      RECHECK INTERNET
                    </button>
                  ) : (
                    expected?.status === "ready" && (
                      <b
                        className={
                          expectedDifference != null && expectedDifference > 0
                            ? "over"
                            : "under"
                        }
                      >
                        {expectedDifferenceLabel}
                      </b>
                    )
                  )}
                </div>
              </div>
              {expectedReady ? (
                <>
                  <div
                    className="expected-route-toggle"
                    role="group"
                    aria-label="Expected time comparison"
                  >
                    <button
                      type="button"
                      className={!includeWeeklyHustle ? "active" : ""}
                      aria-pressed={!includeWeeklyHustle}
                      onClick={() => setIncludeWeeklyHustle(false)}
                    >
                      ROAD ONLY
                    </button>
                    <button
                      type="button"
                      className={includeWeeklyHustle ? "active" : ""}
                      aria-pressed={includeWeeklyHustle}
                      onClick={() => setIncludeWeeklyHustle(true)}
                    >
                      WITH HUSTLE
                    </button>
                  </div>
                  <div className="expected-route-values">
                    <span>
                      <small>EXPECTED TOTAL</small>
                      <b>
                        {formatTimingDuration(
                          expectedComparisonTotalSeconds * 1000,
                        )}
                      </b>
                      <em>{googleRouteBreakdown}</em>
                      <em className="expected-route-hustle">
                        {weeklyHustleDetail}
                      </em>
                    </span>
                    <span>
                      <small>ACTUAL TOTAL</small>
                      <b>
                        {expected?.status === "ready"
                          ? formatTimingDuration(
                              (expected.actualSeconds ?? 0) * 1000,
                            )
                          : "LIVE"}
                      </b>
                      <em>
                        {expected?.status === "ready"
                          ? "Whole run · Single/Double → Back at Store"
                          : "Completes at Back at Store"}
                      </em>
                    </span>
                  </div>
                  <p>
                    {isDoubleGoogleRoute
                      ? "Customer points: Customer 1 and Customer 2 Delivered GPS · Google follows the saved order, then returns to store."
                      : expected?.customer?.source === "manual_delivered"
                        ? "Customer point: Manual Delivered GPS"
                        : expected?.customer?.source ===
                            "user_selected_route_point"
                          ? "Customer point: User-selected route point"
                          : expected?.customer?.source === "detected_stop"
                            ? "Customer point: GPS-detected stop"
                            : "Customer point: best available GPS estimate"}{" "}
                    ·{" "}
                    {expected?.routingSource === "google_routes"
                      ? expected?.travelMode === "walking"
                        ? includeWeeklyHustle
                          ? "Google walking routes plus your recorded weekly store hustle. Pedestrian routes do not use live traffic."
                          : "Google walking routes only; pedestrian routes do not use live traffic and weekly store hustle is hidden for this view."
                        : includeWeeklyHustle
                          ? "Google traffic-aware road routes plus your recorded weekly store hustle."
                          : "Google traffic-aware road routes only; weekly store hustle is hidden for this view."
                      : "Legacy standard road route; it will not request current traffic."}
                  </p>
                  {deliveryEfficiency && (
                    <p className="route-efficiency-explain">
                      100 means the completed run matched or beat this
                      benchmark; it never rewards a quicker run above 100. The
                      score changes with the Road only / With hustle view.
                    </p>
                  )}
                </>
              ) : expected?.status === "waiting_for_connection" ? (
                <p>
                  Waiting for two successful uncached connection checks, ten
                  seconds apart. Checks continue for up to five minutes; no
                  Google request has been sent yet.
                </p>
              ) : expected?.status === "connection_verified" ? (
                <p>
                  Stable internet connection confirmed. Starting the two
                  permitted Google route calls now.
                </p>
              ) : (
                <p
                  id={
                    retryCoolingDown
                      ? `route-retry-wait-${activity.id}`
                      : undefined
                  }
                >
                  {nativeGoogleSetupMissing
                    ? googleRoutesConfigured
                      ? "Delivered GPS point saved. Tap Try Google Routing to run the normal connection checks and request this delivery’s snapshot."
                      : "Delivered GPS point saved. Chrome and the Android app keep separate local settings; set up the restricted Google Routes key in this app to capture the snapshot."
                    : expectedUnavailableReason
                      ? `Google route snapshot unavailable: ${expectedUnavailableReason}. GPS route evidence remains available and no delivery timing is changed.${retryCoolingDown ? ` Retry unlocks in ${retryState.remainingMinutes} min.` : ""}`
                      : isLive
                        ? activity.type === "double_delivery"
                          ? "This is captured after Customer 2 is Delivered, using the ordered Customer 1 and Customer 2 GPS points."
                          : "This can be captured only when you tap Delivered, using that customer GPS point."
                        : "No Google snapshot was captured for this delivery. GPS route evidence remains available and no delivery timing is changed."}
                </p>
              )}
            </section>
            <div className="route-analysis-disclaimer">
              Route analysis is derived from device GPS and may contain normal
              GPS inaccuracies. Traffic/road delay is inferred from movement
              unless recorded by an external traffic provider.
            </div>
          </div>
        </details>
        <details className="route-deep-analysis route-events-analysis">
          <summary>
            <span>
              <small>EVENTS & TIMELINE</small>
              <strong>
                Stops, same-road comparison and full evidence sequence
              </strong>
            </span>
            <i>⌄</i>
          </summary>
          <div className="route-deep-analysis-body">
            {(movement.stationary.length > 0 ||
              movement.segments.some(
                (segment) =>
                  (segment.classification === "slow" ||
                    segment.classification === "heavy") &&
                  segment.durationMs >= 15_000,
              )) && (
              <section className="movement-events">
                <div>
                  <small>TRAFFIC / MOVEMENT EVENTS</small>
                  <strong>GPS-derived context</strong>
                </div>
                {[
                  ...movement.stationary.map((segment) => ({
                    segment,
                    label:
                      manualEventLabel(segment) ??
                      (customerPoint &&
                      distanceMetres(
                        points[Math.min(points.length - 1, segment.startIndex)]
                          .latitude,
                        points[Math.min(points.length - 1, segment.startIndex)]
                          .longitude,
                        customerPoint.latitude,
                        customerPoint.longitude,
                      ) <= customerRadius
                        ? "CUSTOMER STOP"
                        : trafficLightStops.some(
                              (stop) =>
                                stop.startedAt === segment.startAt &&
                                stop.endedAt === segment.endAt,
                            )
                          ? "TRAFFIC LIGHT STOP"
                          : "STATIONARY / POSSIBLE ROAD DELAY"),
                  })),
                  ...movement.segments
                    .filter(
                      (segment) =>
                        (segment.classification === "slow" ||
                          segment.classification === "heavy") &&
                        segment.durationMs >= 15_000,
                    )
                    .map((segment) => ({
                      segment,
                      label:
                        manualEventLabel(segment) ??
                        (segment.classification === "heavy"
                          ? "STOP / START MOVEMENT"
                          : "SLOW MOVEMENT"),
                    })),
                ]
                  .slice(0, 6)
                  .map(({ segment, label }, index) => (
                    <article key={`${label}-${index}-${segment.startAt}`}>
                      <span>
                        <strong>{label}</strong>
                        <small>
                          {timeFormat.format(new Date(segment.startAt))}–
                          {timeFormat.format(new Date(segment.endAt))}
                        </small>
                      </span>
                      <span>
                        <b>{formatTimingDuration(segment.durationMs)}</b>
                        <small>
                          {segment.distanceMetres
                            ? `${routeMiles(segment.distanceMetres)} · ${segment.averageMph.toFixed(1)} mph`
                            : "GPS-derived"}
                        </small>
                      </span>
                    </article>
                  ))}
              </section>
            )}
            <section className="same-road-panel">
              <div>
                <small>SAME-ROAD COMPARISON</small>
                <strong>
                  {movement.sameRoad.length
                    ? `${routeMiles(movement.sameRoad.reduce((sum, item) => sum + item.sharedMetres, 0))} compared`
                    : "No meaningful same-road comparison"}
                </strong>
              </div>
              {strongestSameRoad ? (
                <>
                  <p>
                    GPS movement conditions were compared locally across road
                    sections travelled both outbound and on the return.
                  </p>
                  <div className="same-road-values">
                    <span>
                      <small>OUTBOUND</small>
                      <b>{strongestSameRoad.outboundMph.toFixed(1)} mph</b>
                      <em>
                        {formatTimingDuration(strongestSameRoad.outboundMs)}
                      </em>
                    </span>
                    <span>
                      <small>RETURN</small>
                      <b>{strongestSameRoad.returnMph.toFixed(1)} mph</b>
                      <em>
                        {formatTimingDuration(strongestSameRoad.returnMs)}
                      </em>
                    </span>
                    <span>
                      <small>OBSERVED DIFFERENCE</small>
                      <b>
                        +
                        {formatTimingDuration(
                          Math.max(
                            0,
                            strongestSameRoad.outboundMs -
                              strongestSameRoad.returnMs,
                          ),
                        )}
                      </b>
                      <em>Outbound over shared section</em>
                    </span>
                  </div>
                </>
              ) : (
                <p>
                  Outbound and return routes did not share enough road distance
                  for a reliable comparison. No Google request was made.
                </p>
              )}
            </section>
            <div className="route-evidence-timeline">
              <div>
                <span>
                  <small>DELIVERY STARTED</small>
                  <strong>
                    {new Date(activity.start).toLocaleTimeString("en-GB")}
                  </strong>
                </span>
                <b>
                  {analysis?.leaveMs != null
                    ? `START → EXIT ${formatTimingDuration(analysis.leaveMs)}`
                    : ""}
                </b>
              </div>
              <div>
                <span>
                  <small>GEOFENCE EXIT</small>
                  <strong>
                    {activity.storeExitAt
                      ? new Date(activity.storeExitAt).toLocaleTimeString(
                          "en-GB",
                        )
                      : "Not observed"}
                  </strong>
                </span>
                <b>LEFT STORE</b>
              </div>
              {customerPoint && (
                <div>
                  <span>
                    <small>
                      {customer?.source === "manual_delivered"
                        ? "DELIVERED"
                        : customer?.source === "user_selected_route_point"
                          ? "AT CUSTOMER HOUSE"
                          : "PROBABLE CUSTOMER AREA"}
                    </small>
                    <strong>
                      {new Date(customerPoint.timestamp).toLocaleTimeString(
                        "en-GB",
                      )}{" "}
                      · ±{Math.round(customerPoint.accuracy)}m
                    </strong>
                  </span>
                  <b>
                    {customerStopMs > 0
                      ? `${customer?.source === "manual_delivered" ? "MANUAL" : customer?.source === "user_selected_route_point" ? "USER SELECTED" : "GPS-DERIVED"} · ${formatTimingDuration(customerStopMs)}`
                      : customer?.source === "manual_delivered"
                        ? "MANUAL GPS"
                        : customer?.source === "user_selected_route_point"
                          ? "USER SELECTED"
                          : customer?.source === "detected_stop"
                            ? "GPS DETECTED"
                            : customer
                              ? "GPS-DERIVED"
                              : ""}
                  </b>
                </div>
              )}
              <div>
                <span>
                  <small>GEOFENCE ENTRY</small>
                  <strong>
                    {activity.storeEntryAt
                      ? new Date(activity.storeEntryAt).toLocaleTimeString(
                          "en-GB",
                        )
                      : "Not observed"}
                  </strong>
                </span>
                <b>RETURNED TO STORE</b>
              </div>
              <div>
                <span>
                  <small>BACK AT STORE</small>
                  <strong>
                    {new Date(
                      activity.backAtStoreAt ??
                        activity.end ??
                        route.completedAt ??
                        activity.start,
                    ).toLocaleTimeString("en-GB")}
                  </strong>
                </span>
                <b>
                  {analysis?.arrivalButtonMs != null
                    ? `ENTRY → BUTTON ${formatTimingDuration(analysis.arrivalButtonMs)}`
                    : ""}
                </b>
              </div>
            </div>
          </div>
        </details>
        {(customerStopMs >= CUSTOMER_WAIT_REVIEW_MS ||
          activity.customerWaitExplanation) && (
          <section className="customer-wait-note-panel">
            <div>
              <p className="eyebrow">CUSTOMER WAIT NOTE</p>
              <h3>{formatTimingDuration(customerStopMs)} at customer</h3>
              <p>
                {activity.customerWaitExplanation?.status === "recorded"
                  ? "Driver-entered context only. It does not change the GPS timing, route, mileage or traffic evidence."
                  : "The recorded customer wait was over three minutes. Add a short explanation when you have time."}
              </p>
            </div>
            {activity.customerWaitExplanation?.status === "recorded" ? (
              <>
                <div className="customer-wait-reason-list">
                  {activity.customerWaitExplanation.reasons.map((reason) => (
                    <span key={reason}>{customerWaitReasonLabel(reason)}</span>
                  ))}
                </div>
                {activity.customerWaitExplanation.note && (
                  <blockquote>
                    {activity.customerWaitExplanation.note}
                  </blockquote>
                )}
                <small>
                  DRIVER NOTE · saved{" "}
                  {safeTime(activity.customerWaitExplanation.recordedAt)}
                </small>
                <button
                  type="button"
                  onClick={() => onEditCustomerWait?.(routeActivity)}
                >
                  EDIT CUSTOMER WAIT NOTE
                </button>
              </>
            ) : (
              <button
                type="button"
                className="confirm-primary"
                onClick={() => onEditCustomerWait?.(routeActivity)}
              >
                ADD CUSTOMER WAIT NOTE
              </button>
            )}
          </section>
        )}
        {selectedRoadEvent && (
          <div
            className="route-event-classifier-backdrop"
            role="presentation"
            onClick={() => {
              setSelectedRoadEvent(null);
              setLocalSignalDraft(null);
              setPendingLocalSignalEvent(null);
              setPickingLocalSignal(false);
            }}
          >
            <div
              className="route-event-classifier"
              role="dialog"
              aria-modal="true"
              aria-labelledby="route-event-classifier-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="route-event-classifier-head">
                <div>
                  <p className="eyebrow">CLASSIFY EVENT</p>
                  <h3 id="route-event-classifier-title">Recorded road delay</h3>
                  <small>
                    {safeTime(selectedRoadEvent.startAt)}–
                    {safeTime(selectedRoadEvent.endAt)} ·{" "}
                    {formatTimingDuration(selectedRoadEvent.durationMs)} · GPS
                    evidence unchanged
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRoadEvent(null);
                    setLocalSignalDraft(null);
                    setPendingLocalSignalEvent(null);
                    setPickingLocalSignal(false);
                  }}
                  aria-label="Close event classifier"
                >
                  ×
                </button>
              </div>
              <p className="settings-help">
                Choose a local explanation for this stationary event. A manual
                label is shown as MANUALLY CLASSIFIED and never presented as
                independent OSM evidence.
              </p>
              <div className="route-event-options">
                <button onClick={() => classifyRoadEvent("traffic_signal")}>
                  TRAFFIC SIGNAL / SIGNAL QUEUE
                  <small>
                    {nearbySignalForEvent
                      ? "Nearby road signal found"
                      : "No nearby OSM signal found"}
                  </small>
                </button>
                <button onClick={() => classifyRoadEvent("general_traffic")}>
                  GENERAL TRAFFIC / CONGESTION
                </button>
                <button onClick={() => classifyRoadEvent("junction")}>
                  JUNCTION / GIVE-WAY
                </button>
                <button
                  onClick={() => classifyRoadEvent("pedestrian_crossing")}
                >
                  PEDESTRIAN CROSSING
                </button>
                <button onClick={() => classifyRoadEvent("customer_parking")}>
                  CUSTOMER / PARKING
                </button>
                <button onClick={() => classifyRoadEvent("other_road_delay")}>
                  OTHER ROAD DELAY
                </button>
                <button onClick={() => classifyRoadEvent("unclassified")}>
                  LEAVE UNCLASSIFIED
                </button>
              </div>
              {!nearbySignalForEvent && (
                <div className="local-signal-correction">
                  <p className="eyebrow">ADD MISSING TRAFFIC SIGNAL</p>
                  <strong>Teach Shift Tracker this junction once</strong>
                  <small>
                    Saved locally as USER CONFIRMED LOCAL. It will not edit
                    OpenStreetMap or send a Google request.
                  </small>
                  <div className="local-signal-actions">
                    <button
                      type="button"
                      onClick={useStopLocationForLocalSignal}
                    >
                      USE STOP LOCATION
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedRoadEvent) return;
                        setPendingLocalSignalEvent(selectedRoadEvent);
                        setLocalSignalDraft(null);
                        setSelectedRoadEvent(null);
                        setPickingLocalSignal(true);
                      }}
                    >
                      PICK SIGNAL ON MAP
                    </button>
                  </div>
                  {localSignalDraft && (
                    <div className="local-signal-draft">
                      <span>
                        Selected position ·{" "}
                        {localSignalDraft.latitude.toFixed(6)},{" "}
                        {localSignalDraft.longitude.toFixed(6)}
                      </span>
                      <button
                        type="button"
                        className="confirm-primary"
                        onClick={saveLocalSignal}
                      >
                        SAVE LOCAL SIGNAL
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <footer>
          <button className="confirm-primary" onClick={onClose}>
            CLOSE ROUTE
          </button>
          <span>Local evidence only · no customer names or addresses</span>
        </footer>
      </div>
    </div>
  );
}
