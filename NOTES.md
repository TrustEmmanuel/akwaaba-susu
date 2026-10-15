# Assumptions and decisions

- All amounts are stored as safe integer pesewas, never binary floating-point money. Enter GHS as a positive amount with up to two decimal places.
- The group has one fixed weekly contribution per member. The payout is the contribution multiplied by the number of members.
- Member names are their identifiers: duplicates are prevented without regard to letter case, while the original spelling is shown in reports.
- Members can be added only before the first contribution of week one. There are no member-removal or weekly-amount-change controls.
- Every member must pay the full contribution before a week closes. An incomplete close leaves both the week and any payments unchanged.
- Payout order follows joining order. After every member has received one payout, the rotation repeats from the first member.
- The program manages one locally saved group per working directory. The JSON ledger is written atomically and should be backed up if it contains important records.
- No fees, missed-week penalties, withdrawals, multiple groups, or simultaneous multi-user access are modeled.

## What I would improve with more time

- Add a tested recovery and backup workflow for the local ledger.
- Introduce accounts and a shared database for groups used by multiple people or devices.
- Add explicit member IDs, audit records for payment reversals, and optional payout confirmations.
- Add configurable rules for missed contributions and member departures.
