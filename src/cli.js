import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SusuError,
  addMember,
  closeWeek,
  createGroup,
  formatMoney,
  getReport,
  parseMoney,
  recordContribution,
} from './domain.js';
import { loadGroup, saveGroup } from './storage.js';

const useColor = Boolean(stdout.isTTY && !process.env.NO_COLOR);
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const gold = (text) => paint('33;1', text);
const green = (text) => paint('32;1', text);
const muted = (text) => paint('90', text);
const line = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

function printWelcome(group) {
  console.log(`\n${gold(line)}`);
  console.log(`${gold('  AKWAABA  /  SUSU CIRCLE')}`);
  console.log(`${gold('  A little rhythm. A stronger community.')}`);
  console.log(gold(line));
  if (group) {
    console.log(`  ${group.name}  ·  ${formatMoney(group.weeklyContributionPesewas)} each week`);
  } else {
    console.log('  Your community savings, thoughtfully in order.');
  }
  console.log();
}

function printReport(group) {
  const report = getReport(group);
  console.log(`\n${gold(`WEEK ${report.currentWeek}  /  ${report.groupName}`)}`);
  console.log(`${line}`);
  console.log(`Next payout: ${report.nextRecipient ?? 'Add your first member'}\n`);

  if (report.members.length === 0) {
    console.log(muted('No members yet. Add your circle to get started.'));
  }
  for (const member of report.members) {
    const status = member.paidInFull ? green('PAID IN FULL') : `OWES ${formatMoney(member.owedPesewas)}`;
    console.log(`  ${member.name.padEnd(20)} ${formatMoney(member.paidPesewas).padEnd(15)} ${status}`);
  }

  console.log(`\n${gold('PAYOUT HISTORY')}`);
  if (report.payoutHistory.length === 0) {
    console.log(muted('No payouts yet. The first payout follows the first completed week.'));
  } else {
    for (const payout of report.payoutHistory) {
      console.log(`  Week ${payout.week}  ·  ${payout.recipient}  ·  ${formatMoney(payout.amountPesewas)}`);
    }
  }
  console.log();
}

async function askRequired(rl, label) {
  const answer = (await rl.question(label)).trim();
  if (!answer) throw new SusuError('This value cannot be empty.');
  return answer;
}

async function runApp({ dataFile = path.join(process.cwd(), '.susu-data.json') } = {}) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    let group = await loadGroup(dataFile);
    printWelcome(group);

    if (!group) {
      const name = await askRequired(rl, 'Name your group: ');
      const contribution = parseMoney(await askRequired(rl, 'Weekly contribution in GHS (e.g. 50.00): '));
      group = createGroup(name, contribution);
      await saveGroup(dataFile, group);
      console.log(green(`\nYour susu circle "${group.name}" is ready.\n`));
    }

    let running = true;
    while (running) {
      console.log('  1. Add a member');
      console.log('  2. Record a contribution');
      console.log('  3. Close this week');
      console.log('  4. View report');
      console.log('  5. Exit\n');

      const choice = (await rl.question('Choose an option: ')).trim();
      try {
        switch (choice) {
          case '1': {
            const name = await askRequired(rl, 'Member name or ID: ');
            addMember(group, name);
            await saveGroup(dataFile, group);
            console.log(green(`${name} is now part of the circle.\n`));
            break;
          }
          case '2': {
            const member = await askRequired(rl, 'Member name or ID: ');
            const amount = parseMoney(await askRequired(rl, 'Amount paid in GHS: '));
            const result = recordContribution(group, member, amount);
            await saveGroup(dataFile, group);
            console.log(
              green(
                `${result.member} has paid ${formatMoney(amount)}. ${
                  result.remainingPesewas === 0
                    ? 'This week is paid in full.'
                    : `${formatMoney(result.remainingPesewas)} remains.`
                }\n`,
              ),
            );
            break;
          }
          case '3': {
            const result = closeWeek(group);
            await saveGroup(dataFile, group);
            if (!result.closed) {
              console.log(gold(`\nWeek ${result.week} stays open. Outstanding contributions:`));
              for (const entry of result.owed) {
                console.log(`  ${entry.member} owes ${formatMoney(entry.owedPesewas)}`);
              }
              console.log();
            } else {
              console.log(
                green(
                  `\nWeek ${result.payout.week} is complete! ${result.payout.recipient} receives ${formatMoney(result.payout.amountPesewas)}.\n`,
                ),
              );
            }
            break;
          }
          case '4':
            printReport(group);
            break;
          case '5':
            running = false;
            console.log('Medase. See you at the next contribution. 👋');
            break;
          default:
            console.log(muted('Choose an option from 1 to 5.\n'));
        }
      } catch (error) {
        if (!(error instanceof SusuError)) throw error;
        console.log(paint('31;1', `\n${error.message}\n`));
      }
    }
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runApp().catch((error) => {
    console.error(`\nSusu could not continue: ${error.message}`);
    process.exitCode = 1;
  });
}
