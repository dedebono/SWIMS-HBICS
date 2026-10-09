import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  RateLimitError,
} from '../../utils/errors.js';

/**
 * The global error handler maps `statusCode` straight onto the HTTP response.
 * If these numbers drift, a permission check starts returning 500s (or worse,
 * a validation slip starts leaking as a 200) — so pin them here.
 */
describe('utils/errors', () => {
  /**
   * Each entry pairs a factory with the status that constructor must produce.
   * `NotFoundError` is excluded here because its first argument is a RESOURCE
   * name, not a message — it always appends "not found" (covered separately
   * in its own describe block below).
   */
  const cases: Array<[string, (msg: string) => AppError, number]> = [
    ['ForbiddenError', (m: string) => new ForbiddenError(m), 403],
    ['UnauthorizedError', (m: string) => new UnauthorizedError(m), 401],
    ['ValidationError', (m: string) => new ValidationError(m), 400],
    ['ConflictError', (m: string) => new ConflictError(m), 409],
  ];

  for (const [name, Ctor, status] of cases) {
    describe(name, () => {
      it(`maps to HTTP ${status}`, () => {
        expect(Ctor('x').statusCode).toBe(status);
      });

      it('is an AppError, so the handler treats it as operational', () => {
        const err = Ctor('x');
        expect(err).toBeInstanceOf(AppError);
        expect(err).toBeInstanceOf(Error);
        expect(err.isOperational).toBe(true);
      });

      it('keeps the message for the client', () => {
        expect(Ctor('pesan khusus').message).toBe('pesan khusus');
      });
    });
  }

  describe('NotFoundError', () => {
    it('maps to HTTP 404', () => {
      expect(new NotFoundError('Student').statusCode).toBe(404);
    });

    it('is an operational AppError', () => {
      const err = new NotFoundError('Student');
      expect(err).toBeInstanceOf(AppError);
      expect(err.isOperational).toBe(true);
    });

    it("renders \"<resource> with id '<id>' not found\" when given an id", () => {
      expect(new NotFoundError('Student', 'stu-99').message).toBe("Student with id 'stu-99' not found");
    });

    it('renders "<resource> not found" when no id is supplied', () => {
      expect(new NotFoundError('Avatar').message).toBe('Avatar not found');
    });

    it('does not leak the id into the status code', () => {
      expect(new NotFoundError('Student', 'stu-99').statusCode).toBe(404);
    });
  });

  describe('RateLimitError', () => {
    it('maps to HTTP 429', () => {
      expect(new RateLimitError(60).statusCode).toBe(429);
    });

    it('names the retry delay in the message', () => {
      expect(new RateLimitError(90).message).toContain('90 seconds');
    });
  });

  describe('ValidationError', () => {
    it('maps to HTTP 400', () => {
      expect(new ValidationError('bad input').statusCode).toBe(400);
    });

    it('carries structured details when provided', () => {
      const err = new ValidationError('invalid', { field: 'email' });
      expect(err.details).toEqual({ field: 'email' });
    });

    it('leaves details undefined when not provided', () => {
      expect(new ValidationError('invalid').details).toBeUndefined();
    });
  });

  describe('AppError', () => {
    it('defaults to a 500 and isOperational=true', () => {
      const err = new AppError('boom');
      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(true);
    });

    it('accepts an explicit status code', () => {
      expect(new AppError('teapot', 418).statusCode).toBe(418);
    });

    it('can be marked non-operational so the handler reports a 500', () => {
      expect(new AppError('unexpected', 500, false).isOperational).toBe(false);
    });

    it('survives instanceof after subclassing (prototype chain is repaired)', () => {
      // Object.setPrototypeOf in the base ctor is what makes this work; without
      // it a down-transpiled subclass fails `instanceof` and leaks as a 500.
      expect(new ValidationError('x')).toBeInstanceOf(ValidationError);
      expect(new ValidationError('x')).toBeInstanceOf(AppError);
    });
  });

  it('gives each error class a distinct status code', () => {
    const statuses = [
      new NotFoundError('x').statusCode,
      new ForbiddenError().statusCode,
      new UnauthorizedError().statusCode,
      new ValidationError('x').statusCode,
      new ConflictError('x').statusCode,
      new RateLimitError(1).statusCode,
    ];
    expect(new Set(statuses).size).toBe(statuses.length);
  });
});