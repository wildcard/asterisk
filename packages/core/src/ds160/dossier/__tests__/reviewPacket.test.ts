import { describe, expect, it } from 'vitest';
import { DS160_READINESS_CHECKLIST } from '../checklist';
import {
  buildCompleteSyntheticDossier,
  buildSparseFillMappedOnlyDossier,
  cloneDossier,
} from '../fixtures';
import {
  buildDossierReviewPacket,
  renderDossierReviewPacketMarkdown,
} from '../reviewPacket';
import { validateDossierReadiness } from '../validator';

describe('buildDossierReviewPacket', () => {
  it('is deterministic and represents every validator issue exactly once', () => {
    const dossier = buildSparseFillMappedOnlyDossier();
    const report = validateDossierReadiness(dossier);
    const first = buildDossierReviewPacket(dossier);
    const second = buildDossierReviewPacket(cloneDossier(dossier));
    const packetIds = first.families.flatMap((family) => family.items.map((item) => item.checklistId));

    expect(second).toEqual(first);
    expect(first.blockingCount).toBe(report.issues.length);
    expect([...packetIds].sort()).toEqual(report.issues.map((issue) => issue.checklistId).sort());
  });

  it('includes exact checklist labels and a deep-cloned current candidate without applicantRef', () => {
    const dossier = buildSparseFillMappedOnlyDossier();
    dossier.answers['identity.surname'] = {
      status: 'candidate',
      value: 'Candidate-Surname',
      provenance: { source: 'synthetic test evidence', asOf: dossier.asOf },
      review: { reviewed: false },
    };

    const packet = buildDossierReviewPacket(dossier);
    const item = packet.families.flatMap((family) => family.items)
      .find((candidate) => candidate.checklistId === 'identity.surname');

    expect(item?.question).toBe('Surname (legal last name)');
    expect(item?.currentAnswer?.value).toBe('Candidate-Surname');
    expect(JSON.stringify(packet)).not.toContain('fixture-sparse-applicant');

    if (!item?.currentAnswer) throw new Error('test bug: expected a current answer');
    item.currentAnswer.value = 'Packet-only mutation';
    expect(dossier.answers['identity.surname']?.value).toBe('Candidate-Surname');
  });

  it('includes repeatable coverage and entries when a repeatable section blocks', () => {
    const dossier = buildCompleteSyntheticDossier();
    const repeatable = DS160_READINESS_CHECKLIST.find((item) => item.repeatable);
    if (!repeatable) throw new Error('test bug: expected at least one repeatable checklist item');
    const section = dossier.repeatables[repeatable.id];
    if (!section) throw new Error(`test bug: expected repeatable section ${repeatable.id}`);
    section.coverage.status = 'candidate';
    section.coverage.review = { reviewed: false };

    const packet = buildDossierReviewPacket(dossier);
    const item = packet.families.flatMap((family) => family.items)
      .find((candidate) => candidate.checklistBaseId === repeatable.id);

    expect(item?.repeatable).toBe(true);
    expect(item?.currentRepeatable).toEqual(section);
  });

  it('returns an empty review queue for a ready dossier', () => {
    const packet = buildDossierReviewPacket(buildCompleteSyntheticDossier());
    expect(packet.ready).toBe(true);
    expect(packet.blockingCount).toBe(0);
    expect(packet.families).toEqual([]);
  });
});

describe('renderDossierReviewPacketMarkdown', () => {
  it('renders private/review-only warnings, every blocker, and decision prompts', () => {
    const packet = buildDossierReviewPacket(buildSparseFillMappedOnlyDossier());
    const markdown = renderDossierReviewPacketMarkdown(packet);

    expect(markdown).toContain('> PRIVATE:');
    expect(markdown).toContain('> REVIEW ONLY:');
    expect(markdown).toContain(`- Blocking issues: ${packet.blockingCount}`);
    expect(markdown.match(/- Applicant decision:/g)).toHaveLength(packet.blockingCount);
    expect(markdown).toContain('Not applicable only when the checklist permits it');
    for (const item of packet.families.flatMap((family) => family.items)) {
      expect(markdown).toContain(`\`${item.checklistId}\``);
      expect(markdown).toContain(`### ${item.question}`);
    }
  });

  it('renders a distinct zero-blocker result without a decision prompt', () => {
    const packet = buildDossierReviewPacket(buildCompleteSyntheticDossier());
    const markdown = renderDossierReviewPacketMarkdown(packet);
    expect(markdown).toContain('No blocking issues remain.');
    expect(markdown).not.toContain('- Applicant decision:');
  });
});
