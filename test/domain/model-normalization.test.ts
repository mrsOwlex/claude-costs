import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, MODEL_ALIASES } from '../../src/domain/model-normalization.js';

test('strips anthropic. prefix', () => {
  assert.equal(normalizeModel('anthropic.claude-opus-4-6'), 'claude-opus-4-6');
});

test('strips version suffix -v1:0', () => {
  assert.equal(normalizeModel('claude-opus-4-6-v1:0'), 'claude-opus-4-6');
});

test('applies known alias with date suffix', () => {
  assert.equal(normalizeModel('claude-opus-4-5-20251101'), 'claude-opus-4-5');
});

test('applies known alias without date suffix', () => {
  assert.equal(normalizeModel('claude-sonnet-4-20250514'), 'claude-sonnet-4-5');
});

test('strips date suffix for unknown models', () => {
  assert.equal(normalizeModel('claude-opus-4-6-20261231'), 'claude-opus-4-6');
});

test('returns unknown for null', () => {
  assert.equal(normalizeModel(null), 'unknown');
});

test('returns unknown for undefined', () => {
  assert.equal(normalizeModel(undefined), 'unknown');
});

test('returns unknown for non-string', () => {
  assert.equal(normalizeModel(123), 'unknown');
});

test('trims whitespace', () => {
  assert.equal(normalizeModel('  claude-opus-4-6  '), 'claude-opus-4-6');
});

test('MODEL_ALIASES contains expected entries', () => {
  assert.equal(MODEL_ALIASES['claude-opus-4-5-20251101'], 'claude-opus-4-5');
  assert.equal(MODEL_ALIASES['claude-haiku-4-5-20251001'], 'claude-haiku-4-5');
});
