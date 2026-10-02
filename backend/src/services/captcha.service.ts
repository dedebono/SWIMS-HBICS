/**
 * Simple in-memory captcha service.
 * Generates random math-question captchas (e.g., "What is 3 + 5?").
 * Answers are stored in a Map keyed by captcha ID (5-minute TTL).
 */

import { randomUUID } from 'crypto';

interface Captcha {
  id: string;
  question: string;
  answer: number;
  expiresAt: number;
}

// In-memory store — fine for single-instance dev; swap for Redis in prod
const captchas = new Map<string, Captcha>();

const TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateMathQuestion(): { question: string; answer: number } {
  const a = Math.floor(Math.random() * 10) + 1; // 1–10
  const b = Math.floor(Math.random() * 10) + 1; // 1–10
  const ops = ['+', '-', '*'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let answer: number;
  let question: string;

  switch (op) {
    case '+':
      answer = a + b;
      question = `What is ${a} + ${b}?`;
      break;
    case '-':
      // Ensure non-negative result
      answer = Math.max(a, b) - Math.min(a, b);
      const [big, small] = a >= b ? [a, b] : [b, a];
      question = `What is ${big} − ${small}?`;
      break;
    case '*':
      // Keep factors small for simple multiplication
      const fa = Math.floor(Math.random() * 5) + 1; // 1–5
      const fb = Math.floor(Math.random() * 5) + 1; // 1–5
      answer = fa * fb;
      question = `What is ${fa} × ${fb}?`;
      break;
  }

  return { question, answer };
}

/**
 * Creates a new captcha, returns its public representation.
 */
export function createCaptcha(): { id: string; question: string } {
  const { question, answer } = generateMathQuestion();
  const id = randomUUID().slice(0, 12);
  const captcha: Captcha = {
    id,
    question,
    answer,
    expiresAt: Date.now() + TTL_MS,
  };
  captchas.set(id, captcha);
  return { id, question };
}

/**
 * Verifies a captcha answer. Returns true if valid and not expired.
 * Consumes the captcha (one-time use).
 */
export function verifyCaptcha(id: string, userAnswer: string): boolean {
  const captcha = captchas.get(id);
  if (!captcha) return false;
  if (Date.now() > captcha.expiresAt) {
    captchas.delete(id);
    return false;
  }
  const expected = captcha.answer.toString();
  const valid = userAnswer.trim() === expected;
  captchas.delete(id); // consume
  return valid;
}
