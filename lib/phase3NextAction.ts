/** Read-only labels for the existing live-shift controls; never authorizes a transition. */
export type LiveActionState = {
  status: 'working' | 'break';
  delivery: boolean;
  allCustomersDelivered: boolean;
  captureBusy: boolean;
  backAtStoreAllowed: boolean;
  backAtStoreLabel: string;
  blocked: boolean;
  currentTaskName: string | null;
  cooldownSeconds: number;
};
export function phase3NextAction(state: LiveActionState): { label: string; detail: string } {
  if (state.delivery) {
    if (state.captureBusy) return { label: 'Capturing GPS…', detail: 'Wait for the existing Delivered control to finish.' };
    if (!state.allCustomersDelivered) return { label: 'Mark customer delivered', detail: 'Use Delivered when you reach the customer.' };
    return { label: state.backAtStoreAllowed ? 'Back at store' : state.backAtStoreLabel, detail: state.backAtStoreAllowed ? 'Use Back at Store to complete this run.' : 'The existing return control shows the GPS or store-proof requirement.' };
  }
  if (state.status === 'break') return { label: 'End break', detail: 'Open Break Controls to resume paid work.' };
  if (state.blocked) return { label: 'End blocked time', detail: 'Use End Blocked Time when the interruption ends.' };
  if (state.cooldownSeconds > 0) return { label: `Delivery cooldown · ${state.cooldownSeconds}s`, detail: 'Delivery controls unlock when the existing cooldown ends.' };
  if (state.currentTaskName) return { label: 'Continue current task', detail: state.currentTaskName };
  return { label: 'Start a delivery or task', detail: 'Choose Single, Double, or Today’s Cleaning below.' };
}
