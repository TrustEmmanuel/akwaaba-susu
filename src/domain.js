export class SusuError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SusuError';
  }
}

export function parseMoney(value) {
  const input = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input);

  if (!match) {
    throw new SusuError('Enter a valid GHS amount with no more than two decimal places.');
  }

  const whole = BigInt(match[1]);
  const pesewas = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  const amount = whole * 100n + pesewas;

  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SusuError('The amount must be positive and within the supported range.');
  }

  return Number(amount);
}

export function formatMoney(pesewas) {
  if (!Number.isSafeInteger(pesewas) || pesewas < 0) {
    throw new SusuError('Cannot format an invalid GHS amount.');
  }

  const whole = Math.floor(pesewas / 100).toLocaleString('en-GH');
  const fraction = String(pesewas % 100).padStart(2, '0');
  return `GH₵ ${whole}.${fraction}`;
}

export function createGroup(name, weeklyContributionPesewas) {
  const groupName = String(name).trim();

  if (!groupName) {
    throw new SusuError('The group name cannot be empty.');
  }

  if (!Number.isSafeInteger(weeklyContributionPesewas) || weeklyContributionPesewas <= 0) {
    throw new SusuError('The weekly contribution must be a positive amount.');
  }

  return {
    name: groupName,
    weeklyContributionPesewas,
    members: [],
    currentWeek: 1,
    nextPayoutMemberIndex: 0,
    currentContributions: {},
    payoutHistory: [],
  };
}

function findMember(group, identifier) {
  const key = String(identifier).trim().toLocaleLowerCase('en');
  return group.members.find((member) => member.id === key);
}

export function addMember(group, name) {
  const displayName = String(name).trim();

  if (!displayName) {
    throw new SusuError('A member name or ID is required.');
  }

  if (group.currentWeek !== 1 || group.payoutHistory.length > 0) {
    throw new SusuError('Members can only be added before the first week is closed.');
  }

  if (Object.values(group.currentContributions).some((amount) => amount > 0)) {
    throw new SusuError('Members cannot be added after contributions have been recorded.');
  }

  const id = displayName.toLocaleLowerCase('en');
  if (group.members.some((member) => member.id === id)) {
    throw new SusuError(`"${displayName}" is already a member.`);
  }

  if (group.weeklyContributionPesewas > Math.floor(Number.MAX_SAFE_INTEGER / (group.members.length + 1))) {
    throw new SusuError('Adding this member would make the weekly pot exceed the supported amount.');
  }

  group.members.push({ id, name: displayName });
  group.currentContributions[id] = 0;
  return group;
}

export function recordContribution(group, identifier, amountPesewas) {
  const member = findMember(group, identifier);
  if (!member) {
    throw new SusuError(`"${String(identifier).trim()}" is not a member of this group.`);
  }

  if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) {
    throw new SusuError('A contribution must be a positive amount.');
  }

  const paid = group.currentContributions[member.id];
  const remaining = group.weeklyContributionPesewas - paid;

  if (amountPesewas > remaining) {
    throw new SusuError(
      `${member.name} owes ${formatMoney(remaining)}; the payment is too large.`,
    );
  }

  group.currentContributions[member.id] += amountPesewas;
  return {
    member: member.name,
    paidPesewas: group.currentContributions[member.id],
    remainingPesewas: remaining - amountPesewas,
  };
}

export function closeWeek(group) {
  if (group.members.length === 0) {
    throw new SusuError('Add at least one member before closing the week.');
  }

  const owed = group.members
    .map((member) => ({
      member: member.name,
      owedPesewas: group.weeklyContributionPesewas - group.currentContributions[member.id],
    }))
    .filter((entry) => entry.owedPesewas > 0);

  if (owed.length > 0) {
    return { closed: false, week: group.currentWeek, owed };
  }

  const recipient = group.members[group.nextPayoutMemberIndex];
  const payout = {
    week: group.currentWeek,
    recipient: recipient.name,
    amountPesewas: group.weeklyContributionPesewas * group.members.length,
  };
  group.payoutHistory.push(payout);
  group.currentWeek += 1;
  group.nextPayoutMemberIndex = (group.nextPayoutMemberIndex + 1) % group.members.length;
  group.currentContributions = Object.fromEntries(group.members.map((member) => [member.id, 0]));

  return { closed: true, payout };
}

export function getReport(group) {
  return {
    groupName: group.name,
    weeklyContributionPesewas: group.weeklyContributionPesewas,
    currentWeek: group.currentWeek,
    nextRecipient: group.members[group.nextPayoutMemberIndex]?.name ?? null,
    members: group.members.map((member) => {
      const paidPesewas = group.currentContributions[member.id];
      return {
        name: member.name,
        paidPesewas,
        owedPesewas: group.weeklyContributionPesewas - paidPesewas,
        paidInFull: paidPesewas === group.weeklyContributionPesewas,
      };
    }),
    payoutHistory: [...group.payoutHistory],
  };
}

export function validateGroup(group) {
  if (
    !group ||
    typeof group.name !== 'string' ||
    !group.name.trim() ||
    !Number.isSafeInteger(group.weeklyContributionPesewas) ||
    group.weeklyContributionPesewas <= 0 ||
    !Array.isArray(group.members) ||
    !Number.isSafeInteger(group.currentWeek) ||
    group.currentWeek < 1 ||
    !Number.isSafeInteger(group.nextPayoutMemberIndex) ||
    !group.currentContributions ||
    typeof group.currentContributions !== 'object' ||
    Array.isArray(group.currentContributions) ||
    !Array.isArray(group.payoutHistory)
  ) {
    throw new SusuError('The saved susu data is invalid. Restore a valid backup before continuing.');
  }

  const ids = new Set();
  for (const member of group.members) {
    if (
      !member ||
      typeof member.name !== 'string' ||
      !member.name.trim() ||
      typeof member.id !== 'string' ||
      member.id !== member.name.trim().toLocaleLowerCase('en') ||
      ids.has(member.id)
    ) {
      throw new SusuError('The saved susu data contains an invalid or duplicate member.');
    }
    ids.add(member.id);

    const paid = group.currentContributions[member.id];
    if (!Number.isSafeInteger(paid) || paid < 0 || paid > group.weeklyContributionPesewas) {
      throw new SusuError(`The saved contribution for ${member.name} is invalid.`);
    }
  }

  if (
    Object.keys(group.currentContributions).length !== ids.size ||
    (group.members.length === 0
      ? group.nextPayoutMemberIndex !== 0
      : group.nextPayoutMemberIndex >= group.members.length) ||
    group.weeklyContributionPesewas > Math.floor(Number.MAX_SAFE_INTEGER / Math.max(group.members.length, 1)) ||
    group.nextPayoutMemberIndex !==
      (group.members.length === 0 ? 0 : group.payoutHistory.length % group.members.length)
  ) {
    throw new SusuError('The saved susu data has an invalid payout order or contribution ledger.');
  }

  for (const [index, payout] of group.payoutHistory.entries()) {
    if (
      !payout ||
      payout.week !== index + 1 ||
      payout.recipient !== group.members[index % group.members.length]?.name ||
      payout.amountPesewas !== group.weeklyContributionPesewas * group.members.length
    ) {
      throw new SusuError('The saved susu data contains an invalid payout record.');
    }
  }

  if (group.currentWeek !== group.payoutHistory.length + 1) {
    throw new SusuError('The saved susu data has an inconsistent week and payout history.');
  }

  return group;
}
