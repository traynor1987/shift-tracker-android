package site.chatgpt.traynor1987.dominosshifttracker;

/** Observation only. Mirrors the protected Web evaluator; never completes a delivery.
 * Timestamps are provider acquisition times. A gap cannot become an exact crossing. */
public final class NativeReturnPolicy {
 public String presence="unknown", pending="unknown";
 public int count=0;
 public long lastAt=0, pendingAt=0, exitAt=0, firstInsideAt=0, confirmedAt=0, exactEntryAt=0;
 public boolean pendingObserved=false;
 public boolean observe(long at,double distance,double accuracy) {
  if(at<=lastAt || at<=0 || !Double.isFinite(distance) || distance<0 || !Double.isFinite(accuracy) || accuracy<0 || accuracy>65) return false;
  String candidate=distance<=35?"inside":distance>=47?"outside":presence;
  if(candidate.equals("unknown")) return false;
  boolean continuous=lastAt==0 || at-lastAt<=60000;
  boolean continuing=continuous && pending.equals(candidate) && pendingAt>0;
  count=continuing?count+1:1;
  if(!continuing){pendingAt=at;pendingObserved=continuous;}
  pending=candidate;lastAt=at;
  boolean conclusive=candidate.equals("inside")?distance+accuracy<=35:distance-accuracy>=47;
  if(count<(presence.equals("unknown")||conclusive?1:2)) return false;
  String previous=presence;presence=candidate;
  long transitionAt=pendingAt;boolean observed=pendingObserved;
  pending="unknown";count=0;pendingAt=0;
  if(previous.equals("inside") && candidate.equals("outside")) {
   // An unobserved exit cannot authorise return.
   exitAt=observed?transitionAt:0;firstInsideAt=0;confirmedAt=0;exactEntryAt=0;
  }
  if(candidate.equals("inside") && exitAt>0 && transitionAt-exitAt<60000){presence="outside";return false;}
  if(candidate.equals("inside") && distance<=35 && exitAt>0 && confirmedAt==0) {
   if(firstInsideAt==0) firstInsideAt=transitionAt;confirmedAt=at;
   if(previous.equals("outside")) exactEntryAt=observed?transitionAt:0;
   return true;
  }
  return false;
 }
}
