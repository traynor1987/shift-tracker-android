# Web 2.1.214 — bad delivery exclusion

A reversible checkbox on the active delivery, Tasks → Today delivery list, and History → delivery details keeps the Single/Double event and reimbursement while excluding unreliable GPS and timing statistics. History changes use its existing Save action. Existing raw evidence is preserved so the exclusion can be reversed. This is a statistics exclusion, not a change to native GPS ownership or delivery completion/location assistance.

The optional `ActivityRecord.badDelivery` flag is strictly boolean and survives validated backups and IndexedDB reload. No migration clears data; missing flags retain existing behaviour. Both Real and Domino’s timing projections exclude flagged runs. GPS totals, customer timing averages, CSV/shared/PDF reports and route summaries exclude them. Paid shift time, manually entered mileage and delivery payment/count remain intact.

Mileage checkpoints stay measured against the original cumulative GPS distance. Only eligible distance beyond that checkpoint contributes to live mileage. Excluding an earlier run therefore cannot swallow later good mileage.

Missing deliveries can be added through History’s Single/Double count correction. That existing path adds reimbursement events without fabricated route or task history. The two owner-reported missing deliveries have not been automatically recreated because their run types are unknown.

Validation: Europe/London critical/domain/persistence/backup/report subset 253 passed; UTC focused subset 193 passed. New tests cover Single/Double, active/idempotent marking, reversal, strict validation, backup/IndexedDB, count correction, mileage baseline and report/UI isolation. Existing task timing recovery and timestamp protection remain covered. Production Vinext build and Sites artifact validator are required before publication.
