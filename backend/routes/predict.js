import express from 'express';
import { serveStoredPrediction } from '../utils/storedPrediction.js';

const router = express.Router();
router.post('/', serveStoredPrediction);
export default router;
