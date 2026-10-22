package site.chatgpt.traynor1987.dominosshifttracker;
/** Pure sampling policy; delivery tracking remains independently enabled. */
public final class ShiftMonitoringPolicy {
 public static String mode(boolean enabled, boolean shiftActive, boolean delivery, boolean highAccuracy) {
  if(!shiftActive) return "stopped";
  if(delivery) return "delivery";
  if(!enabled) return "stopped";
  return highAccuracy?"high_accuracy":"adaptive";
 }
}
