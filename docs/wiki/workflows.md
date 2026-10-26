# Workflows & State Machines

## 1. Artist Verification Lifecycle
```
[Artist Registers & Completes Onboarding]
                   │
                   ▼
       [Status: PENDING_VERIFICATION]
                   │
         Admin Review Panel
          ├── Approve ──▶ [Status: VERIFIED] (Searchable, visible to customers)
          └── Reject  ──▶ [Status: REJECTED] (Prompted to fix details)
```
- **Rule**: Only artists with `verificationStatus === 'VERIFIED'` appear in customer search and can receive booking requests.

---

## 2. Request-to-Book Lifecycle
```
[Customer Selects Available Slot from 15-Day Calendar]
                   │
                   ▼
          [Status: REQUESTED]
                   │
        Artist Review in Dashboard
          ├── Accept  ──▶ [Status: ACCEPTED] (Slot locked on calendar)
          └── Decline ──▶ [Status: DECLINED] (Slot released back to open pool)
```
- A dedicated chat thread is created when a booking enters `REQUESTED` so the customer and artist can converse regarding set times, sound setup, and logistics.
