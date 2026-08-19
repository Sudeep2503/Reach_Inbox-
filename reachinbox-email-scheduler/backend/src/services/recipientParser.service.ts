import Papa from 'papaparse';
import { ApiError } from '../utils/apiError.js';

export interface ParseResult {
  validEmails: string[];
  summary: {
    totalRowsProcessed: number;
    validEmails: number;
    invalidEmails: number;
    duplicateEmails: number;
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const recipientParserService = {
  parseRecipients(buffer: Buffer, filename: string): ParseResult {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension || (extension !== 'csv' && extension !== 'txt')) {
      throw ApiError.badRequest('Unsupported file extension. Only .csv and .txt are supported.', 'UNSUPPORTED_FILE_TYPE');
    }

    const content = buffer.toString('utf8');
    if (!content.trim()) {
      throw ApiError.badRequest('The uploaded file is empty.', 'EMPTY_FILE');
    }

    const validNormalizedSet = new Set<string>();
    const validEmails: string[] = [];
    let totalRowsProcessed = 0;
    let invalidEmails = 0;
    let duplicateEmails = 0;

    if (extension === 'csv') {
      const parseResult = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: 'greedy',
      });

      const rows = parseResult.data;
      totalRowsProcessed = rows.length;

      for (const row of rows) {
        let emailCandidate: string | null = null;
        const keys = Object.keys(row);

        // 1. Prefer key matching 'email' (case-insensitive)
        const emailKey = keys.find((k) => k.toLowerCase().trim() === 'email');
        if (emailKey) {
          emailCandidate = row[emailKey] ?? null;
        } else {
          // 2. Fallback to scanning all columns for the first valid-looking email
          for (const k of keys) {
            const val = String(row[k] ?? '').trim();
            if (EMAIL_REGEX.test(val)) {
              emailCandidate = val;
              break;
            }
          }
        }

        if (emailCandidate) {
          const normalized = emailCandidate.trim().toLowerCase().replace(/^['"]|['"]$/g, '');
          if (EMAIL_REGEX.test(normalized)) {
            if (validNormalizedSet.has(normalized)) {
              duplicateEmails++;
            } else {
              validNormalizedSet.add(normalized);
              validEmails.push(normalized);
            }
          } else {
            invalidEmails++;
          }
        } else {
          invalidEmails++;
        }
      }
    } else {
      // txt support: split by newlines, spaces, commas, or semicolons
      // Filter out empty spaces
      const candidates = content.split(/[\r\n\s,;]+/).map((c) => c.trim()).filter(Boolean);
      totalRowsProcessed = candidates.length;

      for (const candidate of candidates) {
        const normalized = candidate.toLowerCase().replace(/^['"]|['"]$/g, '');
        if (EMAIL_REGEX.test(normalized)) {
          if (validNormalizedSet.has(normalized)) {
            duplicateEmails++;
          } else {
            validNormalizedSet.add(normalized);
            validEmails.push(normalized);
          }
        } else {
          invalidEmails++;
        }
      }
    }

    return {
      validEmails,
      summary: {
        totalRowsProcessed,
        validEmails: validEmails.length,
        invalidEmails,
        duplicateEmails,
      },
    };
  },
};
