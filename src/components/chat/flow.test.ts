import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReturnAnswerData, getManualReturnAction, isReturnIntentText, resolveMemoryReplyMessage, selectTurnMode } from './flow'

test('selectTurnMode uses memory during the first memory phase', () => {
  assert.equal(selectTurnMode('await_memory', false, 'A memory', 'en'), 'memory')
})

test('selectTurnMode uses question during the normal question phase', () => {
  assert.equal(selectTurnMode('await_question', true, 'What do people remember?', 'en'), 'question')
})

test('selectTurnMode routes question-like confirm-more input to question mode', () => {
  assert.equal(selectTurnMode('confirm_more', true, 'What do people say about care?', 'en'), 'question')
})

test('selectTurnMode routes non-question confirm-more input to memory mode', () => {
  assert.equal(selectTurnMode('confirm_more', true, 'Another summer memory', 'en'), 'memory')
})

test('resolveMemoryReplyMessage returns sanitized backend text when present', () => {
  assert.deepEqual(
    resolveMemoryReplyMessage({ message: '**This** reminds us of someone.' }, 'en'),
    { text: 'This reminds us of someone.', usedFallback: false }
  )
})

test('resolveMemoryReplyMessage falls back to the scripted english line when missing', () => {
  assert.deepEqual(
    resolveMemoryReplyMessage({ message: '' }, 'en'),
    {
      text: 'Your memory reminds me of others who hope for care and closeness. Your memory is now part of the continuOnus landscape.',
      usedFallback: true,
    }
  )
})

test('resolveMemoryReplyMessage falls back to the scripted danish line when missing', () => {
  assert.deepEqual(
    resolveMemoryReplyMessage({ message: '' }, 'da'),
    {
      text: 'Dit minde minder mig om andres håb om omsorg og nærhed. Nu er dit minde en del af continuOnus-landskabet.',
      usedFallback: true,
    }
  )
})

test('getManualReturnAction asks for destination when the visitor has contributed', () => {
  assert.equal(getManualReturnAction('confirm_more', false), 'farewell')
  assert.equal(getManualReturnAction('confirm_more', true), 'ask_for_destination')
})

test('getManualReturnAction exits immediately on the second return press while waiting for an answer', () => {
  assert.equal(getManualReturnAction('await_return', true), 'farewell')
})

test('isReturnIntentText treats "no" as return intent in english', () => {
  assert.equal(isReturnIntentText('No', 'en'), true)
  assert.equal(isReturnIntentText('no thanks', 'en'), true)
})

test('isReturnIntentText treats "nej" as return intent in danish', () => {
  assert.equal(isReturnIntentText('Nej', 'da'), true)
  assert.equal(isReturnIntentText('nej tak', 'da'), true)
})

test('buildReturnAnswerData stores the return-answer key expected by the archive view', () => {
  assert.deepEqual(buildReturnAnswerData('Towards each other.'), {
    returnPromptAnswer: 'Towards each other.',
    returnPromptStage: 'answered',
  })
})
