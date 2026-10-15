import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SusuError,
  addMember,
  closeWeek,
  createGroup,
  formatMoney,
  getReport,
  parseMoney,
  recordContribution,
} from '../src/domain.js';
import { loadGroup, saveGroup } from '../src/storage.js';

function circle(names = ['Ama', 'Kofi', 'Esi'], weekly = '50.00') {
  const group = createGroup('Akwaaba Circle', parseMoney(weekly));
  for (const name of names) addMember(group, name);
  return group;
}

test('parses and formats GHS exactly in integer pesewas', () => {
  assert.equal(parseMoney('50.00'), 5000);
  assert.equal(parseMoney('0.5'), 50);
  assert.equal(formatMoney(5_050), 'GH₵ 50.50');
});

test('rejects zero, negative, over-precision, and unsafe amounts', () => {
  for (const input of ['0', '-1.00', '1.001', '90071992547410.00', 'abc']) {
    assert.throws(() => parseMoney(input), SusuError);
  }
  assert.throws(() => parseMoney('  '), SusuError);
});

test('rejects blank and duplicate member names regardless of case', () => {
  const group = createGroup('Circle', 5000);
  assert.throws(() => addMember(group, '  '), SusuError);
  addMember(group, 'Ama');
  assert.throws(() => addMember(group, 'ama'), /already a member/);
});

test('records partial payments and reports the exact remaining balance', () => {
  const group = circle();
  const payment = recordContribution(group, 'esi', 3000);
  assert.deepEqual(payment, { member: 'Esi', paidPesewas: 3000, remainingPesewas: 2000 });
  assert.equal(getReport(group).members[2].owedPesewas, 2000);
});

test('rejects unknown members, zero payments, and overpayments', () => {
  const group = circle();
  assert.throws(() => recordContribution(group, 'Yaw', 500), /not a member/);
  assert.throws(() => recordContribution(group, 'Ama', 0), /positive amount/);
  recordContribution(group, 'Ama', 4000);
  assert.throws(() => recordContribution(group, 'Ama', 1001), /owes GH₵ 10\.00/);
});

test('keeps the week open and reports each member who owes money', () => {
  const group = circle();
  recordContribution(group, 'Ama', 5000);
  recordContribution(group, 'Kofi', 5000);
  recordContribution(group, 'Esi', 3000);
  const result = closeWeek(group);
  assert.deepEqual(result, {
    closed: false,
    week: 1,
    owed: [{ member: 'Esi', owedPesewas: 2000 }],
  });
  assert.equal(group.currentWeek, 1);
  assert.equal(group.payoutHistory.length, 0);
});

test('pays the first member only after every member pays in full', () => {
  const group = circle();
  for (const name of ['Ama', 'Kofi', 'Esi']) recordContribution(group, name, 5000);
  assert.deepEqual(closeWeek(group), {
    closed: true,
    payout: { week: 1, recipient: 'Ama', amountPesewas: 15000 },
  });
  assert.equal(group.currentWeek, 2);
  assert.equal(getReport(group).nextRecipient, 'Kofi');
});

test('rotates payouts in joining order and repeats after the last member', () => {
  const group = circle(['Ama', 'Kofi']);
  const recipients = [];
  for (let i = 0; i < 3; i += 1) {
    for (const name of ['Ama', 'Kofi']) recordContribution(group, name, 5000);
    recipients.push(closeWeek(group).payout.recipient);
  }
  assert.deepEqual(recipients, ['Ama', 'Kofi', 'Ama']);
});

test('prevents adding members once contributions or the first payout have started', () => {
  const group = circle(['Ama', 'Kofi']);
  recordContribution(group, 'Ama', 1);
  assert.throws(() => addMember(group, 'Esi'), /contributions have been recorded/);
  const completedGroup = circle(['Ama', 'Kofi']);
  for (const name of ['Ama', 'Kofi']) recordContribution(completedGroup, name, 5000);
  closeWeek(completedGroup);
  assert.throws(() => addMember(completedGroup, 'Esi'), /before the first week is closed/);
});

test('persists a group and preserves exact contributions across reloads', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'akwaaba-susu-'));
  const filePath = path.join(directory, 'susu.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const group = circle();
  recordContribution(group, 'Ama', 275);
  await saveGroup(filePath, group);
  assert.equal(await loadGroup(filePath).then((saved) => saved.currentContributions.ama), 275);
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(raw.version, 1);
});

test('reports missing, corrupt, and unsupported save files clearly', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'akwaaba-susu-'));
  const filePath = path.join(directory, 'susu.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(await loadGroup(filePath), null);
  await saveGroup(filePath, circle());
  await writeFile(filePath, '{bad', 'utf8');
  await assert.rejects(loadGroup(filePath), /not valid JSON/);
  await writeFile(filePath, '{"version":99}', 'utf8');
  await assert.rejects(loadGroup(filePath), /unsupported/);
});

test('prevents closing a week before the group has members', () => {
  assert.throws(() => closeWeek(createGroup('Circle', 5000)), /at least one member/);
});
