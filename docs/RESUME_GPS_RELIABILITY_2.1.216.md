# Web 2.1.216 — resume and GPS durability

Background/resume no longer performs a full immutable rewrite and save when no
route is due for expiry. Derived History/reporting views are memoised so timer
ticks do not repeatedly rebuild every historical shift. These changes reduce
the work competing with the installed app's first resumed paint.

Native GPS samples are now acknowledged to Android only after the complete
validated AppData document commits successfully to IndexedDB. Samples remain in
the encrypted Android journal if persistence fails, are replay-safe, and cannot
be applied to a newer delivery session. Every accepted native fix now batches
its route, comparison-geofence and Real-geofence mutations into one canonical
save. A failed optimistic save is explicitly re-saved before the retained sample
can be acknowledged. No validation, save protection, stored
shift, delivery, task segment, route evidence, or bad-delivery flag is removed.

The existing bad-delivery checkbox remains available during an active delivery
and in History. It keeps pay/reimbursement and the delivery count while excluding
that run from GPS and Hustle statistics.

Android shell source 2.2.68 adds bounded frozen-renderer recovery: one automatic
WebView replacement followed by an explicit reload choice if needed. It does
not stop the native location service or clear WebView/IndexedDB/localStorage.
The established Android repository builds and signs the in-place update through
its existing protected release workflow.
