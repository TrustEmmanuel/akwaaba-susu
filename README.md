# Akwaaba Susu

A Ghana-inspired, terminal-based rotating savings circle manager. *Susu* brings the group's weekly contributions together and pays the pot to members in the order they joined. This app keeps the ledger in exact pesewas, lets members pay in parts, and holds the payout until every contribution is complete.

## Requirements

- Node.js 20 or later
- No third-party packages or install step

## Run the program

```sh
npm start
```

On first launch, enter a group name and its fixed weekly contribution in GHS. Add members using their names or unique IDs, record a payment (partial payments are fine), close the week, or view the current report and payout history. The app saves the group automatically to `.susu-data.json` in the current directory. That local ledger is excluded from Git.

The terminal menu works without color on noninteractive output and when `NO_COLOR` is set.

## Run the tests

```sh
npm test
```

The Node.js built-in test runner covers exact money parsing, invalid and duplicate inputs, partial payments, a week that cannot yet close, ordered and repeating payouts, membership rules, and persistent storage.

## Example

Create a circle at `50.00` GHS per member; add Ama, Kofi, and Esi. If Ama and Kofi each pay `50.00`, and Esi pays `30.00`, closing the week reports that Esi owes `GH₵ 20.00` and makes no payout. Once Esi pays the balance, the next close pays `GH₵ 150.00` to Ama and advances the next payout to Kofi.
