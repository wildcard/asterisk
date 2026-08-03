/**
 * Deterministic, local-only HITL review packets for DS-160 dossiers.
 *
 * The packet deliberately contains the dossier values that need review, so
 * callers must treat its serialized form as private applicant data. This
 * module performs no I/O, never changes answer status, and has no connection
 * to CEAC or any browser automation.
 */

import { DS160_READINESS_CHECKLIST, getChecklistItem } from './checklist';
import type { ChecklistFamily, ChecklistItemDef } from './checklist';
import type { Dossier, DossierAnswer, RepeatableSection } from './types';
import { validateDossierReadiness } from './validator';
import type { ReadinessIssue, ReadinessIssueCode } from './validator';

export interface DossierReviewItem {
  checklistId: string;
  checklistBaseId: string;
  family: ChecklistFamily;
  question: string;
  issueCode: ReadinessIssueCode;
  issueMessage: string;
  valueKind?: ChecklistItemDef['valueKind'];
  fields?: ChecklistItemDef['fields'];
  optional?: boolean;
  conditional?: ChecklistItemDef['conditional'];
  repeatable: boolean;
  currentAnswer?: DossierAnswer;
  currentRepeatable?: RepeatableSection;
}

export interface DossierReviewFamily {
  family: ChecklistFamily;
  blockingCount: number;
  items: DossierReviewItem[];
}

export interface DossierReviewPacket {
  schemaVersion: 1;
  dossierAsOf: string;
  ready: boolean;
  totalChecklistItems: number;
  confirmedCount: number;
  blockingCount: number;
  families: DossierReviewFamily[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function baseChecklistId(checklistId: string): string {
  const bracketIndex = checklistId.indexOf('[');
  return bracketIndex === -1 ? checklistId : checklistId.slice(0, bracketIndex);
}

function itemForIssue(dossier: Dossier, issue: ReadinessIssue): DossierReviewItem {
  const checklistBaseId = baseChecklistId(issue.checklistId);
  const definition = getChecklistItem(checklistBaseId);
  const repeatable = definition?.repeatable === true;

  return {
    checklistId: issue.checklistId,
    checklistBaseId,
    family: issue.family,
    question: definition?.label ?? (issue.checklistId === '__dossier__.asOf' ? 'Dossier as-of date' : issue.checklistId),
    issueCode: issue.code,
    issueMessage: issue.message,
    valueKind: definition?.valueKind,
    fields: definition?.fields ? cloneJson(definition.fields) : undefined,
    optional: definition?.optional,
    conditional: definition?.conditional ? cloneJson(definition.conditional) : undefined,
    repeatable,
    currentAnswer: !repeatable && dossier.answers[checklistBaseId]
      ? cloneJson(dossier.answers[checklistBaseId])
      : undefined,
    currentRepeatable: repeatable && dossier.repeatables[checklistBaseId]
      ? cloneJson(dossier.repeatables[checklistBaseId])
      : undefined,
  };
}

/**
 * Build a complete review packet from the validator's exact blocking queue.
 * One packet item is emitted for every readiness issue; no issue is hidden,
 * merged, inferred, or automatically resolved.
 */
export function buildDossierReviewPacket(dossier: Dossier): DossierReviewPacket {
  const report = validateDossierReadiness(dossier);
  const familyOrder = new Map(DS160_READINESS_CHECKLIST.map((item, index) => [item.family, index]));
  const grouped = new Map<ChecklistFamily, DossierReviewItem[]>();

  for (const issue of report.issues) {
    const items = grouped.get(issue.family) ?? [];
    items.push(itemForIssue(dossier, issue));
    grouped.set(issue.family, items);
  }

  const families = Array.from(grouped.entries())
    .sort(([left], [right]) => (familyOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (familyOrder.get(right) ?? Number.MAX_SAFE_INTEGER))
    .map(([family, items]) => ({ family, blockingCount: items.length, items }));

  return {
    schemaVersion: 1,
    dossierAsOf: report.dossierAsOf,
    ready: report.ready,
    totalChecklistItems: report.totalChecklistItems,
    confirmedCount: report.confirmedCount,
    blockingCount: report.issues.length,
    families,
  };
}

function jsonFence(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  const longestRun = Math.max(2, ...(json.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  return `${fence}json\n${json}\n${fence}`;
}

function humanizeFamily(family: ChecklistFamily): string {
  return family.split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

/** Render a pasteable Markdown HITL document without changing the dossier. */
export function renderDossierReviewPacketMarkdown(packet: DossierReviewPacket): string {
  const lines: string[] = [
    '# DS-160 dossier human review',
    '',
    '> PRIVATE: This packet may contain applicant personal information. Keep it out of Git, issue trackers, logs, and public chats.',
    '> REVIEW ONLY: This document does not access CEAC, fill a form, save, sign, submit, or confirm any answer automatically.',
    '',
    `- Dossier as of: ${packet.dossierAsOf}`,
    `- Ready: ${packet.ready}`,
    `- Checklist items: ${packet.totalChecklistItems}`,
    `- Confirmed items: ${packet.confirmedCount}`,
    `- Blocking issues: ${packet.blockingCount}`,
    '',
  ];

  if (packet.blockingCount === 0) {
    lines.push('No blocking issues remain. A human must still perform the separate final review before any live-form work.', '');
    return lines.join('\n');
  }

  for (const family of packet.families) {
    lines.push(`## ${humanizeFamily(family.family)} (${family.blockingCount})`, '');
    for (const item of family.items) {
      lines.push(
        `### ${item.question}`,
        '',
        `- Checklist ID: \`${item.checklistId}\``,
        `- Blocking reason: \`${item.issueCode}\` — ${item.issueMessage}`,
      );

      if (item.currentAnswer) {
        lines.push('- Current answer candidate:', '', jsonFence(item.currentAnswer), '');
      } else if (item.currentRepeatable) {
        lines.push('- Current repeatable-section candidate:', '', jsonFence(item.currentRepeatable), '');
      } else {
        lines.push('- Current answer candidate: none', '');
      }

      lines.push(
        '- Applicant decision: [ ] Confirm as written  [ ] Correct it  [ ] Provide missing answer  [ ] Not applicable only when the checklist permits it',
        '- Applicant correction or note:',
        '',
        '---',
        '',
      );
    }
  }

  return lines.join('\n');
}
