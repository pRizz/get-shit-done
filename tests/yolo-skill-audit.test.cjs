const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_PATH = path.join(ROOT, 'docs', 'SKILL-AUDIT-YOLO.md');
const COMMANDS_DIR = path.join(ROOT, 'commands', 'gsd');
const WORKFLOWS_DIR = path.join(ROOT, 'get-shit-done', 'workflows');

describe('yolo skill audit document', () => {
  const audit = fs.readFileSync(AUDIT_PATH, 'utf8');

  test('audit doc exists', () => {
    assert.ok(fs.existsSync(AUDIT_PATH), 'docs/SKILL-AUDIT-YOLO.md should exist');
  });

  test('audit doc contains one section per yolo target', () => {
    assert.ok(audit.includes('### `gsd-yolo-discuss`'), 'audit should cover gsd-yolo-discuss');
    assert.ok(audit.includes('### `gsd-yolo-discuss-plan-and-execute`'), 'audit should cover gsd-yolo-discuss-plan-and-execute');
    assert.ok(audit.includes('### `gsd-yolo-discuss-plan-execute-commit-and-push`'), 'audit should cover strict push wrapper');
    assert.ok(audit.includes('### `gsd-yolo-discuss-plan-execute-commit-and-push-all`'), 'audit should cover strict push all alias');
    assert.ok(audit.includes('### `gsd-autonomous --yolo`'), 'audit should cover autonomous yolo mode');
  });

  test('audit doc records autonomous yolo as the only current high-value future candidate', () => {
    assert.ok(
      audit.includes('Only current high-value candidate for future sub-agent expansion'),
      'audit should record autonomous yolo as the only current candidate'
    );
    assert.ok(
      audit.includes('No wrapper-level sub-agent expansion is currently recommended.'),
      'audit should reject wrapper-level expansion for the audited yolo skills'
    );
  });
});

describe('yolo wrapper wording reflects thin-wrapper audit conclusions', () => {
  const yoloDiscussCommand = fs.readFileSync(path.join(COMMANDS_DIR, 'yolo-discuss.md'), 'utf8');
  const yoloChainCommand = fs.readFileSync(path.join(COMMANDS_DIR, 'yolo-discuss-plan-and-execute.md'), 'utf8');
  const yoloPushCommand = fs.readFileSync(path.join(COMMANDS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'), 'utf8');
  const yoloAllCommand = fs.readFileSync(path.join(COMMANDS_DIR, 'yolo-discuss-plan-execute-commit-and-push-all.md'), 'utf8');
  const yoloDiscussWorkflow = fs.readFileSync(path.join(WORKFLOWS_DIR, 'yolo-discuss.md'), 'utf8');
  const yoloChainWorkflow = fs.readFileSync(path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-and-execute.md'), 'utf8');
  const yoloPushWorkflow = fs.readFileSync(path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push.md'), 'utf8');
  const yoloAllWorkflow = fs.readFileSync(path.join(WORKFLOWS_DIR, 'yolo-discuss-plan-execute-commit-and-push-all.md'), 'utf8');

  test('wrapper command descriptions/objectives explicitly call out thin delegation where useful', () => {
    assert.ok(yoloDiscussCommand.includes('Thin wrapper'), 'yolo-discuss command should call out thin-wrapper status');
    assert.ok(yoloChainCommand.includes('relies on downstream agentized workflows'), 'yolo chain command should mention downstream agentized workflows');
    assert.ok(yoloPushCommand.includes('git finalization stays inline for determinism'), 'strict push command should mention inline git gate');
    assert.ok(yoloAllCommand.includes('should stay declarative'), 'all alias command should call out declarative nature');
  });

  test('wrapper workflows explicitly reject wrapper-level sub-agent additions', () => {
    assert.ok(yoloDiscussWorkflow.includes('No wrapper-level sub-agent is needed'), 'yolo-discuss workflow should reject wrapper-level sub-agents');
    assert.ok(yoloChainWorkflow.includes('delegated workflows already perform the agentized work'), 'yolo chain workflow should defer to downstream agentized work');
    assert.ok(yoloPushWorkflow.includes('git finalization should stay inline'), 'strict push workflow should keep git gate inline');
    assert.ok(yoloAllWorkflow.includes('declarative alias over autonomous yolo strict-push mode'), 'all alias workflow should stay declarative');
  });
});
