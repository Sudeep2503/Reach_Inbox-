import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const storage = multer.memoryStorage();

export const uploadLeads = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'txt') {
      return cb(ApiError.badRequest('Unsupported file extension. Only .csv and .txt are allowed.', 'UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
}).single('file');
